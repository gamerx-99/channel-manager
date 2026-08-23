import { describe, expect, it } from "vitest";
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
