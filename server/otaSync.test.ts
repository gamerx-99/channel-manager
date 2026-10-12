import { describe, expect, it } from "vitest";
import {
  buildIcalSyncPayload,
  buildOtaImportBlockDiff,
  buildOtaIcalFeed,
  buildOtaBlockUid,
  countNights,
  countUpdatedIcalItems,
  expandDateRange,
  getUpdatedItemCount,
  parseIcalEventFingerprints,
  parseIcalEvents,
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

describe("iCal two-way sync (Phase A1)", () => {
  describe("expandDateRange", () => {
    it("expands a multi-night range into one date per night", () => {
      expect(expandDateRange("2026-08-20", "2026-08-23")).toEqual([
        "2026-08-20",
        "2026-08-21",
        "2026-08-22",
      ]);
    });

    it("returns empty for inverted or equal dates", () => {
      expect(expandDateRange("2026-08-23", "2026-08-20")).toEqual([]);
      expect(expandDateRange("2026-08-20", "2026-08-20")).toEqual([]);
    });
  });

  describe("countNights", () => {
    it("counts half-open [checkIn, checkOut) nights", () => {
      expect(countNights("2026-08-20", "2026-08-23")).toBe(3);
      expect(countNights("2026-08-20", "2026-08-21")).toBe(1);
      expect(countNights("2026-08-20", "2026-08-20")).toBe(0);
      expect(countNights("2026-08-23", "2026-08-20")).toBe(0);
    });
  });

  describe("parseIcalEvents", () => {
    it("expands multi-night events and falls back to one night without DTEND", () => {
      const feed = [
        "BEGIN:VCALENDAR",
        "BEGIN:VEVENT",
        "UID:event-1@ota",
        "DTSTART;VALUE=DATE:20260820",
        "DTEND;VALUE=DATE:20260822",
        "SUMMARY:Deluxe Room",
        "END:VEVENT",
        "BEGIN:VEVENT",
        "UID:event-2@ota",
        "DTSTART;VALUE=DATE:20260901",
        "SUMMARY:Standard",
        "END:VEVENT",
        "END:VCALENDAR",
      ].join("\n");

      const events = parseIcalEvents(feed);
      expect(events).toHaveLength(2);
      expect(events[0]).toEqual({
        uid: "event-1@ota",
        summary: "Deluxe Room",
        nights: ["2026-08-20", "2026-08-21"],
      });
      expect(events[1].nights).toEqual(["2026-09-01"]);
    });

    it("unfolds RFC 5545 continuation lines", () => {
      const events = parseIcalEvents(foldedFeedSample());
      expect(events).toHaveLength(1);
      expect(events[0].summary).toBe("Deluxe Room");
      expect(events[0].nights).toEqual(["2026-08-20"]);
    });

    it("ignores events without a UID or DTSTART", () => {
      const feed = [
        "BEGIN:VCALENDAR",
        "BEGIN:VEVENT",
        "DTSTART;VALUE=DATE:20260820",
        "END:VEVENT",
        "END:VCALENDAR",
      ].join("\n");
      expect(parseIcalEvents(feed)).toEqual([]);
    });
  });
});

function foldedFeedSample() {
  return [
    "BEGIN:VCALENDAR",
    "BEGIN:VEVENT",
    "UID:folded-1@ota",
    "DTSTART;VALUE=DATE:20260820",
    "DTEND;VALUE=DATE:20260821",
    "SUMMARY:Deluxe ",
    " Room",
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
}

describe("buildOtaImportBlockDiff", () => {
  it("re-opens exactly the nights of cancelled events and blocks new ones", () => {
    const previous = [
      { room_type_id: "rt-1", date: "2026-08-20", source_uid: "event-1" },
      { room_type_id: "rt-1", date: "2026-08-21", source_uid: "event-1" },
    ];
    const resolvedEvents = [
      { uid: "event-2", room_type_id: "rt-2", nights: ["2026-08-21", "2026-08-22"] },
    ];
    const diff = buildOtaImportBlockDiff(previous, resolvedEvents);

    expect(diff.removed).toEqual([
      { room_type_id: "rt-1", date: "2026-08-20", source_uid: "event-1" },
      { room_type_id: "rt-1", date: "2026-08-21", source_uid: "event-1" },
    ]);
    expect(diff.added).toEqual([
      { room_type_id: "rt-2", date: "2026-08-21", source_uid: "event-2" },
      { room_type_id: "rt-2", date: "2026-08-22", source_uid: "event-2" },
    ]);
  });

  it("does not re-add nights that are already persisted", () => {
    const previous = [{ room_type_id: "rt-1", date: "2026-08-20", source_uid: "event-1" }];
    const resolvedEvents = [{ uid: "event-1", room_type_id: "rt-1", nights: ["2026-08-20"] }];
    const diff = buildOtaImportBlockDiff(previous, resolvedEvents);
    expect(diff.removed).toEqual([]);
    expect(diff.added).toEqual([]);
  });

  it("keeps one row per source event when two events cover the same night", () => {
    const resolvedEvents = [
      { uid: "event-1", room_type_id: "rt-1", nights: ["2026-08-20"] },
      { uid: "event-2", room_type_id: "rt-1", nights: ["2026-08-20"] },
    ];
    const diff = buildOtaImportBlockDiff([], resolvedEvents);
    // Two OTA reservations for the same room type / night = two blocked rooms.
    expect(diff.added).toHaveLength(2);
    expect(diff.added.map((row) => row.source_uid).sort()).toEqual(["event-1", "event-2"]);
  });

  it("re-opens only the cancelled event's nights when two events share a night", () => {
    const previous = [
      { room_type_id: "rt-1", date: "2026-08-20", source_uid: "event-1" },
      { room_type_id: "rt-1", date: "2026-08-20", source_uid: "event-2" },
    ];
    const resolvedEvents = [
      { uid: "event-1", room_type_id: "rt-1", nights: ["2026-08-20"] },
    ];
    const diff = buildOtaImportBlockDiff(previous, resolvedEvents);
    expect(diff.removed).toEqual([
      { room_type_id: "rt-1", date: "2026-08-20", source_uid: "event-2" },
    ]);
    expect(diff.added).toEqual([]);
  });
});

describe("buildOtaIcalFeed", () => {
  it("emits one all-day VEVENT per blocked night with stable UIDs", () => {
    const feed = buildOtaIcalFeed(
      [
        { hotel_id: "hotel-1", room_type_id: "rt-2", date: "2026-08-21" },
        { hotel_id: "hotel-1", room_type_id: "rt-1", date: "2026-08-20" },
      ],
      { calendarName: "Test Hotel", hotelId: "hotel-1", now: new Date("2026-10-12T00:00:00Z") },
    );

    expect(feed).toContain("BEGIN:VCALENDAR");
    expect(feed).toContain(`UID:${buildOtaBlockUid("hotel-1", "rt-1", "2026-08-20")}`);
    expect(feed).toContain("DTSTART;VALUE=DATE:2026-08-20");
    // All-day DTEND is exclusive: one night later.
    expect(feed).toContain("DTEND;VALUE=DATE:2026-08-21");
    expect(feed.trimEnd().endsWith("END:VCALENDAR")).toBe(true);
  });

  it("uses CRLF line endings and is deterministic for equal input", () => {
    const nights = [{ hotel_id: "h1", room_type_id: "rt-1", date: "2026-08-20" }];
    const options = { calendarName: "Test", hotelId: "h1", now: new Date(0) };
    expect(buildOtaIcalFeed(nights, options)).toBe(buildOtaIcalFeed(nights, options));
    expect(buildOtaIcalFeed(nights, options)).toContain("\r\n");
  });
});

describe("buildOtaBlockUid", () => {
  it("is deterministic per hotel/room type/date", () => {
    expect(buildOtaBlockUid("h1", "rt1", "2026-08-20")).toBe(
      buildOtaBlockUid("h1", "rt1", "2026-08-20"),
    );
    expect(buildOtaBlockUid("h1", "rt1", "2026-08-20")).not.toBe(
      buildOtaBlockUid("h1", "rt2", "2026-08-20"),
    );
  });
});

