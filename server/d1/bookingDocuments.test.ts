import { readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { drizzle as sqliteProxy } from "drizzle-orm/sqlite-proxy";
import { beforeEach, describe, expect, it } from "vitest";
import { authSchema } from "../../drizzle/auth-schema";
import { d1Schema } from "../../drizzle/d1-schema";
import { bookingDocuments } from "../../drizzle/d1-schema";
import { eq } from "drizzle-orm";
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
  exec(`insert into bookings (id, hotel_id, room_id, guest_name, check_in, check_out, price, status, source, payment_status, payment_method)
    values ('paid', 'h1', 'r-h1', 'Guest', '2026-12-01', '2026-12-03', '1070.00', 'confirmed', 'walk-in', 'verified', 'cash')`);
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
    const tax = await issueBookingDocument(db, owner, "h1", { bookingId: "paid", type: "tax_invoice", buyer }, NOW);

    expect([first.number, tax.number]).toEqual(["RC-2026-000001", "TX-2026-000001"]);
    expect(first).toMatchObject({ issuedOn: "2026-11-07", subtotalSatang: 100000, totalSatang: 107000, vatEnabled: true, vatRate: 7, vatSatang: 7000, withholdingEnabled: true, withholdingRate: 3, withholdingSatang: 3000, netToPaySatang: 104000, booking: { nights: 2, roomType: "Deluxe", paymentMethod: "cash" }, verifiedTransactionReference: null });
    expect(tax).toMatchObject({ vatSatang: 7000, withholdingSatang: 3000, netToPaySatang: 104000, issuer: { taxId: header.taxId } });

    await saveInvoiceSettings(db, owner, "h1", { ...header, issuerName: "New name" }, NOW);
    const listed = await listBookingDocuments(db, owner, "h1", "paid");
    expect(listed).toHaveLength(2);
    expect(listed.every(row => row.snapshot.issuer.name === header.issuerName)).toBe(true);
    expect(listed.every(row => row.snapshot.vatRate === 7 && row.snapshot.withholdingRate === 3)).toBe(true);
  });

  it("refuses unpaid and cancelled bookings", async () => {
    await expect(issueBookingDocument(db, owner, "h1", { bookingId: "unpaid", type: "receipt", buyer }, NOW)).rejects.toThrow(/paid booking/);
    await expect(issueBookingDocument(db, owner, "h1", { bookingId: "cancelled", type: "receipt", buyer }, NOW)).rejects.toThrow(/paid booking/);
  });

  it("captures the matching verified full-payment session and reference in the receipt snapshot", async () => {
    exec(`insert into bookings (id, hotel_id, room_id, guest_name, check_in, check_out, price, status, source, payment_status, payment_method)
      values ('paid-session', 'h1', 'r-h1', 'Session Guest', '2026-12-10', '2026-12-11', '250.00', 'confirmed', 'manual', 'verified', 'promptpay')`);
    exec(`insert into payment_sessions (id, booking_id, hotel_id, amount, status, qr_reference, expires_at, verified_at, verified_transaction_ref)
      values ('ps-paid', 'paid-session', 'h1', '250.00', 'paid', 'QR-1', 1794000000000, 1794000000000, 'BANK-REF-250')`);
    const receipt = await issueBookingDocument(db, owner, "h1", { bookingId: "paid-session", type: "receipt", buyer }, NOW);
    expect(receipt.verifiedTransactionReference).toBe("BANK-REF-250");
    const [row] = await db.select().from(bookingDocuments).where(eq(bookingDocuments.bookingId, "paid-session"));
    expect(row.paymentSessionId).toBe("ps-paid");
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
    expect(inv.number).toBe("INV-2026-000001");
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
    expect(hotelDocs[0]?.docNumber).toBe("INV-2026-000001");
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
    expect(first.number).toBe("INV-2026-000001");
    expect(second.number).toBe("INV-2026-000002");

    // 2. Direct database insert with duplicate seq in same year is blocked by unique constraint
    expect(() => {
      exec(`insert into booking_documents (id, hotel_id, booking_id, doc_type, year, seq, doc_number, snapshot_json, created_at)
        values ('dup', 'h1', 'unpaid', 'invoice', 2026, 1, 'INV-2026-000001', '{}', 1700000000000)`);
    }).toThrow(/UNIQUE constraint failed/);
  });

  it("resets sequence to 000001 at 00:00:00 Jan 1 Asia/Bangkok time (New Year rollover)", async () => {
    // 1. Issue final document of 2026 at 23:59:59 Bangkok time (16:59:59 UTC)
    const dec31Last = new Date("2026-12-31T16:59:59.000Z");
    const doc2026 = await issueBookingDocument(db, owner, "h1", { bookingId: "unpaid", type: "invoice", buyer }, dec31Last);
    expect(doc2026.number).toBe("INV-2026-000001");
    expect(doc2026.year).toBe(2026);

    // 2. Issue next document at exactly 00:00:00 Jan 1 2027 Bangkok time (17:00:00 UTC on 31 Dec)
    const jan1First = new Date("2026-12-31T17:00:00.000Z");
    const doc2027 = await issueBookingDocument(db, owner, "h1", { bookingId: "unpaid", type: "invoice", buyer }, jan1First);
    expect(doc2027.number).toBe("INV-2027-000001");
    expect(doc2027.year).toBe(2027);

    // 3. Issue a second document in 2027
    const jan1Second = new Date("2027-01-01T08:00:00.000Z");
    const doc2027B = await issueBookingDocument(db, owner, "h1", { bookingId: "unpaid", type: "invoice", buyer }, jan1Second);
    expect(doc2027B.number).toBe("INV-2027-000002");
    expect(doc2027B.year).toBe(2027);
  });

  it("isolates sequences across different hotels for the same document type and year", async () => {
    // Hotel 1 issues invoice 1 in 2026
    const h1Doc = await issueBookingDocument(db, owner, "h1", { bookingId: "unpaid", type: "invoice", buyer }, NOW);
    expect(h1Doc.number).toBe("INV-2026-000001");

    // Hotel 2 setup
    exec(`insert into hotel_users (id, hotel_id, user_id, role) values ('own-h2', 'h2', 'owner', 'hotel_owner')`);
    await saveInvoiceSettings(db, owner, "h2", header, NOW);
    exec(`insert into bookings (id, hotel_id, room_id, guest_name, check_in, check_out, price, status, payment_status)
      values ('b-h2', 'h2', 'r-h2', 'Guest H2', '2026-12-01', '2026-12-03', '500.00', 'confirmed', 'unpaid')`);

    // Hotel 2 issues invoice in 2026 -> starts at 000001 independently!
    const h2Doc = await issueBookingDocument(db, owner, "h2", { bookingId: "b-h2", type: "invoice", buyer }, NOW);
    expect(h2Doc.number).toBe("INV-2026-000001");
  });

  it("handles concurrent requests and sequence collisions gracefully without number duplicates", async () => {
    exec(`insert into bookings (id, hotel_id, room_id, guest_name, check_in, check_out, price, status, payment_status)
      values ('unpaid-2', 'h1', 'r-h1', 'Guest 2', '2026-12-10', '2026-12-12', '500.00', 'confirmed', 'unpaid')`);

    // Simulate concurrent document issuance from two different bookings
    const [doc1, doc2] = await Promise.all([
      issueBookingDocument(db, owner, "h1", { bookingId: "unpaid", type: "invoice", buyer }, NOW),
      issueBookingDocument(db, owner, "h1", { bookingId: "unpaid-2", type: "invoice", buyer }, NOW),
    ]);

    expect(doc1.number).not.toBe(doc2.number);
    const numbers = [doc1.number, doc2.number].sort();
    expect(numbers).toEqual(["INV-2026-000001", "INV-2026-000002"]);
  });

  it("enforces request-specific idempotency and handles concurrent duplicate requests without creating duplicate documents", async () => {
    const key = "client-req-uuid-12345";

    // 1. Concurrent duplicate requests with the same idempotency key
    const [res1, res2] = await Promise.all([
      issueBookingDocument(db, owner, "h1", { bookingId: "unpaid", type: "invoice", buyer, idempotencyKey: key }, NOW),
      issueBookingDocument(db, owner, "h1", { bookingId: "unpaid", type: "invoice", buyer, idempotencyKey: key }, NOW),
    ]);

    // Both requests receive the exact same document snapshot
    expect(res1.number).toBe("INV-2026-000001");
    expect(res2.number).toBe("INV-2026-000001");
    expect(res1.number).toBe(res2.number);

    // Only 1 document is inserted in the database
    const allDocs = await listBookingDocuments(db, owner, "h1", "unpaid");
    expect(allDocs).toHaveLength(1);

    // 2. Sequential retry with the same key returns the existing document directly
    const retryRes = await issueBookingDocument(db, owner, "h1", { bookingId: "unpaid", type: "invoice", buyer, idempotencyKey: key }, NOW);
    expect(retryRes.number).toBe("INV-2026-000001");

    // 3. Reusing the same idempotency key with a mismatched booking/type is rejected
    await expect(issueBookingDocument(db, owner, "h1", { bookingId: "paid", type: "invoice", buyer, idempotencyKey: key }, NOW))
      .rejects.toThrow(/Idempotency key was already used for a different document or booking/);

    // 4. Reusing the same idempotency key with altered buyer details is rejected
    await expect(issueBookingDocument(db, owner, "h1", {
      bookingId: "unpaid",
      type: "invoice",
      buyer: { ...buyer, name: "Changed Guest Name" },
      idempotencyKey: key,
    }, NOW)).rejects.toThrow(/Idempotency key was already used with different document content or buyer details/);

    await expect(issueBookingDocument(db, owner, "h1", {
      bookingId: "unpaid",
      type: "invoice",
      buyer: { ...buyer, taxId: "9999999999999" },
      idempotencyKey: key,
    }, NOW)).rejects.toThrow(/Idempotency key was already used with different document content or buyer details/);

    await expect(issueBookingDocument(db, owner, "h1", {
      bookingId: "unpaid",
      type: "invoice",
      buyer: { ...buyer, address: "999 New Address Road" },
      idempotencyKey: key,
    }, NOW)).rejects.toThrow(/Idempotency key was already used with different document content or buyer details/);
  });

  it("allows at most one full payment receipt per booking across idempotency keys", async () => {
    const first = await issueBookingDocument(db, owner, "h1", {
      bookingId: "paid", type: "receipt", buyer, idempotencyKey: "full-payment-receipt-key",
    }, NOW);
    expect(first.number).toBe("RC-2026-000001");
    await expect(issueBookingDocument(db, owner, "h1", {
      bookingId: "paid", type: "receipt", buyer, idempotencyKey: "different-receipt-key",
    }, NOW)).rejects.toThrow(/receipt has already been issued/i);
    expect(await listBookingDocuments(db, owner, "h1", "paid")).toHaveLength(1);
  });

  it("retains immutable snapshot across hotel setting changes and re-downloads", async () => {
    // Issue initial receipt
    const initial = await issueBookingDocument(db, owner, "h1", { bookingId: "paid", type: "receipt", buyer }, NOW);
    expect(initial.number).toBe("RC-2026-000001");
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
    expect(fetched.snapshot.number).toBe("RC-2026-000001");
    expect(fetched.snapshot.issuer.name).toBe("บริษัท ลานนา จำกัด");
    expect(fetched.snapshot.issuer.address).toBe("1 Road");
    expect(fetched.snapshot.vatRate).toBe(7);
    expect(fetched.snapshot.totalSatang).toBe(107000);
  });

  it("preserves legacy documents without year in snapshot and returns them intact", async () => {
    // Manually insert a legacy record as would exist in an older database prior to annual numbering
    const legacySnapshot = {
      type: "receipt",
      number: "RC-000042",
      issuedOn: "2026-10-15",
      issuer: { name: "Old Hotel", address: "Old Road", taxId: null, branch: null, phone: null },
      buyer,
      booking: { id: "paid", checkIn: "2026-12-01", checkOut: "2026-12-03", nights: 2, roomType: "Deluxe", paymentMethod: "cash" },
      subtotalSatang: 50000,
      vatEnabled: false,
      vatRate: 0,
      vatSatang: 0,
      totalSatang: 50000,
      withholdingEnabled: false,
      withholdingRate: 0,
      withholdingSatang: 0,
      netToPaySatang: 50000,
    };

    exec(`insert into booking_documents (id, hotel_id, booking_id, doc_type, year, seq, doc_number, snapshot_json, created_at)
      values ('legacy-1', 'h1', 'paid', 'receipt', 2026, 42, 'RC-000042', ?, 1792000000000)`, JSON.stringify(legacySnapshot));

    const fetched = await getBookingDocument(db, owner, "h1", "legacy-1");
    expect(fetched.snapshot.number).toBe("RC-000042");
    expect(fetched.snapshot.totalSatang).toBe(50000);
    expect(fetched.snapshot.issuer.name).toBe("Old Hotel");
  });
});

