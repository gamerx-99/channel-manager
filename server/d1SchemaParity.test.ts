import { getTableColumns, getTableName } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { agents, bookings, d1Schema, hotels } from "../drizzle/d1-schema";

// App-owned public tables from the root SQL migration end state, plus owner-directed
// D1-only additions. Supabase-managed auth, storage, and migration tables are excluded.
const postgresPublicTables = [
  "availability",
  "agents",
  "booking_services",
  "booking_status_log",
  "bookings",
  "guests",
  "hotel_admin_audit_logs",
  "hotel_domains",
  "hotel_media",
  "hotel_payment_settings",
  "hotel_services",
  "hotel_signup_links",
  "hotel_site_config",
  "hotel_users",
  "hotels",
  "housekeeping_tasks",
  "message_threads",
  "messages",
  "notifications",
  "ota_connections",
  "ota_sync_logs",
  "payment_sessions",
  "rate_overrides",
  "room_housekeeping_status",
  "room_types",
  "rooms",
  "service_accounts",
  "support_access_grants",
  "support_access_log",
].sort();

describe("D1 schema parity", () => {
  it("contains every app-owned Postgres table and no Supabase-internal tables", () => {
    const d1Tables = Object.values(d1Schema).map(table => getTableName(table)).sort();
    expect(d1Tables).toEqual(postgresPublicTables);
  });

  it("includes acquisition, agent, and booking-consent schema additions", () => {
    expect(Object.keys(getTableColumns(hotels))).toEqual(expect.arrayContaining([
      "acquisitionSource",
      "referredByHotelId",
      "agentId",
    ]));
    expect(Object.keys(getTableColumns(agents))).toEqual(expect.arrayContaining([
      "id", "name", "phone", "email", "status", "createdAt",
    ]));
    expect(Object.keys(getTableColumns(bookings))).toEqual(expect.arrayContaining([
      "marketingConsent", "marketingConsentAt",
    ]));
  });
});
