import { readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { drizzle as sqliteProxy } from "drizzle-orm/sqlite-proxy";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { d1Schema, hotelPaymentSettings, hotelServices, hotelSiteConfig, hotelUsers, hotels, rateOverrides, roomTypes, rooms } from "../../drizzle/d1-schema";
import type { D1ScopedDatabase } from "../db/scope";
import { applyHotelSetupImport, exportHotelSetup } from "./hotelDataTransfer";

const migrationFolder = resolve(dirname(fileURLToPath(import.meta.url)), "../../drizzle/d1");
const { DatabaseSync } = process.getBuiltinModule("node:sqlite") as typeof import("node:sqlite");
let sqlite: InstanceType<typeof DatabaseSync>;
let db: D1ScopedDatabase;
let batchCount: number;

beforeEach(() => {
  batchCount = 0; sqlite = new DatabaseSync(":memory:"); sqlite.exec("PRAGMA foreign_keys = ON");
  for (const file of readdirSync(migrationFolder).filter(name => name.endsWith(".sql")).sort()) for (const statement of readFileSync(resolve(migrationFolder, file), "utf8").split("--> statement-breakpoint")) if (statement.trim()) sqlite.exec(statement);
  db = sqliteProxy(async (query, params, method) => { const statement = sqlite.prepare(query); statement.setReturnArrays(true); if (method === "run") { statement.run(...params); return { rows: [] }; } if (method === "get") { const row = statement.get(...params); return { rows: row ? [row] : [] }; } return { rows: statement.all(...params) }; }, { schema: d1Schema }) as unknown as D1ScopedDatabase;
  db.$client = { prepare: query => ({ bind: (...params) => ({ query, params }) }), batch: async statements => { batchCount++; sqlite.exec("BEGIN"); try { const result = statements.map(statement => { const { query, params } = statement as { query: string; params: unknown[] }; return { meta: { changes: Number(sqlite.prepare(query).run(...params).changes) } }; }); sqlite.exec("COMMIT"); return result; } catch (error) { sqlite.exec("ROLLBACK"); throw error; } } };
});
afterEach(() => sqlite.close());

const file = {
  format: "hayhost-hotel", version: 1,
  profile: { name: "Imported name", address: "New address", owner_contact: "owner", latitude: 13.7, longitude: 100.5, phone: { value: "111", show: true }, facebook: { value: null, show: false }, line: { value: "https://line.me/x", show: true }, instagram: { value: null, show: false }, x: { value: null, show: false } },
  room_types: [{ name: "Deluxe", description: "Updated", bed_type: "King", size_sqm: 25, amenities: ["free_wifi"], capacity: 2, base_occupancy: 2, max_occupancy: 2, occupancy_pricing: { "1": { enabled: false, mode: "percent", value: 0 }, "2": { enabled: true, mode: "percent", value: 0 } }, base_price: "1500.00", room_count: 2, child_rule: "age", child_rule_limit: null, child_rates: { infant: { mode: "free", value: 0 }, age_groups: [], height: { mode: "free", value: 0 } }, children_count_toward_max: true }, { name: "Standard", description: null, bed_type: null, size_sqm: null, amenities: [], capacity: 2, base_occupancy: 2, max_occupancy: 2, occupancy_pricing: { "1": { enabled: false, mode: "percent", value: 0 }, "2": { enabled: true, mode: "percent", value: 0 } }, base_price: "900.00", room_count: 0, child_rule: "age", child_rule_limit: null, child_rates: { infant: { mode: "free", value: 0 }, age_groups: [], height: { mode: "free", value: 0 } }, children_count_toward_max: true }],
  rate_overrides: [{ room_type_name: "Deluxe", start_date: "2026-12-03", end_date: "2026-12-04", price: "1800.00", minimum_stay: 2 }], extra_services: [{ name: "Breakfast", pricing_model: "PER_PERSON_PER_NIGHT", unit_price: "250.00", active: true }, { name: "Parking", pricing_model: "ONE_TIME", unit_price: "50.00", active: true }],
  website: { hero_copy: "Welcome", accent_color: "#954831", theme: "minimal-white", visible_sections: { hero: true } },
};

async function seed() {
  await db.insert(hotels).values({ id: "hotel-a", name: "Original", slug: "hotel-a", address: "Old", ownerContact: "owner" });
  await db.insert(hotels).values({ id: "hotel-b", name: "Other", slug: "hotel-b", address: "Other", ownerContact: "other" });
  await db.insert(hotelUsers).values([{ id: "membership-a", hotelId: "hotel-a", userId: "owner-a", role: "hotel_owner", permissionGrants: [], permissionRevokes: [] }, { id: "membership-b", hotelId: "hotel-b", userId: "owner-b", role: "hotel_owner", permissionGrants: [], permissionRevokes: [] }]);
}

describe("hotel setup D1 transfer", () => {
  it("exports only setup fields and excludes payment credentials and operational data", async () => {
    await seed();
    await db.insert(hotelPaymentSettings).values({ hotelId: "hotel-a", slipokKeyEnc: "secret-key", slipokKeyHash: "secret-hash", promptpayId: "secret-promptpay" });
    const result = await exportHotelSetup(db, { userId: "owner-a" }, "hotel-a");
    expect(Object.keys(result)).toEqual(["format", "version", "profile", "room_types", "rate_overrides", "extra_services", "website"]);
    const serialized = JSON.stringify(result);
    expect(serialized).not.toMatch(/guest|booking|secret|promptpay|slipok/i);
  });

  it("updates matched room/service names, adds new items, keeps rooms and performs one atomic batch", async () => {
    await seed();
    await db.insert(roomTypes).values({ id: "type-existing", hotelId: "hotel-a", name: "Deluxe", capacity: 2, maxOccupancy: 2, baseOccupancy: 2, basePrice: "1000.00" });
    await db.insert(rooms).values({ id: "room-booked", hotelId: "hotel-a", roomTypeId: "type-existing", roomNumber: "001", status: "occupied" });
    await db.insert(rateOverrides).values({ id: "rate-existing", roomTypeId: "type-existing", startDate: "2026-12-01", endDate: "2026-12-05", overridePrice: "1100.00", minStayNights: null });
    await db.insert(roomTypes).values({ id: "type-keep", hotelId: "hotel-a", name: "Keep", capacity: 2, maxOccupancy: 2, baseOccupancy: 2, basePrice: "900.00" });
    await db.insert(hotelServices).values({ id: "service-existing", hotelId: "hotel-a", name: "Breakfast", pricingModel: "PER_NIGHT", unitPrice: "100.00" });
    const result = await applyHotelSetupImport(db, { userId: "owner-a" }, "hotel-a", file, true);
    expect(result.applied).toBe(true); expect(batchCount).toBe(1);
    expect(await db.select().from(roomTypes)).toMatchObject([{ id: "type-existing", name: "Deluxe", basePrice: "1500.00" }, { id: "type-keep", name: "Keep" }, { name: "Standard", basePrice: "900.00" }]);
    expect(await db.select().from(rooms)).toHaveLength(2);
    expect(await db.select().from(rateOverrides).orderBy(rateOverrides.startDate)).toMatchObject([
      { startDate: "2026-12-01", endDate: "2026-12-02", overridePrice: "1100.00" },
      { startDate: "2026-12-03", endDate: "2026-12-04", overridePrice: "1800.00", minStayNights: 2 },
      { startDate: "2026-12-05", endDate: "2026-12-05", overridePrice: "1100.00" },
    ]);
    expect(await db.select().from(hotelServices)).toMatchObject([{ id: "service-existing", pricingModel: "PER_PERSON_PER_NIGHT", unitPrice: "250.00" }, { name: "Parking", unitPrice: "50.00" }]);
  });

  it("rolls back every write when one imported item violates a database constraint", async () => {
    await seed();
    sqlite.exec("CREATE TRIGGER reject_imported_service BEFORE INSERT ON hotel_services BEGIN SELECT RAISE(ABORT, 'service constraint failure'); END");
    await expect(applyHotelSetupImport(db, { userId: "owner-a" }, "hotel-a", file, true)).rejects.toThrow();
    expect((await db.select().from(hotels)).find(row => row.id === "hotel-a")?.name).toBe("Original");
    expect(await db.select().from(roomTypes)).toHaveLength(0);
    expect(batchCount).toBe(1);
  });

  it("refuses another hotel's caller", async () => {
    await seed();
    await expect(exportHotelSetup(db, { userId: "owner-b" }, "hotel-a")).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("preserves existing prices and skips new priced items without rate permission", async () => {
    await seed();
    await db.insert(roomTypes).values({ id: "type-existing", hotelId: "hotel-a", name: "Deluxe", capacity: 2, maxOccupancy: 2, baseOccupancy: 2, basePrice: "1000.00" });
    await db.insert(hotelServices).values({ id: "service-existing", hotelId: "hotel-a", name: "Breakfast", pricingModel: "PER_NIGHT", unitPrice: "100.00" });
    const result = await applyHotelSetupImport(db, { userId: "owner-a" }, "hotel-a", file, false);
    expect(result.skipped_prices).toBe(true);
    expect(await db.select().from(roomTypes)).toMatchObject([{ id: "type-existing", basePrice: "1000.00" }]);
    expect(await db.select().from(hotelServices)).toMatchObject([{ id: "service-existing", pricingModel: "PER_NIGHT", unitPrice: "100.00" }]);
    expect(batchCount).toBe(1);
  });

  it("imports website settings into a media-preserving draft without changing published settings", async () => {
    await seed();
    await db.insert(hotelSiteConfig).values({ hotelId: "hotel-a", heroCopy: "Published hero", accentColor: "#123456", visibleSections: { hero: false }, theme: "lanna-teak", draftJson: JSON.stringify({ heroCopy: "Current draft hero", accentColor: "#654321", visibleSections: { story: false }, theme: "cafe-homestay", heroMediaId: "media-1", mediaPositions: { "media-1": "top" }, mediaCaptions: { "media-1": "Caption" }, galleryMediaIds: ["media-2"] }) });
    await applyHotelSetupImport(db, { userId: "owner-a" }, "hotel-a", file, true);
    const [config] = await db.select().from(hotelSiteConfig);
    expect(config).toMatchObject({ heroCopy: "Published hero", accentColor: "#123456", visibleSections: { hero: false }, theme: "lanna-teak" });
    expect(JSON.parse(config!.draftJson!)).toEqual({ heroCopy: "Welcome", accentColor: "#954831", visibleSections: { hero: true }, theme: "minimal-white", heroMediaId: "media-1", mediaPositions: { "media-1": "top" }, mediaCaptions: { "media-1": "Caption" }, galleryMediaIds: ["media-2"] });
  });

  it("keeps existing draft website values when imported website values are null", async () => {
    await seed();
    await db.insert(hotelSiteConfig).values({ hotelId: "hotel-a", heroCopy: "Published", accentColor: "#123456", visibleSections: { hero: false }, theme: "lanna-teak", draftJson: JSON.stringify({ heroCopy: "Draft", accentColor: "#abcdef", visibleSections: { story: false }, theme: "cafe-homestay", heroMediaId: "media-1", mediaPositions: { "media-1": "bottom" }, mediaCaptions: {}, galleryMediaIds: [] }) });
    const nullableFile = { ...file, website: { hero_copy: null, accent_color: null, theme: null, visible_sections: null } };
    await applyHotelSetupImport(db, { userId: "owner-a" }, "hotel-a", nullableFile, true);
    const [config] = await db.select().from(hotelSiteConfig);
    expect(config).toMatchObject({ heroCopy: "Published", accentColor: "#123456", visibleSections: { hero: false }, theme: "lanna-teak" });
    expect(JSON.parse(config!.draftJson!)).toEqual({ heroCopy: "Draft", accentColor: "#abcdef", visibleSections: { story: false }, theme: "cafe-homestay", heroMediaId: "media-1", mediaPositions: { "media-1": "bottom" }, mediaCaptions: {}, galleryMediaIds: [] });
  });
});
