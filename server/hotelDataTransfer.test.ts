import { describe, expect, it } from "vitest";
import { buildHotelImportPlan, validateHotelDataDocument } from "./hotelDataTransfer";

const document = {
  format: "hayhost-hotel", version: 1,
  profile: { name: "บ้านพัก", address: "ที่อยู่", owner_contact: "owner", latitude: null, longitude: null, phone: { value: null, show: false }, facebook: { value: null, show: false }, line: { value: "https://line.me/x", show: true }, instagram: { value: null, show: false }, x: { value: null, show: false } },
  room_types: [{ name: "ห้องเตียงคู่", description: null, bed_type: "เตียงคู่", size_sqm: 24, amenities: ["free_wifi"], capacity: 2, base_occupancy: 2, max_occupancy: 2, occupancy_pricing: { "1": { enabled: false, mode: "percent", value: 0 }, "2": { enabled: true, mode: "percent", value: 0 } }, base_price: "1000.00", room_count: 2, child_rule: "age", child_rule_limit: null, child_rates: { infant: { mode: "free", value: 0 }, age_groups: [], height: { mode: "free", value: 0 } }, children_count_toward_max: true }],
  rate_overrides: [{ room_type_name: "ห้องเตียงคู่", start_date: "2026-12-01", end_date: "2026-12-02", price: "1200.00", minimum_stay: 2 }],
  extra_services: [{ name: "อาหารเช้า", pricing_model: "PER_PERSON_PER_NIGHT", unit_price: "100.00", active: true }],
  website: { hero_copy: "ยินดีต้อนรับ", accent_color: "#954831", theme: "minimal-white", visible_sections: { hero: true } },
};

describe("hotel setup transfer rules", () => {
  it("rejects unsupported formats and versions with clear Thai errors", () => {
    expect(() => validateHotelDataDocument({ ...document, format: "other" })).toThrow("ไฟล์นี้ไม่ใช่ข้อมูลโรงแรมของ hayhost");
    expect(() => validateHotelDataDocument({ ...document, version: 2 })).toThrow("ไม่รองรับข้อมูลโรงแรมเวอร์ชันนี้");
  });
  it("plans additions and updates by name, without any delete action", () => {
    const parsed = validateHotelDataDocument(document);
    const plan = buildHotelImportPlan(parsed, { roomTypes: [{ name: "ห้องเตียงคู่" }], services: [], rateOverrides: [], canManageRates: true });
    expect(plan).toContainEqual(expect.objectContaining({ section: "room_types", action: "updated", name: "ห้องเตียงคู่" }));
    expect(plan).toContainEqual(expect.objectContaining({ section: "extra_services", action: "added", name: "อาหารเช้า" }));
    expect(plan.some(change => change.action === ("deleted" as never))).toBe(false);
  });
  it("marks imported prices as skipped when the caller cannot manage rates", () => {
    const plan = buildHotelImportPlan(validateHotelDataDocument(document), { roomTypes: [], services: [], rateOverrides: [], canManageRates: false });
    expect(plan).toContainEqual(expect.objectContaining({ section: "rate_overrides", action: "skipped", detail: expect.stringContaining("ไม่มีสิทธิ์") }));
  });
  it("labels non-overlapping rate ranges as added and overlapping ranges as updated", () => {
    const parsed = validateHotelDataDocument(document);
    const makePlan = (rateOverrides: Array<{ room_type_name: string; start_date: string; end_date: string }>) => buildHotelImportPlan(parsed, { roomTypes: [{ name: "ห้องเตียงคู่" }], services: [], rateOverrides, canManageRates: true });
    expect(makePlan([]).find(change => change.section === "rate_overrides")?.action).toBe("added");
    expect(makePlan([{ room_type_name: "ห้องเตียงคู่", start_date: "2026-11-30", end_date: "2026-12-01" }]).find(change => change.section === "rate_overrides")?.action).toBe("updated");
  });
  it("rejects duplicate names and malformed occupancy pricing", () => {
    expect(() => validateHotelDataDocument({ ...document, room_types: [document.room_types[0], document.room_types[0]] })).toThrow("ชื่อประเภทห้องซ้ำกันในไฟล์");
    expect(() => validateHotelDataDocument({ ...document, room_types: [{ ...document.room_types[0], occupancy_pricing: {} }] })).toThrow("ข้อมูลราคาและจำนวนผู้เข้าพักไม่ถูกต้อง");
  });
});
