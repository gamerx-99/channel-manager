import { sql, type SQLWrapper } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { SUPPORT_GRANT_DURATION_HOURS } from "../shared/permissions";

const id = (name = "id") => text(name).primaryKey().$defaultFn(() => crypto.randomUUID());
const createdAt = (name = "created_at") =>
  integer(name, { mode: "timestamp_ms" }).notNull().default(sql`(unixepoch() * 1000)`);
const updatedAt = (name = "updated_at") =>
  integer(name, { mode: "timestamp_ms" }).notNull().default(sql`(unixepoch() * 1000)`);
const json = <T>(name: string) => text(name, { mode: "json" }).$type<T>();
// SQLite NUMERIC coerces decimal strings to binary floating point. Keep amounts
// as canonical decimal text; calculations must use shared/db/money.ts.
const money = (name: string) => text(name);
const nonnegativeMoney = (value: SQLWrapper) => sql`typeof(${value}) = 'text' and ${value} <> ''
  and ${value} not glob '*[^0-9.]*' and ${value} not glob '*.*.*'
  and (instr(${value}, '.') = 0 or (instr(${value}, '.') > 1
    and length(substr(${value}, instr(${value}, '.') + 1)) between 1 and 2))
  and cast(${value} as numeric) >= 0`;
const nonnegativeDecimalText = (value: SQLWrapper) => sql`typeof(${value}) = 'text' and ${value} <> ''
  and ${value} not glob '*[^0-9.]*' and ${value} not glob '*.*.*'
  and (instr(${value}, '.') = 0 or instr(${value}, '.') > 1)
  and cast(${value} as numeric) >= 0`;
const maxSupportGrantMs = Math.max(...SUPPORT_GRANT_DURATION_HOURS) * 60 * 60 * 1000;

export const agents = sqliteTable("agents", {
  id: id(),
  name: text("name").notNull(),
  phone: text("phone"),
  email: text("email"),
  status: text("status").notNull(),
  createdAt: createdAt(),
}, table => [check("agents_status_check", sql`${table.status} in ('active', 'inactive')`)]);

export const hotels = sqliteTable("hotels", {
  id: id(),
  name: text("name").notNull(),
  slug: text("slug").notNull(),
  address: text("address").notNull(),
  ownerContact: text("owner_contact").notNull(),
  publicEnabled: integer("public_enabled", { mode: "boolean" }).notNull().default(true),
  createdAt: createdAt(),
  acquisitionSource: text("acquisition_source").notNull().default("direct"),
  referredByHotelId: text("referred_by_hotel_id"),
  agentId: text("agent_id").references(() => agents.id, { onDelete: "set null" }),
}, table => [
  check("hotels_acquisition_source_check", sql`${table.acquisitionSource} in ('direct', 'referral', 'agent')`),
  uniqueIndex("hotels_slug_key").on(table.slug),
  foreignKey({
    name: "hotels_referred_by_hotel_id_hotels_id_fk",
    columns: [table.referredByHotelId],
    foreignColumns: [table.id],
  }).onDelete("set null"),
]);

export const hotelUsers = sqliteTable("hotel_users", {
  id: id(),
  hotelId: text("hotel_id").notNull().references(() => hotels.id, { onDelete: "cascade" }),
  // Supabase auth.users is internal and will be replaced by Better Auth in 13-05.
  userId: text("user_id").notNull(),
  role: text("role").notNull(),
  permissionGrants: json<string[]>("permission_grants").notNull().default(sql`'[]'`),
  permissionRevokes: json<string[]>("permission_revokes").notNull().default(sql`'[]'`),
  createdAt: createdAt(),
}, table => [
  check("hotel_users_role_check", sql`${table.role} in ('super_admin', 'admin', 'support', 'hotel_owner', 'revenue_manager', 'front_desk', 'housekeeping')`),
  check("hotel_users_permission_grants_json_array", sql`json_valid(${table.permissionGrants}) = 1 and json_type(${table.permissionGrants}) = 'array'`),
  check("hotel_users_permission_revokes_json_array", sql`json_valid(${table.permissionRevokes}) = 1 and json_type(${table.permissionRevokes}) = 'array'`),
  uniqueIndex("uq_hotel_user_membership").on(table.hotelId, table.userId),
  uniqueIndex("uq_one_hotel_admin_per_hotel").on(table.hotelId).where(sql`${table.role} = 'hotel_owner'`),
  index("idx_hotel_users_user_id").on(table.userId),
  index("idx_hotel_users_hotel_id").on(table.hotelId),
]);

export const hotelMedia = sqliteTable("hotel_media", {
  id: id(),
  hotelId: text("hotel_id").notNull().references(() => hotels.id, { onDelete: "cascade" }),
  url: text("url").notNull(),
  caption: text("caption"),
  isHero: integer("is_hero", { mode: "boolean" }).notNull().default(false),
  displayOrder: integer("display_order").notNull().default(0),
  createdAt: createdAt(),
}, table => [index("idx_hotel_media_hotel_order").on(table.hotelId, table.displayOrder)]);

export const roomTypes = sqliteTable("room_types", {
  id: id(),
  hotelId: text("hotel_id").notNull().references(() => hotels.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  capacity: integer("capacity").notNull(),
  basePrice: money("base_price").notNull(),
  createdAt: createdAt(),
  baseOccupancy: integer("base_occupancy").notNull().default(2),
  maxOccupancy: integer("max_occupancy").notNull().default(2),
  occupancyPricing: json<Record<string, unknown>>("occupancy_pricing").notNull().default(sql`'{}'`),
  childRule: text("child_rule").notNull().default("age"),
  childRuleLimit: text("child_rule_limit"),
  childRates: json<Record<string, unknown>>("child_rates").notNull().default(sql`'{"infant":{"mode":"free","value":0},"age_groups":[],"height":{"mode":"free","value":0}}'`),
  childrenCountTowardMax: integer("children_count_toward_max", { mode: "boolean" }).notNull().default(true),
}, table => [
  check("room_types_capacity_check", sql`${table.capacity} > 0`),
  check("room_types_base_price_check", nonnegativeMoney(table.basePrice)),
  check("room_types_occupancy_values_check", sql`${table.baseOccupancy} >= 1 and ${table.maxOccupancy} >= ${table.baseOccupancy} and json_valid(${table.occupancyPricing}) = 1 and json_type(${table.occupancyPricing}) = 'object' and ${table.childRule} in ('age', 'height') and (${table.childRuleLimit} is null or (${nonnegativeDecimalText(table.childRuleLimit)}))`),
  index("idx_room_types_hotel_id").on(table.hotelId),
]);

export const rooms = sqliteTable("rooms", {
  id: id(),
  hotelId: text("hotel_id").notNull().references(() => hotels.id, { onDelete: "cascade" }),
  roomTypeId: text("room_type_id").notNull().references(() => roomTypes.id, { onDelete: "cascade" }),
  roomNumber: text("room_number").notNull(),
  status: text("status").notNull().default("available"),
}, table => [
  check("rooms_status_check", sql`${table.status} in ('available', 'occupied', 'maintenance')`),
  uniqueIndex("unique_room_per_hotel").on(table.hotelId, table.roomNumber),
  index("idx_rooms_hotel_id").on(table.hotelId),
  index("idx_rooms_room_type_id").on(table.roomTypeId),
]);

export const otaConnections = sqliteTable("ota_connections", {
  id: id(),
  hotelId: text("hotel_id").notNull().references(() => hotels.id, { onDelete: "cascade" }),
  provider: text("provider").notNull(),
  status: text("status").notNull().default("disconnected"),
  apiKey: text("api_key"),
  hotelCode: text("hotel_code"),
  icalImportUrl: text("ical_import_url"),
  icalExportUrl: text("ical_export_url"),
  lastSyncAt: integer("last_sync_at", { mode: "timestamp_ms" }),
  updatedAt: updatedAt(),
  createdAt: createdAt(),
  roomId: text("room_id").references(() => rooms.id, { onDelete: "set null" }),
  icalExportToken: text("ical_export_token").notNull().$defaultFn(() => crypto.randomUUID().replaceAll("-", "")),
  lastError: text("last_error"),
  roomTypeId: text("room_type_id").references(() => roomTypes.id, { onDelete: "set null" }),
}, table => [
  check("ota_connections_status_check", sql`${table.status} in ('active', 'connected', 'conflict', 'error', 'disconnected')`),
  check("ota_connections_single_target", sql`not (${table.roomId} is not null and ${table.roomTypeId} is not null)`),
  uniqueIndex("uq_hotel_provider").on(table.hotelId, table.provider),
  uniqueIndex("idx_ota_connections_export_token").on(table.icalExportToken),
  index("idx_ota_connections_hotel_id").on(table.hotelId),
]);

export const bookings = sqliteTable("bookings", {
  id: id(),
  hotelId: text("hotel_id").notNull().references(() => hotels.id, { onDelete: "cascade" }),
  roomId: text("room_id").references(() => rooms.id, { onDelete: "set null" }),
  guestName: text("guest_name").notNull(),
  checkIn: text("check_in").notNull(),
  checkOut: text("check_out").notNull(),
  price: money("price").notNull(),
  source: text("source").notNull().default("manual"),
  status: text("status").notNull().default("confirmed"),
  createdAt: createdAt(),
  otaConnectionId: text("ota_connection_id").references(() => otaConnections.id, { onDelete: "cascade" }),
  externalUid: text("external_uid"),
  paymentStatus: text("payment_status").notNull().default("unpaid"),
  expiresAt: integer("expires_at", { mode: "timestamp_ms" }),
  paymentMethod: text("payment_method"),
  latePayment: integer("late_payment", { mode: "boolean" }).notNull().default(false),
  createdBy: text("created_by"),
  adultsCount: integer("adults_count"),
  childrenCount: integer("children_count"),
  marketingConsent: integer("marketing_consent", { mode: "boolean" }).notNull().default(false),
  marketingConsentAt: text("marketing_consent_at"),
}, table => [
  check("bookings_valid_dates_check", sql`${table.checkOut} > ${table.checkIn}`),
  check("bookings_price_check", nonnegativeMoney(table.price)),
  check("bookings_source_check", sql`${table.source} in ('manual', 'walk-in', 'phone', 'ota_ical')`),
  check("bookings_status_check", sql`${table.status} in ('held', 'pending_payment', 'pending_verification', 'confirmed', 'expired', 'payment_rejected', 'cancelled', 'refund_pending', 'refunded', 'checked_in', 'checked_out')`),
  check("bookings_payment_status_check", sql`${table.paymentStatus} in ('unpaid', 'pending', 'verified', 'failed')`),
  check("bookings_payment_method_check", sql`${table.paymentMethod} is null or ${table.paymentMethod} in ('cash', 'transfer', 'promptpay')`),
  check("bookings_ota_block_shape", sql`(${table.source} = 'ota_ical') = (${table.otaConnectionId} is not null and ${table.externalUid} is not null)`),
  index("idx_bookings_hotel_dates").on(table.hotelId, table.checkIn, table.checkOut),
  index("idx_bookings_room_dates").on(table.roomId, table.checkIn, table.checkOut),
  index("idx_bookings_expires_at").on(table.expiresAt).where(sql`${table.expiresAt} is not null`),
  uniqueIndex("idx_bookings_ota_external_uid").on(table.otaConnectionId, table.externalUid).where(sql`${table.otaConnectionId} is not null`),
]);

export const guests = sqliteTable("guests", {
  id: id(),
  bookingId: text("booking_id").notNull().references(() => bookings.id, { onDelete: "cascade" }),
  firstName: text("first_name").notNull(),
  middleName: text("middle_name"),
  lastName: text("last_name").notNull(),
  gender: text("gender"),
  passportNo: text("passport_no").notNull(),
  nationalityCode: text("nationality_code").notNull(),
  birthDate: text("birth_date").notNull(),
  phoneNo: text("phone_no"),
  createdAt: createdAt(),
}, table => [
  check("guests_gender_check", sql`${table.gender} is null or ${table.gender} in ('M', 'F')`),
  check("guests_nationality_code_check", sql`length(${table.nationalityCode}) = 3 and ${table.nationalityCode} not glob '*[^A-Z]*'`),
  index("idx_guests_booking_id").on(table.bookingId),
]);

export const availability = sqliteTable("availability", {
  id: id(),
  roomTypeId: text("room_type_id").notNull().references(() => roomTypes.id, { onDelete: "cascade" }),
  date: text("date").notNull(),
  price: money("price").notNull(),
  roomsAvailable: integer("rooms_available").notNull(),
}, table => [
  check("availability_price_check", nonnegativeMoney(table.price)),
  check("availability_rooms_available_check", sql`${table.roomsAvailable} >= 0`),
  uniqueIndex("unique_room_type_date").on(table.roomTypeId, table.date),
  index("idx_availability_room_type_date").on(table.roomTypeId, table.date),
]);

export const hotelDomains = sqliteTable("hotel_domains", {
  id: id(),
  hotelId: text("hotel_id").notNull().references(() => hotels.id, { onDelete: "cascade" }),
  domain: text("domain").notNull(),
  verified: integer("verified", { mode: "boolean" }).notNull().default(false),
  createdAt: createdAt(),
}, table => [
  uniqueIndex("hotel_domains_domain_key").on(table.domain),
  index("idx_hotel_domains_hotel_id").on(table.hotelId),
  index("idx_hotel_domains_verified").on(table.domain).where(sql`${table.verified} = 1`),
]);

export const otaSyncLogs = sqliteTable("ota_sync_logs", {
  id: id(),
  hotelId: text("hotel_id").notNull().references(() => hotels.id, { onDelete: "cascade" }),
  provider: text("provider").notNull(),
  direction: text("direction").notNull(),
  action: text("action").notNull(),
  status: text("status").notNull(),
  payload: json<unknown>("payload"),
  response: json<unknown>("response"),
  errorMessage: text("error_message"),
  createdAt: createdAt(),
}, table => [
  check("ota_sync_logs_direction_check", sql`${table.direction} in ('inbound', 'outbound')`),
  check("ota_sync_logs_status_check", sql`${table.status} in ('success', 'failed')`),
  index("idx_ota_sync_logs_hotel_time").on(table.hotelId, table.createdAt),
]);

export const serviceAccounts = sqliteTable("service_accounts", {
  id: id(),
  name: text("name").notNull(),
  role: text("role").notNull().default("api_service"),
  hotelId: text("hotel_id").references(() => hotels.id, { onDelete: "cascade" }),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  createdAt: createdAt(),
}, table => [
  check("service_accounts_role_check", sql`${table.role} = 'api_service'`),
  uniqueIndex("service_accounts_name_key").on(table.name),
  index("idx_service_accounts_hotel_id").on(table.hotelId),
]);

export const roomHousekeepingStatus = sqliteTable("room_housekeeping_status", {
  roomId: text("room_id").primaryKey().references(() => rooms.id, { onDelete: "cascade" }),
  status: text("status").notNull().default("clean"),
  updatedBy: text("updated_by"),
  updatedAt: updatedAt(),
}, table => [check("room_housekeeping_status_check", sql`${table.status} in ('clean', 'dirty', 'out_of_order')`)]);

export const hotelAdminAuditLogs = sqliteTable("hotel_admin_audit_logs", {
  id: id(),
  hotelId: text("hotel_id").notNull().references(() => hotels.id, { onDelete: "cascade" }),
  actorUserId: text("actor_user_id").notNull(),
  actorEmail: text("actor_email"),
  action: text("action").notNull(),
  previousAdminMembershipId: text("previous_admin_membership_id").notNull(),
  previousAdminUserId: text("previous_admin_user_id").notNull(),
  newAdminMembershipId: text("new_admin_membership_id").notNull(),
  newAdminUserId: text("new_admin_user_id").notNull(),
  details: json<Record<string, unknown>>("details").notNull().default(sql`'{}'`),
  createdAt: createdAt(),
}, table => [
  check("hotel_admin_audit_logs_action_check", sql`${table.action} = 'hotel_admin_transfer'`),
  index("hotel_admin_audit_logs_hotel_created_idx").on(table.hotelId, table.createdAt),
]);

export const hotelSignupLinks = sqliteTable("hotel_signup_links", {
  id: id(),
  hotelId: text("hotel_id").notNull().references(() => hotels.id, { onDelete: "cascade" }),
  token: text("token").notNull(),
  createdBy: text("created_by").notNull(),
  expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
  usedAt: integer("used_at", { mode: "timestamp_ms" }),
  usedByUserId: text("used_by_user_id"),
  createdAt: createdAt(),
}, table => [
  uniqueIndex("hotel_signup_links_token_key").on(table.token),
  index("hotel_signup_links_token_idx").on(table.token),
  index("hotel_signup_links_hotel_idx").on(table.hotelId),
]);

export const rateOverrides = sqliteTable("rate_overrides", {
  id: id(),
  roomTypeId: text("room_type_id").notNull().references(() => roomTypes.id, { onDelete: "cascade" }),
  startDate: text("start_date").notNull(),
  endDate: text("end_date").notNull(),
  overridePrice: money("override_price").notNull(),
  minStayNights: integer("min_stay_nights"),
  createdAt: createdAt(),
}, table => [
  check("rate_overrides_price_check", nonnegativeMoney(table.overridePrice)),
  check("rate_overrides_min_stay_check", sql`${table.minStayNights} is null or ${table.minStayNights} > 0`),
  check("valid_rate_override_dates", sql`${table.endDate} >= ${table.startDate}`),
  index("idx_rate_overrides_room_type_id").on(table.roomTypeId),
  index("idx_rate_overrides_dates").on(table.roomTypeId, table.startDate, table.endDate),
]);

export const housekeepingTasks = sqliteTable("housekeeping_tasks", {
  id: id(),
  roomId: text("room_id").notNull().references(() => rooms.id, { onDelete: "cascade" }),
  bookingId: text("booking_id").references(() => bookings.id, { onDelete: "set null" }),
  assignedTo: text("assigned_to"),
  dueDate: text("due_date").notNull(),
  status: text("status").notNull().default("pending"),
  createdAt: createdAt(),
}, table => [
  check("housekeeping_tasks_status_check", sql`${table.status} in ('pending', 'in_progress', 'done')`),
  index("idx_housekeeping_tasks_room_id").on(table.roomId),
  index("idx_housekeeping_tasks_due_date").on(table.dueDate),
]);

export const messageThreads = sqliteTable("message_threads", {
  id: id(),
  hotelId: text("hotel_id").notNull().references(() => hotels.id, { onDelete: "cascade" }),
  bookingId: text("booking_id").references(() => bookings.id, { onDelete: "set null" }),
  createdAt: createdAt(),
}, table => [index("idx_message_threads_hotel_id").on(table.hotelId)]);

export const messages = sqliteTable("messages", {
  id: id(),
  threadId: text("thread_id").notNull().references(() => messageThreads.id, { onDelete: "cascade" }),
  senderUserId: text("sender_user_id"),
  body: text("body").notNull(),
  createdAt: createdAt(),
}, table => [index("idx_messages_thread_id").on(table.threadId)]);

export const hotelSiteConfig = sqliteTable("hotel_site_config", {
  hotelId: text("hotel_id").primaryKey().references(() => hotels.id, { onDelete: "cascade" }),
  heroCopy: text("hero_copy"),
  accentColor: text("accent_color"),
  visibleSections: json<unknown>("visible_sections"),
  updatedAt: updatedAt(),
}, table => [
  check("hotel_site_config_accent_color_check", sql`${table.accentColor} is null or (substr(${table.accentColor}, 1, 1) = '#' and length(${table.accentColor}) in (4, 7) and substr(${table.accentColor}, 2) not glob '*[^A-Fa-f0-9]*')`),
  uniqueIndex("uq_hotel_site_config_hotel_id").on(table.hotelId),
  index("idx_hotel_site_config_updated_at").on(table.updatedAt),
]);

export const hotelPaymentSettings = sqliteTable("hotel_payment_settings", {
  id: id(),
  hotelId: text("hotel_id").notNull().references(() => hotels.id, { onDelete: "cascade" }),
  slipokKeyEnc: text("slipok_key_enc"),
  slipokKeyHash: text("slipok_key_hash"),
  slipokEnabled: integer("slipok_enabled", { mode: "boolean" }).notNull().default(true),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
  promptpayId: text("promptpay_id"),
  paymentTimeoutMinutes: integer("payment_timeout_minutes").notNull().default(15),
  slipokBranchId: text("slipok_branch_id"),
  holdTimeoutMinutes: integer("hold_timeout_minutes").notNull().default(15),
}, table => [
  check("hotel_payment_settings_payment_timeout_check", sql`${table.paymentTimeoutMinutes} between 5 and 60`),
  check("hotel_payment_settings_hold_timeout_check", sql`${table.holdTimeoutMinutes} between 5 and 60`),
  uniqueIndex("hotel_payment_settings_hotel_id_unique").on(table.hotelId),
]);

export const notifications = sqliteTable("notifications", {
  id: id(),
  hotelId: text("hotel_id").notNull().references(() => hotels.id, { onDelete: "cascade" }),
  type: text("type").notNull(),
  message: text("message").notNull(),
  isRead: integer("is_read", { mode: "boolean" }).notNull().default(false),
  createdAt: createdAt(),
}, table => [index("notifications_hotel_id_idx").on(table.hotelId)]);

export const bookingServices = sqliteTable("booking_services", {
  id: id(),
  bookingId: text("booking_id").notNull().references(() => bookings.id, { onDelete: "cascade" }),
  serviceName: text("service_name").notNull(),
  pricingModel: text("pricing_model").notNull(),
  unitPrice: money("unit_price").notNull(),
  quantity: integer("quantity").notNull().default(1),
  totalPrice: money("total_price").notNull(),
  createdAt: createdAt(),
}, table => [
  check("booking_services_pricing_model_check", sql`${table.pricingModel} in ('PER_PERSON_PER_NIGHT', 'PER_NIGHT', 'ONE_TIME')`),
  check("booking_services_unit_price_check", nonnegativeMoney(table.unitPrice)),
  check("booking_services_quantity_check", sql`${table.quantity} >= 1`),
  check("booking_services_total_price_check", nonnegativeMoney(table.totalPrice)),
  index("idx_booking_services_booking_id").on(table.bookingId),
]);

export const paymentSessions = sqliteTable("payment_sessions", {
  id: id(),
  bookingId: text("booking_id").notNull().references(() => bookings.id, { onDelete: "cascade" }),
  hotelId: text("hotel_id").notNull().references(() => hotels.id, { onDelete: "cascade" }),
  amount: money("amount").notNull(),
  status: text("status").notNull().default("pending"),
  qrReference: text("qr_reference").notNull(),
  qrString: text("qr_string"),
  expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
  verifiedAt: integer("verified_at", { mode: "timestamp_ms" }),
  slipUrl: text("slip_url"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
  rawResponse: json<unknown>("raw_response"),
  verifiedTransactionRef: text("verified_transaction_ref"),
}, table => [
  check("payment_sessions_amount_check", sql`${nonnegativeMoney(table.amount)} and cast(${table.amount} as numeric) > 0`),
  check("payment_sessions_status_check", sql`${table.status} in ('pending', 'paid', 'expired', 'failed')`),
  index("idx_payment_sessions_booking_id").on(table.bookingId),
  index("idx_payment_sessions_hotel_id").on(table.hotelId),
  uniqueIndex("idx_payment_sessions_verified_ref_unique").on(table.verifiedTransactionRef).where(sql`${table.verifiedTransactionRef} is not null`),
]);

export const bookingStatusLog = sqliteTable("booking_status_log", {
  id: id(),
  bookingId: text("booking_id").notNull().references(() => bookings.id, { onDelete: "cascade" }),
  fromStatus: text("from_status"),
  toStatus: text("to_status").notNull(),
  changedBy: text("changed_by"),
  reason: text("reason"),
  createdAt: createdAt(),
}, table => [index("idx_booking_status_log_booking_id").on(table.bookingId)]);

export const hotelServices = sqliteTable("hotel_services", {
  id: id(),
  hotelId: text("hotel_id").notNull().references(() => hotels.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  pricingModel: text("pricing_model").notNull(),
  unitPrice: money("unit_price").notNull(),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, table => [
  check("hotel_services_pricing_model_check", sql`${table.pricingModel} in ('PER_PERSON_PER_NIGHT', 'PER_NIGHT', 'ONE_TIME')`),
  check("hotel_services_unit_price_check", nonnegativeMoney(table.unitPrice)),
  index("idx_hotel_services_hotel_id").on(table.hotelId),
]);

export const supportAccessGrants = sqliteTable("support_access_grants", {
  id: id(),
  hotelId: text("hotel_id").notNull().references(() => hotels.id, { onDelete: "cascade" }),
  supportUserId: text("support_user_id").notNull(),
  grantedBy: text("granted_by").notNull(),
  mode: text("mode").notNull(),
  expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
  revokedAt: integer("revoked_at", { mode: "timestamp_ms" }),
  createdAt: createdAt(),
}, table => [
  check("support_access_grants_mode_check", sql`${table.mode} in ('view', 'edit')`),
  check("support_access_grants_expiry_check", sql`${table.expiresAt} > ${table.createdAt} and ${table.expiresAt} <= ${table.createdAt} + ${sql.raw(String(maxSupportGrantMs))}`),
  index("support_access_grants_hotel_idx").on(table.hotelId),
  index("support_access_grants_support_user_idx").on(table.supportUserId),
  index("support_access_grants_expires_idx").on(table.expiresAt),
]);

export const supportAccessLog = sqliteTable("support_access_log", {
  id: id(),
  // Null links allow denied support attempts with no grant to be audited too.
  grantId: text("grant_id").references(() => supportAccessGrants.id, { onDelete: "set null" }),
  hotelId: text("hotel_id").notNull().references(() => hotels.id, { onDelete: "cascade" }),
  supportUserId: text("support_user_id").notNull(),
  action: text("action").notNull(),
  createdAt: createdAt(),
}, table => [
  index("support_access_log_grant_idx").on(table.grantId),
  index("support_access_log_hotel_created_idx").on(table.hotelId, table.createdAt),
]);

export const d1Schema = {
  agents,
  hotels,
  hotelUsers,
  hotelMedia,
  roomTypes,
  rooms,
  bookings,
  guests,
  availability,
  hotelDomains,
  otaConnections,
  otaSyncLogs,
  serviceAccounts,
  roomHousekeepingStatus,
  hotelAdminAuditLogs,
  hotelSignupLinks,
  rateOverrides,
  housekeepingTasks,
  messageThreads,
  messages,
  hotelSiteConfig,
  hotelPaymentSettings,
  notifications,
  bookingServices,
  paymentSessions,
  bookingStatusLog,
  hotelServices,
  supportAccessGrants,
  supportAccessLog,
};
