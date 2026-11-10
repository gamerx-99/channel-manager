import { and, eq } from "drizzle-orm";
import { hotels, hotelServices, hotelSiteConfig, rateOverrides, roomTypes, rooms } from "../../drizzle/d1-schema";
import { splitRateRanges } from "../../shared/rateRangeSplit";
import { authorizeHotelAction, type D1CallerContext, type D1ScopedDatabase } from "../db/scope";
import { buildHotelImportPlan, validateHotelDataDocument, type HotelDataDocument } from "../hotelDataTransfer";
import { buildHotelSiteConfigDraft } from "./siteConfig";

export async function exportHotelSetup(db: D1ScopedDatabase, caller: D1CallerContext, hotelId: string) {
  await authorizeHotelAction(db, caller, hotelId, "property.manage_profile", "hotel_data.export", new Date());
  const [hotel] = await db.select().from(hotels).where(eq(hotels.id, hotelId)).limit(1);
  if (!hotel) throw new Error("ไม่พบข้อมูลโรงแรม");
  const [types, serviceRows, config, overrides, roomRows] = await Promise.all([
    db.select().from(roomTypes).where(eq(roomTypes.hotelId, hotelId)),
    db.select().from(hotelServices).where(eq(hotelServices.hotelId, hotelId)),
    db.select().from(hotelSiteConfig).where(eq(hotelSiteConfig.hotelId, hotelId)).limit(1),
    db.select({ roomTypeId: rateOverrides.roomTypeId, startDate: rateOverrides.startDate, endDate: rateOverrides.endDate, price: rateOverrides.overridePrice, minimumStay: rateOverrides.minStayNights }).from(rateOverrides).innerJoin(roomTypes, eq(rateOverrides.roomTypeId, roomTypes.id)).where(eq(roomTypes.hotelId, hotelId)),
    db.select({ roomTypeId: rooms.roomTypeId }).from(rooms).where(eq(rooms.hotelId, hotelId)),
  ]);
  const counts = new Map<string, number>();
  roomRows.forEach(row => counts.set(row.roomTypeId, (counts.get(row.roomTypeId) ?? 0) + 1));
  return {
    format: "hayhost-hotel", version: 1,
    profile: { name: hotel.name, address: hotel.address, owner_contact: hotel.ownerContact, latitude: hotel.latitude, longitude: hotel.longitude,
      phone: { value: hotel.publicPhone, show: hotel.showPublicPhone }, facebook: { value: hotel.facebookUrl, show: hotel.showFacebook }, line: { value: hotel.lineUrl, show: hotel.showLine }, instagram: { value: hotel.instagramUrl, show: hotel.showInstagram }, x: { value: hotel.xUrl, show: hotel.showX } },
    room_types: types.map(row => ({ name: row.name, description: row.description, bed_type: row.bedType, size_sqm: row.sizeSqm, amenities: row.amenities, capacity: row.capacity, base_occupancy: row.baseOccupancy, max_occupancy: row.maxOccupancy, occupancy_pricing: row.occupancyPricing as HotelDataDocument["room_types"][number]["occupancy_pricing"], base_price: row.basePrice, room_count: counts.get(row.id) ?? 0, child_rule: row.childRule as "age" | "height", child_rule_limit: row.childRuleLimit, child_rates: row.childRates as HotelDataDocument["room_types"][number]["child_rates"], children_count_toward_max: row.childrenCountTowardMax })),
    rate_overrides: overrides.map(row => ({ room_type_name: types.find(type => type.id === row.roomTypeId)?.name ?? "", start_date: row.startDate, end_date: row.endDate, price: row.price, minimum_stay: row.minimumStay })),
    extra_services: serviceRows.map(row => ({ name: row.name, pricing_model: row.pricingModel as "PER_PERSON_PER_NIGHT" | "PER_NIGHT" | "ONE_TIME", unit_price: row.unitPrice, active: row.isActive })),
    website: { hero_copy: config[0]?.heroCopy ?? null, accent_color: config[0]?.accentColor ?? null, theme: config[0]?.theme ?? null, visible_sections: config[0]?.visibleSections as Record<string, boolean> | null ?? null },
  } satisfies HotelDataDocument;
}

async function getImportContext(db: D1ScopedDatabase, caller: D1CallerContext, hotelId: string, file: HotelDataDocument, canManageRates: boolean) {
  await authorizeHotelAction(db, caller, hotelId, "property.manage_profile", "hotel_data.import.preview", new Date());
  const [types, services, overrides] = await Promise.all([
    db.select().from(roomTypes).where(eq(roomTypes.hotelId, hotelId)),
    db.select().from(hotelServices).where(eq(hotelServices.hotelId, hotelId)),
    db.select({ room_type_name: roomTypes.name, start_date: rateOverrides.startDate, end_date: rateOverrides.endDate }).from(rateOverrides).innerJoin(roomTypes, eq(rateOverrides.roomTypeId, roomTypes.id)).where(eq(roomTypes.hotelId, hotelId)),
  ]);
  return { types, services, plan: buildHotelImportPlan(file, { roomTypes: types, services, rateOverrides: overrides, canManageRates }) };
}

export async function previewHotelSetupImport(db: D1ScopedDatabase, caller: D1CallerContext, hotelId: string, raw: unknown, canManageRates: boolean) {
  const file = validateHotelDataDocument(raw);
  const result = await getImportContext(db, caller, hotelId, file, canManageRates);
  return { changes: result.plan, can_manage_rates: canManageRates };
}

export async function applyHotelSetupImport(db: D1ScopedDatabase, caller: D1CallerContext, hotelId: string, raw: unknown, canManageRates: boolean) {
  const file = validateHotelDataDocument(raw);
  const { types, services } = await getImportContext(db, caller, hotelId, file, canManageRates);
  const [siteConfig] = await db.select().from(hotelSiteConfig).where(eq(hotelSiteConfig.hotelId, hotelId)).limit(1);
  const typeByName = new Map(types.map(row => [row.name.toLocaleLowerCase(), row]));
  for (const item of file.room_types) if (!typeByName.has(item.name.toLocaleLowerCase()) && canManageRates) typeByName.set(item.name.toLocaleLowerCase(), { id: crypto.randomUUID(), name: item.name } as typeof types[number]);
  const serviceByName = new Map(services.map(row => [row.name.toLocaleLowerCase(), row]));
  const statements = [db.$client.prepare(`UPDATE hotels SET name=?, address=?, owner_contact=?, latitude=?, longitude=?, public_phone=?, show_public_phone=?, facebook_url=?, show_facebook=?, line_url=?, show_line=?, instagram_url=?, show_instagram=?, x_url=?, show_x=? WHERE id=?`).bind(
    file.profile.name, file.profile.address, file.profile.owner_contact, file.profile.latitude, file.profile.longitude,
    file.profile.phone.value, Number(file.profile.phone.show), file.profile.facebook.value, Number(file.profile.facebook.show), file.profile.line.value, Number(file.profile.line.show), file.profile.instagram.value, Number(file.profile.instagram.show), file.profile.x.value, Number(file.profile.x.show), hotelId,
  )];
  const currentRooms = await db.select({ roomTypeId: rooms.roomTypeId, roomNumber: rooms.roomNumber }).from(rooms).where(eq(rooms.hotelId, hotelId));
  let roomNumber = currentRooms.reduce((max, row) => Math.max(max, Number(row.roomNumber) || 0), 0);
  for (const item of file.room_types) {
    const found = types.find(row => row.name.toLocaleLowerCase() === item.name.toLocaleLowerCase());
    if (!found && !canManageRates) continue;
    const id = typeByName.get(item.name.toLocaleLowerCase())!.id;
    const basePrice = canManageRates || !found ? item.base_price : found.basePrice;
    const capacity = canManageRates || !found ? item.capacity : found.capacity;
    const baseOccupancy = canManageRates || !found ? item.base_occupancy : found.baseOccupancy;
    const maxOccupancy = canManageRates || !found ? item.max_occupancy : found.maxOccupancy;
    const occupancyPricing = canManageRates || !found ? item.occupancy_pricing : found.occupancyPricing;
    const childRule = canManageRates || !found ? item.child_rule : found.childRule;
    const childRuleLimit = canManageRates || !found ? item.child_rule_limit : found.childRuleLimit;
    const childRates = canManageRates || !found ? item.child_rates : found.childRates;
    const bind = [item.name, item.description, item.bed_type, item.size_sqm, JSON.stringify(item.amenities), capacity, basePrice, baseOccupancy, maxOccupancy, JSON.stringify(occupancyPricing), childRule, childRuleLimit, JSON.stringify(childRates), Number(item.children_count_toward_max), id, hotelId];
    if (found) statements.push(db.$client.prepare(`UPDATE room_types SET name=?, description=?, bed_type=?, size_sqm=?, amenities=?, capacity=?, base_price=?, base_occupancy=?, max_occupancy=?, occupancy_pricing=?, child_rule=?, child_rule_limit=?, child_rates=?, children_count_toward_max=? WHERE id=? AND hotel_id=?`).bind(...bind));
    else {
      statements.push(db.$client.prepare(`INSERT INTO room_types (name,description,bed_type,size_sqm,amenities,capacity,base_price,base_occupancy,max_occupancy,occupancy_pricing,child_rule,child_rule_limit,child_rates,children_count_toward_max,id,hotel_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(...bind));
    }
    // Existing rooms and booking references are retained; importing only tops up the requested inventory.
    const currentCount = found ? currentRooms.filter(row => row.roomTypeId === found.id).length : 0;
    for (let index = currentCount; index < item.room_count; index++) statements.push(db.$client.prepare("INSERT INTO rooms (id,hotel_id,room_type_id,room_number) VALUES (?,?,?,?)").bind(crypto.randomUUID(), hotelId, id, String(++roomNumber).padStart(3, "0")));
  }
  for (const item of file.extra_services) {
    const found = serviceByName.get(item.name.toLocaleLowerCase());
    if (found) statements.push(db.$client.prepare("UPDATE hotel_services SET name=?, pricing_model=?, unit_price=?, is_active=?, updated_at=(unixepoch() * 1000) WHERE id=? AND hotel_id=?").bind(item.name, canManageRates ? item.pricing_model : found.pricingModel, canManageRates ? item.unit_price : found.unitPrice, Number(item.active), found.id, hotelId));
    else if (canManageRates) statements.push(db.$client.prepare("INSERT INTO hotel_services (id,hotel_id,name,pricing_model,unit_price,is_active) VALUES (?,?,?,?,?,?)").bind(crypto.randomUUID(), hotelId, item.name, item.pricing_model, item.unit_price, Number(item.active)));
  }
  const existingOverrides = await db.select({ id: rateOverrides.id, roomTypeId: rateOverrides.roomTypeId, startDate: rateOverrides.startDate, endDate: rateOverrides.endDate, overridePrice: rateOverrides.overridePrice, minStayNights: rateOverrides.minStayNights }).from(rateOverrides).innerJoin(roomTypes, eq(rateOverrides.roomTypeId, roomTypes.id)).where(eq(roomTypes.hotelId, hotelId));
  if (canManageRates) {
    for (const item of file.rate_overrides) {
      const type = typeByName.get(item.room_type_name.toLocaleLowerCase());
      if (!type) continue;
      const existing = existingOverrides.filter(row => row.roomTypeId === type.id).map(row => ({ id: row.id, start_date: row.startDate, end_date: row.endDate, override_price: row.overridePrice, min_stay_nights: row.minStayNights }));
      const split = splitRateRanges(existing, { start_date: item.start_date, end_date: item.end_date, override_price: item.price, min_stay_nights: item.minimum_stay });
      if (split.deleteIds.length) statements.push(db.$client.prepare(`DELETE FROM rate_overrides WHERE id IN (${split.deleteIds.map(() => "?").join(",")})`).bind(...split.deleteIds));
      const virtualCreated = split.create.map(next => ({ ...next, id: crypto.randomUUID() }));
      for (const next of virtualCreated) statements.push(db.$client.prepare("INSERT INTO rate_overrides (id,room_type_id,start_date,end_date,override_price,min_stay_nights) VALUES (?,?,?,?,?,?)").bind(next.id, type.id, next.start_date, next.end_date, next.override_price, next.min_stay_nights ?? null));
      for (const id of split.deleteIds) { const i = existingOverrides.findIndex(row => row.id === id); if (i >= 0) existingOverrides.splice(i, 1); }
      for (const next of virtualCreated) existingOverrides.push({ id: next.id, roomTypeId: type.id, startDate: next.start_date, endDate: next.end_date, overridePrice: next.override_price!, minStayNights: next.min_stay_nights ?? null });
    }
  }
  const websiteDraft = buildHotelSiteConfigDraft(siteConfig, {
    ...(file.website.hero_copy !== null ? { hero_copy: file.website.hero_copy } : {}),
    ...(file.website.accent_color !== null ? { accent_color: file.website.accent_color } : {}),
    ...(file.website.theme !== null ? { theme: file.website.theme } : {}),
    ...(file.website.visible_sections !== null ? { visible_sections: file.website.visible_sections } : {}),
  });
  const now = Date.now();
  statements.push(db.$client.prepare(`INSERT INTO hotel_site_config (hotel_id,draft_json,draft_updated_at,updated_at) VALUES (?,?,?,?) ON CONFLICT(hotel_id) DO UPDATE SET draft_json=excluded.draft_json,draft_updated_at=excluded.draft_updated_at,updated_at=excluded.updated_at`).bind(hotelId, JSON.stringify(websiteDraft), now, now));
  await db.$client.batch(statements);
  return { applied: true, skipped_prices: !canManageRates && (file.rate_overrides.length > 0 || file.room_types.length > 0 || file.extra_services.length > 0) };
}
