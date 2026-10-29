import { describe, expect, it } from "vitest";
import {
  expandBookingNights,
  isValidMoneyText,
  rewriteMediaUrl,
  toBooleanInt,
  toJsonText,
  toMoneyText,
  toTimestampMs,
  transformRecordForD1,
} from "./dataTransforms";

describe("dataTransforms", () => {
  describe("toTimestampMs", () => {
    it("converts Date objects to epoch ms", () => {
      const d = new Date("2026-10-29T12:00:00.000Z");
      expect(toTimestampMs(d)).toBe(d.getTime());
    });

    it("converts ISO date strings to epoch ms", () => {
      const iso = "2026-10-29T12:00:00.000Z";
      expect(toTimestampMs(iso)).toBe(new Date(iso).getTime());
    });

    it("converts second-based unix timestamps to ms", () => {
      expect(toTimestampMs(1700000000)).toBe(1700000000000);
      expect(toTimestampMs("1700000000")).toBe(1700000000000);
    });

    it("keeps millisecond timestamps intact", () => {
      expect(toTimestampMs(1700000000000)).toBe(1700000000000);
      expect(toTimestampMs("1700000000000")).toBe(1700000000000);
    });

    it("returns null for null, undefined, and invalid values", () => {
      expect(toTimestampMs(null)).toBeNull();
      expect(toTimestampMs(undefined)).toBeNull();
      expect(toTimestampMs("invalid-date")).toBeNull();
      expect(toTimestampMs(-10)).toBeNull();
    });
  });

  describe("toBooleanInt", () => {
    it("converts truthy values to 1", () => {
      expect(toBooleanInt(true)).toBe(1);
      expect(toBooleanInt(1)).toBe(1);
      expect(toBooleanInt("1")).toBe(1);
      expect(toBooleanInt("true")).toBe(1);
      expect(toBooleanInt("t")).toBe(1);
    });

    it("converts falsy values to 0", () => {
      expect(toBooleanInt(false)).toBe(0);
      expect(toBooleanInt(0)).toBe(0);
      expect(toBooleanInt("0")).toBe(0);
      expect(toBooleanInt("false")).toBe(0);
      expect(toBooleanInt(null)).toBe(0);
      expect(toBooleanInt(undefined)).toBe(0);
    });
  });

  describe("toJsonText", () => {
    it("serializes objects and arrays to JSON text", () => {
      expect(toJsonText(["admin", "support"])).toBe('["admin","support"]');
      expect(toJsonText({ key: "val" })).toBe('{"key":"val"}');
    });

    it("preserves already serialized JSON strings", () => {
      expect(toJsonText('["role"]')).toBe('["role"]');
    });

    it("uses fallback for null or undefined", () => {
      expect(toJsonText(null, "[]")).toBe("[]");
      expect(toJsonText(undefined, "{}")).toBe("{}");
    });
  });

  describe("toMoneyText & isValidMoneyText", () => {
    it("validates valid money strings", () => {
      expect(isValidMoneyText("100")).toBe(true);
      expect(isValidMoneyText("100.5")).toBe(true);
      expect(isValidMoneyText("100.50")).toBe(true);
      expect(isValidMoneyText("0.00")).toBe(true);
      expect(isValidMoneyText("0")).toBe(true);
    });

    it("rejects invalid money strings", () => {
      expect(isValidMoneyText(".50")).toBe(false);
      expect(isValidMoneyText("100.555")).toBe(false);
      expect(isValidMoneyText("-10.00")).toBe(false);
      expect(isValidMoneyText("abc")).toBe(false);
      expect(isValidMoneyText("100.00.00")).toBe(false);
    });

    it("formats numbers and strings into canonical 2-decimal money text", () => {
      expect(toMoneyText(100)).toBe("100.00");
      expect(toMoneyText("100.5")).toBe("100.50");
      expect(toMoneyText("100")).toBe("100.00");
      expect(toMoneyText("100.50")).toBe("100.50");
      expect(toMoneyText(0)).toBe("0.00");
      expect(toMoneyText(null)).toBe("0.00");
    });
  });

  describe("rewriteMediaUrl", () => {
    it("rewrites full Supabase storage URLs to /media/<hotelId>/<file>", () => {
      const url = "https://example.supabase.co/storage/v1/object/public/hotel-media/hotel-123/banner.jpg";
      expect(rewriteMediaUrl(url, "hotel-123")).toBe("/media/hotel-123/banner.jpg");
    });

    it("rewrites relative hotel-scoped paths", () => {
      expect(rewriteMediaUrl("hotel-123/photo.png", "hotel-123")).toBe("/media/hotel-123/photo.png");
      expect(rewriteMediaUrl("/hotel-123/photo.png", "hotel-123")).toBe("/media/hotel-123/photo.png");
      expect(rewriteMediaUrl("photo.webp", "hotel-123")).toBe("/media/hotel-123/photo.webp");
    });

    it("throws on unsupported media extensions", () => {
      expect(() => rewriteMediaUrl("malicious.html", "hotel-123")).toThrow(/Unsupported media extension/);
      expect(() => rewriteMediaUrl("vector.svg", "hotel-123")).toThrow(/Unsupported media extension/);
    });
  });

  describe("expandBookingNights", () => {
    const fixedNow = 1700000000000;

    it("expands confirmed stays into discrete night rows", () => {
      const bookings = [
        {
          id: "b1",
          roomId: "room-a",
          checkIn: "2026-11-01",
          checkOut: "2026-11-03",
          status: "confirmed",
        },
      ];
      const { nights, conflicts } = expandBookingNights(bookings, fixedNow);
      expect(conflicts).toHaveLength(0);
      expect(nights).toEqual([
        { bookingId: "b1", roomId: "room-a", night: "2026-11-01" },
        { bookingId: "b1", roomId: "room-a", night: "2026-11-02" },
      ]);
    });

    it("includes active holds and ignores expired holds or non-occupying bookings", () => {
      const bookings = [
        {
          id: "b-active-hold",
          roomId: "room-a",
          checkIn: "2026-11-01",
          checkOut: "2026-11-02",
          status: "held",
          expiresAt: fixedNow + 60000,
        },
        {
          id: "b-expired-hold",
          roomId: "room-a",
          checkIn: "2026-11-02",
          checkOut: "2026-11-03",
          status: "held",
          expiresAt: fixedNow - 1000,
        },
        {
          id: "b-cancelled",
          roomId: "room-a",
          checkIn: "2026-11-03",
          checkOut: "2026-11-04",
          status: "cancelled",
        },
      ];
      const { nights, conflicts } = expandBookingNights(bookings, fixedNow);
      expect(conflicts).toHaveLength(0);
      expect(nights).toEqual([
        { bookingId: "b-active-hold", roomId: "room-a", night: "2026-11-01" },
      ]);
    });

    it("detects and flags overlapping bookings on the same room and night", () => {
      const bookings = [
        {
          id: "b1",
          roomId: "room-a",
          checkIn: "2026-11-01",
          checkOut: "2026-11-03",
          status: "confirmed",
        },
        {
          id: "b2",
          roomId: "room-a",
          checkIn: "2026-11-02",
          checkOut: "2026-11-04",
          status: "confirmed",
        },
      ];
      const { nights, conflicts } = expandBookingNights(bookings, fixedNow);
      expect(conflicts).toHaveLength(1);
      expect(conflicts[0]).toEqual({
        bookingIdA: "b1",
        bookingIdB: "b2",
        roomId: "room-a",
        night: "2026-11-02",
      });
      // b1 took 2026-11-01 and 2026-11-02; b2 only took 2026-11-03
      expect(nights).toHaveLength(3);
    });
  });

  describe("transformRecordForD1", () => {
    it("transforms hotel record correctly", () => {
      const raw = {
        id: "h1",
        name: "Grand Hotel",
        public_enabled: true,
        created_at: "2026-01-01T00:00:00.000Z",
      };
      const transformed = transformRecordForD1("hotels", raw);
      expect(transformed.public_enabled).toBe(1);
      expect(transformed.created_at).toBe(new Date("2026-01-01T00:00:00.000Z").getTime());
    });

    it("transforms booking record correctly", () => {
      const raw = {
        id: "bk-1",
        hotel_id: "h1",
        room_id: "r1",
        price: 1500,
        late_payment: false,
        created_at: "2026-05-01T10:00:00.000Z",
        updated_at: "2026-05-01T10:00:00.000Z",
      };
      const transformed = transformRecordForD1("bookings", raw);
      expect(transformed.price).toBe("1500.00");
      expect(transformed.late_payment).toBe(0);
      expect(typeof transformed.created_at).toBe("number");
    });

    it("transforms hotel_media record and rewrites URL", () => {
      const raw = {
        id: "m1",
        hotel_id: "h1",
        url: "https://xxx.supabase.co/storage/v1/object/public/hotel-media/h1/hero.webp",
        is_hero: true,
        created_at: "2026-01-01T00:00:00.000Z",
      };
      const transformed = transformRecordForD1("hotel_media", raw);
      expect(transformed.url).toBe("/media/h1/hero.webp");
      expect(transformed.is_hero).toBe(1);
    });

    it("transforms hotel_users permission arrays into JSON text", () => {
      const raw = {
        id: "hu1",
        hotel_id: "h1",
        user_id: "u1",
        role: "admin",
        permission_grants: ["property.manage_profile"],
        permission_revokes: [],
        created_at: "2026-01-01T00:00:00.000Z",
      };
      const transformed = transformRecordForD1("hotel_users", raw);
      expect(transformed.permission_grants).toBe('["property.manage_profile"]');
      expect(transformed.permission_revokes).toBe("[]");
    });
  });
});
