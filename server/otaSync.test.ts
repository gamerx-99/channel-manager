import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const supabaseMocks = vi.hoisted(() => ({
  createRlsSupabaseClient: vi.fn(),
}));

vi.mock("./supabase", () => supabaseMocks);
vi.mock("node:dns/promises", () => ({
  lookup: vi.fn(async () => [{ address: "93.184.216.34", family: 4 }]),
}));

import {
  buildIcalExportUrl,
  buildIcalSyncPayload,
  getUpdatedItemCount,
  toOtaConnectionView,
  type IcalBlockSyncResult,
} from "./otaSync";

const feed = (...summaries: string[]) => [
  "BEGIN:VCALENDAR",
  ...summaries.flatMap((summary, index) => [
    "BEGIN:VEVENT",
    `UID:booking-${index + 1}`,
    `DTSTART;VALUE=DATE:202611${String(10 + index * 3)}`,
    `DTEND;VALUE=DATE:202611${String(12 + index * 3)}`,
    `SUMMARY:${summary}`,
    "END:VEVENT",
  ]),
  "END:VCALENDAR",
].join("\r\n");

const noChanges: IcalBlockSyncResult = { inserted: 0, updated: 0, unchanged: 0, cancelled: 0, conflicts: [] };

describe("OTA calendar sync updated-item count", () => {
  it("counts inserted, updated and cancelled blocks as updated items, not unchanged ones", () => {
    const payload = buildIcalSyncPayload(
      [{ uid: "a", start: "2026-11-10", end: "2026-11-12", summary: "" }, { uid: "b", start: "2026-11-13", end: "2026-11-15", summary: "" }],
      { inserted: 1, updated: 1, unchanged: 3, cancelled: 2, conflicts: [] },
    );

    expect(payload.processedItemCount).toBe(2);
    expect(payload.updatedItemCount).toBe(4);
    expect(getUpdatedItemCount({ payload })).toBe(4);
  });

  it("prefers the count reported by the sync response", () => {
    expect(
      getUpdatedItemCount({
        response: { updatedItemCount: 4 },
        payload: { updatedItemCount: 2 },
      }),
    ).toBe(4);
  });

  it("accepts snake_case and imported count payloads", () => {
    expect(getUpdatedItemCount({ response: { updated_item_count: 3 } })).toBe(3);
    expect(getUpdatedItemCount({ payload: { imported_count: 5 } })).toBe(5);
  });

  it("returns zero when a sync log has no reported changed entries", () => {
    expect(
      getUpdatedItemCount({
        response: { message: "Successfully synchronized iCal calendar" },
        payload: { syncType: "iCal availability & blocked dates" },
      }),
    ).toBe(0);
  });

  it("does not treat a successful sync run as an updated-item count", () => {
    expect(getUpdatedItemCount({ response: { status: "success" } })).toBe(0);
  });
});

describe("OTA connection view", () => {
  const row = { id: "c1", hotel_id: "h1", provider: "Booking.com - 101", status: "active", ical_export_token: "a".repeat(64) };

  it("replaces the export token with a ready-to-paste URL for managers", () => {
    vi.stubEnv("PUBLIC_APP_URL", "https://hotel.example.com/");
    const view = toOtaConnectionView(row, true);

    expect(view.ical_export_url).toBe(`https://hotel.example.com/api/ical/${"a".repeat(64)}.ics`);
    expect(view).not.toHaveProperty("ical_export_token");
    vi.unstubAllEnvs();
  });

  it("never exposes the token or URL to non-managers", () => {
    const view = toOtaConnectionView(row, false);

    expect(view.ical_export_url).toBeNull();
    expect(JSON.stringify(view)).not.toContain("a".repeat(64));
  });

  it("builds the export URL under /api/ical", () => {
    expect(buildIcalExportUrl("b".repeat(64))).toMatch(/\/api\/ical\/b{64}\.ics$/);
  });
});

type QueryResult = { data: unknown; error: { message: string; code?: string } | null };
type QueryOp = "select" | "insert" | "update" | "rpc";

/** Thenable stand-in for a Supabase client; the handler decides each result by table + operation. */
function fakeSupabase(handler: (table: string, op: QueryOp, value?: any) => QueryResult) {
  const query = (table: string) => {
    let op: QueryOp = "select";
    let value: unknown;
    const builder: any = {
      select: () => builder,
      eq: () => builder,
      order: () => builder,
      limit: () => builder,
      maybeSingle: () => builder,
      insert: (row: unknown) => { op = "insert"; value = row; return builder; },
      update: (row: unknown) => { op = "update"; value = row; return builder; },
      then: (resolve: (result: QueryResult) => unknown, reject: (error: unknown) => unknown) =>
        Promise.resolve().then(() => handler(table, op, value)).then(resolve, reject),
    };
    return builder;
  };
  return {
    from: query,
    rpc: (name: string, args: unknown) => Promise.resolve().then(() => handler(name, "rpc", args)),
  };
}

describe("triggerOtaCalendarSync", () => {
  const hotelId = "88ed76e4-cc93-4aa7-9c4d-30999d35ada4";
  const provider = "Booking.com - 101";
  const connection = {
    id: "conn-1",
    hotel_id: hotelId,
    provider,
    status: "active",
    room_id: "room-101",
    ical_import_url: "https://admin.booking.com/hotel/hoteladmin/ical.html?t=abc",
  };
  const ok: QueryResult = { data: null, error: null };

  let connectionRow: typeof connection | null;
  let rpcResult: QueryResult;
  let failInsertStatus: "success" | "failed" | null;
  let rpcCalls: any[];
  let insertedLogs: any[];
  let connectionUpdates: any[];

  beforeEach(() => {
    vi.clearAllMocks();
    connectionRow = { ...connection };
    rpcResult = { data: { ...noChanges, inserted: 2 }, error: null };
    failInsertStatus = null;
    rpcCalls = [];
    insertedLogs = [];
    connectionUpdates = [];
    vi.stubGlobal("fetch", vi.fn(async () => new Response(feed("CLOSED - Not available", "CLOSED - Not available"), { status: 200 })));
    supabaseMocks.createRlsSupabaseClient.mockImplementation(() => fakeSupabase((table, op, value) => {
      if (table === "ota_connections" && op === "select") return { data: connectionRow, error: null };
      if (table === "ota_connections" && op === "update") { connectionUpdates.push(value); return ok; }
      if (table === "sync_ota_ical_blocks" && op === "rpc") { rpcCalls.push(value); return rpcResult; }
      if (table === "ota_sync_logs" && op === "insert") {
        insertedLogs.push(value);
        return value.status === failInsertStatus ? { data: null, error: { message: "rls denied" } } : ok;
      }
      return ok;
    }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sends the parsed events to the reconcile RPC and logs the result", async () => {
    const { triggerOtaCalendarSync } = await import("./otaSync");

    await expect(triggerOtaCalendarSync("token", hotelId, provider))
      .resolves.toMatchObject({ success: true, updatedItemCount: 2, conflictCount: 0 });
    expect(rpcCalls).toEqual([{
      target_connection_id: "conn-1",
      events: [
        { uid: "booking-1", start: "2026-11-10", end: "2026-11-12", summary: "CLOSED - Not available" },
        { uid: "booking-2", start: "2026-11-13", end: "2026-11-15", summary: "CLOSED - Not available" },
      ],
    }]);
    expect(insertedLogs).toHaveLength(1);
    expect(insertedLogs[0]).toMatchObject({ status: "success", payload: { inserted: 2, processedItemCount: 2 } });
  });

  it("reports conflicts from the RPC instead of hiding them", async () => {
    rpcResult = { data: { ...noChanges, conflicts: [{ uid: "booking-1", start: "2026-11-10", end: "2026-11-12" }] }, error: null };
    const { triggerOtaCalendarSync } = await import("./otaSync");

    const result = await triggerOtaCalendarSync("token", hotelId, provider);

    expect(result.conflictCount).toBe(1);
    expect(insertedLogs[0].response.message).toContain("overlap existing bookings");
  });

  it("refuses to sync a connection that has no room, and marks it as error", async () => {
    connectionRow = { ...connection, room_id: null as unknown as string };
    const { triggerOtaCalendarSync } = await import("./otaSync");

    await expect(triggerOtaCalendarSync("token", hotelId, provider)).rejects.toThrow("Choose the room");
    expect(rpcCalls).toHaveLength(0);
    expect(insertedLogs.map(log => log.status)).toEqual(["failed"]);
    expect(connectionUpdates[0]).toMatchObject({ status: "error" });
  });

  it("surfaces an RPC error with its Postgres code so the router can map it", async () => {
    rpcResult = { data: null, error: { code: "42501", message: "Not authorized to sync this OTA calendar." } };
    const { triggerOtaCalendarSync } = await import("./otaSync");

    await expect(triggerOtaCalendarSync("token", hotelId, provider))
      .rejects.toThrow("42501: Not authorized to sync this OTA calendar.");
  });

  it("rejects when writing the success log fails, instead of reporting success", async () => {
    failInsertStatus = "success";
    const { triggerOtaCalendarSync } = await import("./otaSync");

    await expect(triggerOtaCalendarSync("token", hotelId, provider))
      .rejects.toThrow("Failed to write OTA sync log: rls denied");
    expect(insertedLogs.map(log => log.status)).toEqual(["success", "failed"]);
  });

  it("preserves the fetch error when recording the failed sync also fails", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("feed unavailable"); }));
    failInsertStatus = "failed";
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const { triggerOtaCalendarSync } = await import("./otaSync");

    await expect(triggerOtaCalendarSync("token", hotelId, provider)).rejects.toThrow("feed unavailable");
    expect(consoleError).toHaveBeenCalledWith("[OTA Sync] failed to record failed sync log:", "Failed to write OTA sync log: rls denied");
    consoleError.mockRestore();
  });

  it("rejects a response that is not an iCal calendar", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("<html>login</html>", { status: 200 })));
    const { triggerOtaCalendarSync } = await import("./otaSync");

    await expect(triggerOtaCalendarSync("token", hotelId, provider)).rejects.toThrow("did not return an iCal calendar");
    expect(rpcCalls).toHaveLength(0);
  });
});
