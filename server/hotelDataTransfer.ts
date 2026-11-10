import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { isRoomAmenityKey } from "../shared/roomAmenities";
import { isHotelThemeId } from "../shared/hotelThemes";
import { getRoomTypePricingValidationError } from "../shared/occupancyPricing";

const contact = z.object({ value: z.string().nullable(), show: z.boolean() });
const adjustment = z.object({ enabled: z.boolean(), mode: z.enum(["percent", "fixed"]), value: z.number().finite() });
const childRate = z.object({ mode: z.enum(["free", "fixed", "percent"]), value: z.number().nonnegative().finite() });
const childRates = z.object({ infant: childRate, age_groups: z.array(childRate.extend({ min_age: z.number().int(), max_age: z.number().int() })).max(3), height: childRate });
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
});
const room = z.object({
  name: z.string().trim().min(1).max(120), description: z.string().nullable(), bed_type: z.string().nullable(), size_sqm: z.number().int().min(1).max(1000).nullable(), amenities: z.array(z.string().refine(isRoomAmenityKey)).max(40),
  capacity: z.number().int().positive(), base_occupancy: z.number().int().positive(), max_occupancy: z.number().int().positive(), occupancy_pricing: z.record(z.string(), adjustment),
  base_price: z.string().regex(/^\d+(?:\.\d{1,2})?$/), room_count: z.number().int().nonnegative(), child_rule: z.enum(["age", "height"]), child_rule_limit: z.string().nullable(), child_rates: childRates, children_count_toward_max: z.boolean(),
});
const override = z.object({ room_type_name: z.string().trim().min(1), start_date: isoDate, end_date: isoDate, price: z.string().regex(/^\d+(?:\.\d{1,2})?$/), minimum_stay: z.number().int().positive().nullable() });
const service = z.object({ name: z.string().trim().min(1).max(120), pricing_model: z.enum(["PER_PERSON_PER_NIGHT", "PER_NIGHT", "ONE_TIME"]), unit_price: z.string().regex(/^\d+(?:\.\d{1,2})?$/), active: z.boolean() });
export const hotelDataDocumentSchema = z.object({
  format: z.string(), version: z.number(),
  profile: z.object({ name: z.string().trim().min(1), address: z.string(), owner_contact: z.string(), latitude: z.number().nullable(), longitude: z.number().nullable(), phone: contact, facebook: contact, line: contact, instagram: contact, x: contact }),
  room_types: z.array(room), rate_overrides: z.array(override), extra_services: z.array(service),
  website: z.object({ hero_copy: z.string().nullable(), accent_color: z.string().regex(/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/).nullable(), theme: z.string().refine(value => value === null || isHotelThemeId(value)).nullable(), visible_sections: z.record(z.string(), z.boolean()).nullable() }),
}).superRefine((value, ctx) => {
  if (value.format !== "hayhost-hotel") ctx.addIssue({ code: "custom", path: ["format"], message: "ไฟล์นี้ไม่ใช่ข้อมูลโรงแรมของ hayhost" });
  if (value.version !== 1) ctx.addIssue({ code: "custom", path: ["version"], message: "ไม่รองรับข้อมูลโรงแรมเวอร์ชันนี้" });
  const roomNames = new Set<string>();
  value.room_types.forEach((row, index) => {
    const name = row.name.toLocaleLowerCase();
    if (roomNames.has(name)) ctx.addIssue({ code: "custom", path: ["room_types", index, "name"], message: "ชื่อประเภทห้องซ้ำกันในไฟล์" });
    roomNames.add(name);
    if (row.max_occupancy < row.base_occupancy) ctx.addIssue({ code: "custom", path: ["room_types", index], message: "จำนวนผู้เข้าพักและราคาไม่ถูกต้อง" });
    const pricingError = getRoomTypePricingValidationError({ base_occupancy: row.base_occupancy, max_occupancy: row.max_occupancy, occupancy_pricing: row.occupancy_pricing, child_rule: row.child_rule, child_rule_limit: row.child_rule_limit, child_rates: row.child_rates });
    if (pricingError) ctx.addIssue({ code: "custom", path: ["room_types", index], message: "ข้อมูลราคาและจำนวนผู้เข้าพักไม่ถูกต้อง" });
  });
  const serviceNames = new Set<string>();
  value.extra_services.forEach((row, index) => {
    const name = row.name.toLocaleLowerCase();
    if (serviceNames.has(name)) ctx.addIssue({ code: "custom", path: ["extra_services", index, "name"], message: "ชื่อบริการซ้ำกันในไฟล์" });
    serviceNames.add(name);
  });
  for (const item of value.rate_overrides) if (item.end_date < item.start_date) ctx.addIssue({ code: "custom", path: ["rate_overrides"], message: "ช่วงวันที่ราคาไม่ถูกต้อง" });
});
export type HotelDataDocument = z.infer<typeof hotelDataDocumentSchema>;
export type ImportChange = { section: string; action: "added" | "updated" | "skipped"; name: string; detail?: string };
export function validateHotelDataDocument(value: unknown): HotelDataDocument {
  const parsed = hotelDataDocumentSchema.safeParse(value);
  if (!parsed.success) throw new TRPCError({ code: "BAD_REQUEST", message: parsed.error.issues.map(issue => issue.message).join("; ") || "ไฟล์ข้อมูลโรงแรมไม่ถูกต้อง" });
  return parsed.data;
}
export function buildHotelImportPlan(file: HotelDataDocument, current: { roomTypes: Array<{ name: string }>; services: Array<{ name: string }>; rateOverrides: Array<{ room_type_name: string; start_date: string; end_date: string }>; canManageRates: boolean }): ImportChange[] {
  const existingRoomNames = new Set(current.roomTypes.map(row => row.name.toLocaleLowerCase()));
  const roomNames = new Set(existingRoomNames);
  for (const row of file.room_types) roomNames.add(row.name.toLocaleLowerCase());
  const serviceNames = new Set(current.services.map(row => row.name.toLocaleLowerCase()));
  const changes: ImportChange[] = [
    { section: "profile", action: "updated", name: file.profile.name },
    ...file.room_types.map(row => {
      const exists = existingRoomNames.has(row.name.toLocaleLowerCase());
      return { section: "room_types", action: exists ? "updated" as const : current.canManageRates ? "added" as const : "skipped" as const, name: row.name, detail: current.canManageRates ? undefined : exists ? "ไม่มีสิทธิ์จัดการราคา จึงคงราคาเดิม" : "ไม่มีสิทธิ์จัดการราคา จึงข้ามประเภทห้องใหม่นี้" };
    }),
    ...file.extra_services.map(row => {
      const exists = serviceNames.has(row.name.toLocaleLowerCase());
      return { section: "extra_services", action: exists ? "updated" as const : current.canManageRates ? "added" as const : "skipped" as const, name: row.name, detail: current.canManageRates ? undefined : exists ? "ไม่มีสิทธิ์จัดการราคา จึงคงราคาเดิม" : "ไม่มีสิทธิ์จัดการราคา จึงข้ามบริการใหม่นี้" };
    }),
    ...file.rate_overrides.map((row, index) => {
      const name = row.room_type_name.toLocaleLowerCase();
      const overlaps = (candidate: { room_type_name: string; start_date: string; end_date: string }) => candidate.room_type_name.toLocaleLowerCase() === name && candidate.start_date <= row.end_date && candidate.end_date >= row.start_date;
      const exists = current.rateOverrides.some(overlaps) || file.rate_overrides.slice(0, index).some(overlaps);
      return { section: "rate_overrides", action: !roomNames.has(name) || !current.canManageRates ? "skipped" as const : exists ? "updated" as const : "added" as const, name: row.room_type_name, detail: !roomNames.has(name) ? "ไม่พบประเภทห้อง จึงข้ามราคา" : !current.canManageRates ? "ไม่มีสิทธิ์จัดการราคา จึงข้ามราคา" : undefined };
    }),
    ...(file.website ? [{ section: "website", action: "updated" as const, name: "website" }] : []),
  ];
  return changes;
}
