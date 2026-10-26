import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const supabaseMocks = vi.hoisted(() => ({
  createRlsSupabaseClient: vi.fn(),
}));

vi.mock("./supabase", () => supabaseMocks);
vi.mock("node:dns/promises", () => ({
  lookup: vi.fn(async () => [{ address: "93.184.216.34", family: 4 }]),
}));

import {
  buildIcalSyncPayload,
  countUpdatedIcalItems,
  getUpdatedItemCount,
  parseIcalEventFingerprints,
} from "./otaSync";

const feed = (...summaries: string[]) => [
  "BEGIN:VCALENDAR",
  ...summaries.flatMap((summary, index) => [
    "BEGIN:VEVENT",
    `UID:booking-${index + 1}`,
    "DTSTART:20260820",
    `SUMMARY:${summary}`,
    "END:VEVENT",
  ]),
  "END:VCALENDAR",
].join("\n");

describe("OTA calendar sync updated-item count", () => {
  it("parses iCal events and counts a changed event", () => {
    const previous = parseIcalEventFingerprints(feed("Room A"));
    const current = parseIcalEventFingerprints(feed("Room B"));

    expect(current).toHaveLength(1);
    expect(countUpdatedIcalItems(previous, current)).toBe(1);
  });

  it("builds the persisted sync payload with a non-zero changed-item count", () => {
    const previous = parseIcalEventFingerprints(feed("Room A"));
    const current = parseIcalEventFingerprints(feed("Room A", "Room B"));
    const payload = buildIcalSyncPayload(previous, current);

    expect(payload.processedItemCount).toBe(2);
    expect(payload.updatedItemCount).toBe(1);
    expect(getUpdatedItemCount({ payload })).toBe(1);
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

type QueryResult = { data: unknown; error: { message: string } | null };
type QueryOp = "select" | "insert" | "update";

/** Thenable stand-in for a Supabase query; the handler decides each result by table + operation. */
function fakeSupabase(handler: (table: string, op: QueryOp, value?: any) => QueryResult) {
  return {
    from(table: string) {
      let op: QueryOp = "select";
      let value: unknown;
      const query: any = {
        select: () => query,
        eq: () => query,
        order: () => query,
        limit: () => query,
        maybeSingle: () => query,
        insert: (row: unknown) => { op = "insert"; value = row; return query; },
        update: (row: unknown) => { op = "update"; value = row; return query; },
        then: (resolve: (result: QueryResult) => unknown, reject: (error: unknown) => unknown) =>
          Promise.resolve().then(() => handler(table, op, value)).then(resolve, reject),
      };
      return query;
    },
  };
}

describe("triggerOtaCalendarSync write failures", () => {
  const hotelId = "88ed76e4-cc93-4aa7-9c4d-30999d35ada4";
  const provider = "booking";
  const connection = { hotel_id: hotelId, provider, status: "active", ical_import_url: "https://example.com/feed.ics" };
  const ok: QueryResult = { data: null, error: null };

  let failInsertStatus: "success" | "failed" | null;
  let updateError: QueryResult["error"];
  let insertedLogs: any[];

  beforeEach(() => {
    vi.clearAllMocks();
    failInsertStatus = null;
    updateError = null;
    insertedLogs = [];
    vi.stubGlobal("fetch", vi.fn(async () => new Response(feed("Room A"), { status: 200 })));
    supabaseMocks.createRlsSupabaseClient.mockImplementation(() => fakeSupabase((table, op, value) => {
      if (table === "ota_connections" && op === "select") return { data: [connection], error: null };
      if (table === "ota_connections" && op === "update") return { data: null, error: updateError };
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

  it("succeeds and records one success log when every write succeeds", async () => {
    const { triggerOtaCalendarSync } = await import("./otaSync");

    await expect(triggerOtaCalendarSync("token", hotelId, provider)).resolves.toMatchObject({ success: true, updatedItemCount: 1 });
    expect(insertedLogs.map(log => log.status)).toEqual(["success"]);
  });

  it("rejects when writing the success log fails, instead of reporting success", async () => {
    failInsertStatus = "success";
    const { triggerOtaCalendarSync } = await import("./otaSync");

    await expect(triggerOtaCalendarSync("token", hotelId, provider))
      .rejects.toThrow("Failed to write OTA sync log: rls denied");
    expect(insertedLogs.map(log => log.status)).toEqual(["success", "failed"]);
  });

  it("rejects when updating the connection sync time fails", async () => {
    updateError = { message: "update denied" };
    const { triggerOtaCalendarSync } = await import("./otaSync");

    await expect(triggerOtaCalendarSync("token", hotelId, provider))
      .rejects.toThrow("Failed to update OTA connection sync time: update denied");
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
});

