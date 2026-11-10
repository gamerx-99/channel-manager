import { readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { drizzle as sqliteProxy } from "drizzle-orm/sqlite-proxy";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { authSchema } from "../drizzle/auth-schema";
import { d1Schema } from "../drizzle/d1-schema";
import { createAuth } from "./auth";
import { MockEmailSender } from "./email";
import { createWorkerApp } from "../worker/app";
import type { D1ScopedDatabase } from "./db/scope";

const migrationFolder = resolve(dirname(fileURLToPath(import.meta.url)), "../drizzle/d1");
const { DatabaseSync } = process.getBuiltinModule("node:sqlite") as typeof import("node:sqlite");
const BASE = "http://billing.local.test";
const OWNER_EMAIL = "billing-owner@example.test";
const OWNER_PASSWORD = "synthetic-test-password-123";
const HOTEL = "test-hotel";
const OTHER_HOTEL = "other-hotel";
const mail = new MockEmailSender();

let sqlite: InstanceType<typeof DatabaseSync>;
let db: D1ScopedDatabase;
let auth: ReturnType<typeof createAuth>;
let worker: ReturnType<typeof createWorkerApp>;

function exec(query: string, ...params: Array<string | number | null>) {
  return sqlite.prepare(query).run(...params);
}

function cookieFrom(response: Response) {
  return response.headers.getSetCookie().map(value => value.split(";")[0]).join("; ");
}

async function request(path: string, init: RequestInit = {}) {
  return worker.fetch(new Request(new URL(path, BASE), init), { DB: sqlite as never, BILLING_CANDIDATE_ENABLED: "true" });
}

async function authPost(path: string, body: object, cookie = "") {
  return request(`/api/auth${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: BASE, ...(cookie ? { cookie } : {}) },
    body: JSON.stringify(body),
  });
}

async function signIn(email = OWNER_EMAIL) {
  const response = await authPost("/sign-in/email", { email, password: OWNER_PASSWORD });
  expect(response.status).toBe(200);
  return cookieFrom(response);
}

async function trpc(path: string, input: object, cookie = "", method: "query" | "mutation" = "mutation") {
  const query = method === "query"
    ? `?batch=1&input=${encodeURIComponent(JSON.stringify({ 0: { json: input } }))}`
    : "?batch=1";
  const response = await request(`/api/trpc/bookingDocuments.${path}${query}`, {
    method: method === "query" ? "GET" : "POST",
    headers: {
      "content-type": "application/json",
      ...(cookie ? { cookie } : {}),
    },
    ...(method === "query"
      ? { headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) }, body: undefined }
      : { body: JSON.stringify({ 0: { json: input } }) }),
  });
  const body = await response.json() as any;
  return { response, body, result: body?.[0]?.result?.data?.json, error: body?.[0]?.error?.json };
}

async function createVerifiedUser(email: string) {
  const signedUp = await authPost("/sign-up/email", { email, password: OWNER_PASSWORD, name: "Synthetic Billing User" });
  expect(signedUp.status).toBe(200);
  const sent = mail.getLastEmail();
  expect(sent?.to).toBe(email);
  const unverifiedSignIn = await authPost("/sign-in/email", { email, password: OWNER_PASSWORD });
  expect(unverifiedSignIn.status).toBe(403);
  expect(sqlite.prepare("select count(*) as n from session").get()).toMatchObject({ n: 0 });
  const match = /https?:\/\/[^\s"<>]+/.exec(sent?.text ?? "");
  expect(match).not.toBeNull();
  const verification = await worker.fetch(new Request(match![0]), { DB: sqlite as never });
  expect(verification.status).toBe(302);
  const sessionCount = sqlite.prepare("select count(*) as n from session").get() as { n: number };
  expect(sessionCount.n).toBe(0);
  mail.clear();
}

const settings = {
  hotel_id: HOTEL,
  enabled: true,
  issuer_name: "บริษัท ทดสอบ จำกัด",
  address: "1 Test Road, Bangkok",
  tax_id: "0105555555555",
  branch: "สำนักงานใหญ่",
  phone: null,
  vat_enabled: true,
  vat_rate: 7,
  withholding_enabled: true,
  withholding_rate: 3,
};

beforeEach(async () => {
  vi.stubEnv("RESEND_API_KEY", "");
  mail.clear();
  sqlite = new DatabaseSync(":memory:");
  sqlite.exec("PRAGMA foreign_keys = ON");
  for (const file of readdirSync(migrationFolder).filter(name => name.endsWith(".sql")).sort()) {
    const sql = readFileSync(resolve(migrationFolder, file), "utf8");
    for (const statement of sql.split("--> statement-breakpoint")) if (statement.trim()) sqlite.exec(statement);
  }
  db = sqliteProxy(async (query, params, method) => {
    const statement = sqlite.prepare(query);
    statement.setReturnArrays(true);
    if (method === "run") { statement.run(...params as never[]); return { rows: [] }; }
    const rows = method === "get" ? statement.get(...params as never[]) : statement.all(...params as never[]);
    return { rows: rows ? (Array.isArray(rows) ? rows : [rows]) as never[] : [] };
  }, { schema: { ...d1Schema, ...authSchema } }) as unknown as D1ScopedDatabase;

  auth = createAuth({ db, baseURL: BASE, secret: "local-integration-test-secret-at-least-32", emailSender: mail, requireEmailVerification: true });
  worker = createWorkerApp({
    createDatabase: () => db,
    createAuthInstance: () => auth,
  });

  for (const id of [HOTEL, OTHER_HOTEL]) {
    exec("insert into hotels (id, name, slug, address, owner_contact) values (?, ?, ?, 'Addr', 'owner@example.test')", id, id, id);
    exec("insert into room_types (id, hotel_id, name, capacity, base_price) values (?, ?, 'Deluxe', 2, '100')", `rt-${id}`, id);
    exec("insert into rooms (id, hotel_id, room_type_id, room_number) values (?, ?, ?, '1')", `r-${id}`, id, `rt-${id}`);
  }
  exec("insert into bookings (id, hotel_id, room_id, guest_name, check_in, check_out, price, status, payment_status) values ('unpaid', ?, ?, 'Guest', '2026-12-01', '2026-12-02', '500', 'confirmed', 'unpaid')", HOTEL, `r-${HOTEL}`);
  exec("insert into bookings (id, hotel_id, room_id, guest_name, check_in, check_out, price, status, payment_status, payment_method) values ('paid', ?, ?, 'Guest', '2026-12-05', '2026-12-06', '1070.00', 'confirmed', 'verified', 'promptpay')", HOTEL, `r-${HOTEL}`);
  exec("insert into payment_sessions (id, booking_id, hotel_id, amount, status, qr_reference, expires_at, verified_at, verified_transaction_ref) values ('paid-session', 'paid', ?, '1070.00', 'paid', 'QR-PAID', 1794000000000, 1794000000000, 'BANK-PAID-1070')", HOTEL);

  await createVerifiedUser(OWNER_EMAIL);
  await createVerifiedUser("outsider@example.test");
  await createVerifiedUser("frontdesk@example.test");
  await createVerifiedUser("housekeeping@example.test");
  const ownerId = (sqlite.prepare("select id from user where email = ?").get(OWNER_EMAIL) as { id: string }).id;
  const outsiderId = (sqlite.prepare("select id from user where email = ?").get("outsider@example.test") as { id: string }).id;
  const frontDeskId = (sqlite.prepare("select id from user where email = ?").get("frontdesk@example.test") as { id: string }).id;
  const housekeepingId = (sqlite.prepare("select id from user where email = ?").get("housekeeping@example.test") as { id: string }).id;
  exec("insert into hotel_users (id, hotel_id, user_id, role) values ('owner-member', ?, ?, 'hotel_owner')", HOTEL, ownerId);
  exec("insert into hotel_users (id, hotel_id, user_id, role) values ('outsider-member', ?, ?, 'hotel_owner')", OTHER_HOTEL, outsiderId);
  exec("insert into hotel_users (id, hotel_id, user_id, role) values ('frontdesk-member', ?, ?, 'front_desk')", HOTEL, frontDeskId);
  exec("insert into hotel_users (id, hotel_id, user_id, role) values ('housekeeping-member', ?, ?, 'housekeeping')", HOTEL, housekeepingId);
});

afterEach(() => {
  sqlite.close();
  vi.unstubAllEnvs();
});

describe("Billing API through the local Worker and verified sessions", () => {
  it("requires verified email, issues invoice/receipt/tax invoice, renders PDF, and scopes hotel access", async () => {
    const cookie = await signIn();

    const saved = await trpc("saveSettings", settings, cookie);
    expect(saved.response.status).toBe(200);
    expect(saved.result).toMatchObject({ success: true });

    const invoice = await trpc("issue", {
      hotel_id: HOTEL, booking_id: "unpaid", type: "invoice", buyer_name: "Guest Co", buyer_address: "2 Test Road", idempotency_key: "invoice-1",
    }, cookie);
    expect(invoice.response.status).toBe(200);
    expect(invoice.result).toMatchObject({ type: "invoice", number: "INV-2026-000001", balanceSatang: 50000 });

    const receipt = await trpc("issue", {
      hotel_id: HOTEL, booking_id: "paid", type: "receipt", buyer_name: "Guest Co", buyer_address: "2 Test Road", idempotency_key: "receipt-1",
    }, cookie);
    expect(receipt.response.status).toBe(200);
    expect(receipt.result).toMatchObject({ type: "receipt", number: "RC-2026-000001", totalSatang: 107000, amountPaidSatang: 107000, verifiedTransactionReference: "BANK-PAID-1070" });

    const tax = await trpc("issue", {
      hotel_id: HOTEL, booking_id: "paid", type: "tax_invoice", buyer_name: "Guest Co", buyer_address: "2 Test Road", buyer_tax_id: "1234567890123", idempotency_key: "tax-1",
    }, cookie);
    expect(tax.response.status).toBe(200);
    expect(tax.result).toMatchObject({ type: "tax_invoice", number: "TX-2026-000001", buyer: { taxId: "1234567890123" } });

    const listed = await trpc("listHotel", { hotel_id: HOTEL, limit: 100 }, cookie, "query");
    expect(listed.response.status).toBe(200);
    expect(listed.result).toHaveLength(3);

    const docId = listed.result.find((doc: any) => doc.docNumber === "INV-2026-000001").id;
    const pdf = await trpc("getPdf", { hotel_id: HOTEL, document_id: docId }, cookie);
    expect(pdf.response.status).toBe(200);
    expect(pdf.result.filename).toContain("INV-2026-000001");
    expect(pdf.result.contentType).toBe("application/pdf");
    expect(Buffer.from(pdf.result.base64, "base64").subarray(0, 4).toString()).toBe("%PDF");

    const forgedPdf = await trpc("getPdf", {
      hotel_id: HOTEL,
      snapshot: { ...invoice.result, number: "FORGED-999999", issuer: { name: "Attacker" } },
    }, cookie);
    expect(forgedPdf.response.status).toBe(400);

    const email = await trpc("emailDocument", { hotel_id: HOTEL, document_id: docId, recipient_email: "synthetic-recipient@example.test" }, cookie);
    expect(email.response.status).toBe(200);
    expect(email.result.success).toBe(true);

    const frontDesk = await signIn("frontdesk@example.test");
    const frontDeskSaveSettings = await trpc("saveSettings", settings, frontDesk);
    expect(frontDeskSaveSettings.response.status).toBe(403);
    const frontDeskIssue = await trpc("issue", {
      hotel_id: HOTEL, booking_id: "unpaid", type: "invoice", buyer_name: "Guest Co", idempotency_key: "frontdesk-invoice",
    }, frontDesk);
    expect(frontDeskIssue.response.status).toBe(200);

    const housekeeping = await signIn("housekeeping@example.test");
    const housekeepingIssue = await trpc("issue", {
      hotel_id: HOTEL, booking_id: "unpaid", type: "invoice", buyer_name: "Guest Co", idempotency_key: "housekeeping-invoice",
    }, housekeeping);
    expect(housekeepingIssue.response.status).toBe(403);
    const housekeepingList = await trpc("listHotel", { hotel_id: HOTEL }, housekeeping, "query");
    expect(housekeepingList.response.status).toBe(403);

    const otherTenant = await trpc("listHotel", { hotel_id: OTHER_HOTEL }, cookie, "query");
    expect(otherTenant.response.status).toBe(403);
    const wrongOwner = await signIn("outsider@example.test");
    const otherSettings = await trpc("saveSettings", { ...settings, hotel_id: OTHER_HOTEL }, wrongOwner);
    expect(otherSettings.response.status).toBe(200);
    const crossHotelIssue = await trpc("issue", {
      hotel_id: OTHER_HOTEL, booking_id: "unpaid", type: "invoice", buyer_name: "Guest Co", idempotency_key: "x",
    }, wrongOwner);
    expect(crossHotelIssue.response.status).toBe(404);
    const crossHotelPdf = await trpc("getPdf", { hotel_id: OTHER_HOTEL, document_id: docId }, wrongOwner);
    expect(crossHotelPdf.response.status).toBe(404);

    const invalid = await trpc("saveSettings", { ...settings, tax_id: "123" }, cookie);
    expect(invalid.response.status).toBe(400);
    const anonymous = await trpc("listHotel", { hotel_id: HOTEL }, "", "query");
    expect(anonymous.response.status).toBe(401);
  });

  it("handles duplicate and concurrent idempotent requests, including sequence collisions", async () => {
    const cookie = await signIn();
    await trpc("saveSettings", settings, cookie);
    const payload = { hotel_id: HOTEL, booking_id: "unpaid", type: "invoice", buyer_name: "Guest Co", idempotency_key: "same-request" };
    const [first, concurrent] = await Promise.all([trpc("issue", payload, cookie), trpc("issue", payload, cookie)]);
    expect(first.response.status).toBe(200);
    expect(concurrent.response.status).toBe(200);
    expect(first.result.number).toBe(concurrent.result.number);

    const retry = await trpc("issue", payload, cookie);
    expect(retry.result.number).toBe(first.result.number);
    const duplicate = await trpc("issue", { ...payload, idempotency_key: "second-request" }, cookie);
    expect(duplicate.result.number).not.toBe(first.result.number);
    const [parallelA, parallelB] = await Promise.all([
      trpc("issue", { ...payload, idempotency_key: "parallel-a" }, cookie),
      trpc("issue", { ...payload, idempotency_key: "parallel-b" }, cookie),
    ]);
    expect(parallelA.response.status).toBe(200);
    expect(parallelB.response.status).toBe(200);
    expect(parallelA.result.number).not.toBe(parallelB.result.number);
    const docs = await trpc("list", { hotel_id: HOTEL, booking_id: "unpaid" }, cookie, "query");
    expect(docs.result, JSON.stringify(docs.body)).toHaveLength(4);
    expect(new Set(docs.result.map((row: any) => row.snapshot.number)).size).toBe(4);
  });
});
