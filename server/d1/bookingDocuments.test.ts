import { readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { drizzle as sqliteProxy } from "drizzle-orm/sqlite-proxy";
import { beforeEach, describe, expect, it } from "vitest";
import { authSchema } from "../../drizzle/auth-schema";
import { d1Schema } from "../../drizzle/d1-schema";
import type { D1ScopedDatabase } from "../db/scope";
import { getInvoiceSettings, issueBookingDocument, listBookingDocuments, saveInvoiceSettings } from "./bookingDocuments";

const migrationFolder = resolve(dirname(fileURLToPath(import.meta.url)), "../../drizzle/d1");
const { DatabaseSync } = process.getBuiltinModule("node:sqlite") as typeof import("node:sqlite");
let sqlite: InstanceType<typeof DatabaseSync>;
let db: D1ScopedDatabase;

const NOW = new Date("2026-11-06T20:00:00.000Z"); // 03:00 on 7 Nov in Thailand
const owner = { userId: "owner" };
const exec = (query: string, ...params: Array<string | number | null>) => sqlite.prepare(query).run(...params);
const header = { enabled: true, issuerName: "บริษัท ลานนา จำกัด", address: "1 Road", taxId: "0105555555555", branch: "สำนักงานใหญ่", phone: null };
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
    expect(first).toMatchObject({ issuedOn: "2026-11-07", totalSatang: 107000, vatSatang: null, booking: { nights: 2, roomType: "Deluxe", paymentMethod: "promptpay" } });
    expect(tax).toMatchObject({ vatSatang: 7000, netSatang: 100000, issuer: { taxId: header.taxId } });

    await saveInvoiceSettings(db, owner, "h1", { ...header, issuerName: "New name" }, NOW);
    const listed = await listBookingDocuments(db, owner, "h1", "paid");
    expect(listed).toHaveLength(3);
    expect(listed.every(row => row.snapshot.issuer.name === header.issuerName)).toBe(true);
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
  });
});
