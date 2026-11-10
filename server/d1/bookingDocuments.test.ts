import { readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { drizzle as sqliteProxy } from "drizzle-orm/sqlite-proxy";
import { beforeEach, describe, expect, it } from "vitest";
import { authSchema } from "../../drizzle/auth-schema";
import { d1Schema } from "../../drizzle/d1-schema";
import type { D1ScopedDatabase } from "../db/scope";
import { getBookingDocument, getInvoiceSettings, issueBookingDocument, listBookingDocuments, listHotelDocuments, saveInvoiceSettings } from "./bookingDocuments";

const migrationFolder = resolve(dirname(fileURLToPath(import.meta.url)), "../../drizzle/d1");
const { DatabaseSync } = process.getBuiltinModule("node:sqlite") as typeof import("node:sqlite");
let sqlite: InstanceType<typeof DatabaseSync>;
let db: D1ScopedDatabase;

const NOW = new Date("2026-11-06T20:00:00.000Z"); // 03:00 on 7 Nov in Thailand
const owner = { userId: "owner" };
const exec = (query: string, ...params: Array<string | number | null>) => sqlite.prepare(query).run(...params);
const header = { enabled: true, issuerName: "บริษัท ลานนา จำกัด", address: "1 Road", taxId: "0105555555555", branch: "สำนักงานใหญ่", phone: null, vatEnabled: true, vatRate: 7, withholdingEnabled: true, withholdingRate: 3 };
const buyer = { name: "Guest Co", address: "2 Road", taxId: null, branch: null };

beforeEach(() => {
  sqlite = new DatabaseSync(":memory:");
  sqlite.exec("PRAGMA foreign_keys = ON");
  for (const file of readdirSync(migrationFolder).filter(name => name.endsWith(".sql")).sort()) {
    const source = readFileSync(resolve(migrationFolder, file), "utf8");
    for (const statement of source.split("--> statement-breakpoint")) if (statement.trim()) sqlite.exec(statement);
  }
  db = sqliteProxy(async (query, params, method) => {
    const statement = sqlite.prepare(query);
    statement.setReturnArrays(true);
    if (method === "run") { statement.run(...params as never[]); return { rows: [] }; }
    if (method === "get") { const row = statement.get(...params as never[]); return { rows: row ? [row] : [] }; }
    return { rows: statement.all(...params as never[]) };
  }, { schema: { ...d1Schema, ...authSchema } }) as unknown as D1ScopedDatabase;

  for (const id of ["h1", "h2"]) {
    exec(`insert into hotels (id, name, slug, address, owner_contact) values (?, ?, ?, 'Addr', 'o@example.test')`, id, `Hotel ${id}`, id);
    exec(`insert into room_types (id, hotel_id, name, capacity, base_price) values (?, ?, 'Deluxe', 2, '100')`, `rt-${id}`, id);
    exec(`insert into rooms (id, hotel_id, room_type_id, room_number) values (?, ?, ?, '1')`, `r-${id}`, id, `rt-${id}`);
  }
  exec(`insert into hotel_users (id, hotel_id, user_id, role) values ('own-h1', 'h1', 'owner', 'hotel_owner')`);
  exec(`insert into bookings (id, hotel_id, room_id, guest_name, check_in, check_out, price, status, payment_status, payment_method)
    values ('paid', 'h1', 'r-h1', 'Guest', '2026-12-01', '2026-12-03', '1070.00', 'confirmed', 'verified', 'promptpay')`);
  exec(`insert into bookings (id, hotel_id, room_id, guest_name, check_in, check_out, price, status, payment_status)
    values ('unpaid', 'h1', 'r-h1', 'Guest', '2026-12-05', '2026-12-06', '500', 'confirmed', 'unpaid')`);
  exec(`insert into bookings (id, hotel_id, room_id, guest_name, check_in, check_out, price, status, payment_status)
    values ('cancelled', 'h1', 'r-h1', 'Guest', '2026-12-07', '2026-12-08', '500', 'cancelled', 'verified')`);
});

describe("bill header", () => {
  it("saves and updates the header for one hotel", async () => {
    expect(await getInvoiceSettings(db, owner, "h1")).toBeNull();
    await saveInvoiceSettings(db, owner, "h1", header, NOW);
    await saveInvoiceSettings(db, owner, "h1", { ...header, branch: "สาขา 1" }, NOW);
    expect(await getInvoiceSettings(db, owner, "h1")).toMatchObject({ issuerName: header.issuerName, branch: "สาขา 1", enabled: true });
  });

  it("refuses another hotel's header", async () => {
    await expect(saveInvoiceSettings(db, owner, "h2", header, NOW)).rejects.toThrow();
  });

  it("refuses a tax ID that is not 13 digits at the database", () => {
    expect(() => exec(`insert into hotel_invoice_settings (hotel_id, issuer_name, address, tax_id) values ('h1', 'A', 'B', '123')`)).toThrow();
  });
});

describe("issuing documents", () => {
  beforeEach(async () => { await saveInvoiceSettings(db, owner, "h1", header, NOW); });

  it("numbers receipts and tax invoices separately and keeps the issued snapshot", async () => {
    const first = await issueBookingDocument(db, owner, "h1", { bookingId: "paid", type: "receipt", buyer }, NOW);
    const second = await issueBookingDocument(db, owner, "h1", { bookingId: "paid", type: "receipt", buyer }, NOW);
    const tax = await issueBookingDocument(db, owner, "h1", { bookingId: "paid", type: "tax_invoice", buyer }, NOW);

    expect([first.number, second.number, tax.number]).toEqual(["RC-000001", "RC-000002", "TX-000001"]);
    expect(first).toMatchObject({ issuedOn: "2026-11-07", subtotalSatang: 100000, totalSatang: 107000, vatEnabled: true, vatRate: 7, vatSatang: 7000, withholdingEnabled: true, withholdingRate: 3, withholdingSatang: 3000, netToPaySatang: 104000, booking: { nights: 2, roomType: "Deluxe", paymentMethod: "promptpay" } });
    expect(tax).toMatchObject({ vatSatang: 7000, withholdingSatang: 3000, netToPaySatang: 104000, issuer: { taxId: header.taxId } });

    await saveInvoiceSettings(db, owner, "h1", { ...header, issuerName: "New name" }, NOW);
    const listed = await listBookingDocuments(db, owner, "h1", "paid");
    expect(listed).toHaveLength(3);
    expect(listed.every(row => row.snapshot.issuer.name === header.issuerName)).toBe(true);
    expect(listed.every(row => row.snapshot.vatRate === 7 && row.snapshot.withholdingRate === 3)).toBe(true);
  });

  it("refuses unpaid and cancelled bookings", async () => {
    await expect(issueBookingDocument(db, owner, "h1", { bookingId: "unpaid", type: "receipt", buyer }, NOW)).rejects.toThrow(/paid booking/);
    await expect(issueBookingDocument(db, owner, "h1", { bookingId: "cancelled", type: "receipt", buyer }, NOW)).rejects.toThrow(/paid booking/);
  });

  it("needs the switch on, the hotel tax ID and the buyer address for a tax invoice", async () => {
    await expect(issueBookingDocument(db, owner, "h1", { bookingId: "paid", type: "tax_invoice", buyer: { ...buyer, address: null } }, NOW)).rejects.toThrow(/buyer's address/);
    await saveInvoiceSettings(db, owner, "h1", { ...header, taxId: null }, NOW);
    await expect(issueBookingDocument(db, owner, "h1", { bookingId: "paid", type: "tax_invoice", buyer }, NOW)).rejects.toThrow(/tax ID/);
    await saveInvoiceSettings(db, owner, "h1", { ...header, enabled: false }, NOW);
    await expect(issueBookingDocument(db, owner, "h1", { bookingId: "paid", type: "receipt", buyer }, NOW)).rejects.toThrow(/Turn on/);
  });

  it("refuses a booking or hotel the caller does not hold", async () => {
    await expect(issueBookingDocument(db, owner, "h2", { bookingId: "paid", type: "receipt", buyer }, NOW)).rejects.toThrow();
    await expect(listBookingDocuments(db, owner, "h2", "paid")).rejects.toThrow();
    await expect(listHotelDocuments(db, owner, "h2")).rejects.toThrow();
  });

  it("issues invoices for unpaid bookings with itemized room charges and extra services", async () => {
    exec(`insert into booking_services (id, booking_id, service_name, pricing_model, unit_price, quantity, total_price)
      values ('svc-1', 'unpaid', 'Airport Transfer', 'ONE_TIME', '200.00', 1, '200.00')`);

    const inv = await issueBookingDocument(db, owner, "h1", { bookingId: "unpaid", type: "invoice", buyer }, NOW);
    expect(inv.number).toBe("INV-000001");
    expect(inv.type).toBe("invoice");
    expect(inv.amountPaidSatang).toBe(0);
    expect(inv.balanceSatang).toBe(inv.totalSatang);
    expect(inv.paymentStatus).toBe("unpaid");

    expect(inv.items).toHaveLength(2);
    expect(inv.items?.[0]).toMatchObject({ name: "Room: Deluxe", quantity: 1 });
    expect(inv.items?.[1]).toMatchObject({ name: "Airport Transfer", quantity: 1, unitPriceSatang: 20000, totalPriceSatang: 20000 });

    // Cancelled bookings cannot get invoices
    await expect(issueBookingDocument(db, owner, "h1", { bookingId: "cancelled", type: "invoice", buyer }, NOW))
      .rejects.toThrow(/cancelled or expired/);

    // listHotelDocuments returns all issued documents for the hotel
    const hotelDocs = await listHotelDocuments(db, owner, "h1");
    expect(hotelDocs.length).toBeGreaterThanOrEqual(1);
    expect(hotelDocs[0]?.docNumber).toBe("INV-000001");
    expect(hotelDocs[0]?.guestName).toBe("Guest");
  });

  it("fetches a document by id and enforces tenant isolation", async () => {
    const inv = await issueBookingDocument(db, owner, "h1", { bookingId: "unpaid", type: "invoice", buyer }, NOW);
    const [listed] = await listBookingDocuments(db, owner, "h1", "unpaid");
    expect(listed).toBeDefined();

    const fetched = await getBookingDocument(db, owner, "h1", listed!.id);
    expect(fetched.snapshot.number).toBe(inv.number);

    // Cannot fetch across hotels
    await expect(getBookingDocument(db, owner, "h2", listed!.id)).rejects.toThrow();

    // Throws NOT_FOUND for unknown document
    await expect(getBookingDocument(db, owner, "h1", "non-existent")).rejects.toThrow(/not found/i);
  });

  it("prevents duplicate document numbers and enforces unique constraint at database level", async () => {
    // 1. Issuing two invoices increments seq collision-free
    const first = await issueBookingDocument(db, owner, "h1", { bookingId: "unpaid", type: "invoice", buyer }, NOW);
    const second = await issueBookingDocument(db, owner, "h1", { bookingId: "unpaid", type: "invoice", buyer }, NOW);
    expect(first.number).toBe("INV-000001");
    expect(second.number).toBe("INV-000002");

    // 2. Direct database insert with duplicate seq is blocked by unique constraint
    expect(() => {
      exec(`insert into booking_documents (id, hotel_id, booking_id, doc_type, seq, doc_number, snapshot_json, created_at)
        values ('dup', 'h1', 'unpaid', 'invoice', 1, 'INV-000001', '{}', 1700000000000)`);
    }).toThrow(/UNIQUE constraint failed/);
  });

  it("retains immutable snapshot across hotel setting changes and re-downloads", async () => {
    // Issue initial receipt
    const initial = await issueBookingDocument(db, owner, "h1", { bookingId: "paid", type: "receipt", buyer }, NOW);
    expect(initial.number).toBe("RC-000001");
    expect(initial.issuer.name).toBe("บริษัท ลานนา จำกัด");
    expect(initial.totalSatang).toBe(107000);

    // Mutate hotel invoice settings (change name, address, tax ID, VAT rate)
    await saveInvoiceSettings(db, owner, "h1", {
      ...header,
      issuerName: "New Renamed Hotel Co Ltd",
      address: "999 New Address",
      vatRate: 10,
    }, NOW);

    // Mutate the original booking price in the database
    exec(`update bookings set price = '9999.00' where id = 'paid'`);

    // Fetch the issued document again
    const [listed] = await listBookingDocuments(db, owner, "h1", "paid");
    expect(listed).toBeDefined();
    const fetched = await getBookingDocument(db, owner, "h1", listed!.id);

    // Snapshot is strictly immutable: original issuer name, VAT rate, and total are unchanged!
    expect(fetched.snapshot.number).toBe("RC-000001");
    expect(fetched.snapshot.issuer.name).toBe("บริษัท ลานนา จำกัด");
    expect(fetched.snapshot.issuer.address).toBe("1 Road");
    expect(fetched.snapshot.vatRate).toBe(7);
    expect(fetched.snapshot.totalSatang).toBe(107000);
  });
});

