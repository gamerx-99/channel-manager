import { describe, expect, it } from "vitest";
import { filterChannelPerformanceChannels } from "./ChannelPerformance.utils";
import type { ChannelPerformanceChannel } from "@/../../server/channelPerformance";

const channels: ChannelPerformanceChannel[] = [
  {
    id: "booking:manual",
    label: "Direct / Manual",
    kind: "booking",
    bookings: 8,
    confirmedBookings: 7,
    cancelledBookings: 1,
    revenue: 8000,
    averageBookingValue: 1000,
    occupancyNights: 9,
    hotelCount: 1,
    syncStatus: "not_applicable",
    lastSyncAt: null,
    updatedItemCount: 0,
  },
  {
    id: "ota:booking",
    label: "Booking.com",
    kind: "ota",
    bookings: 0,
    confirmedBookings: 0,
    cancelledBookings: 0,
    revenue: 0,
    averageBookingValue: 0,
    occupancyNights: 0,
    hotelCount: 1,
    syncStatus: "error",
    lastSyncAt: "2026-08-21T08:00:00.000Z",
    updatedItemCount: 3,
  },
  {
    id: "ota:agoda",
    label: "Agoda",
    kind: "ota",
    bookings: 0,
    confirmedBookings: 0,
    cancelledBookings: 0,
    revenue: 0,
    averageBookingValue: 0,
    occupancyNights: 0,
    hotelCount: 1,
    syncStatus: "healthy",
    lastSyncAt: "2026-08-21T08:00:00.000Z",
    updatedItemCount: 1,
  },
];

describe("channel performance filters", () => {
  it("filters by channel type and searches case-insensitively", () => {
    expect(filterChannelPerformanceChannels(channels, "booking", "ota").map(channel => channel.label)).toEqual(["Booking.com"]);
    expect(filterChannelPerformanceChannels(channels, "DIRECT", "all").map(channel => channel.label)).toEqual(["Direct / Manual"]);
  });

  it("keeps only OTA channels that need attention for the issue filter", () => {
    expect(filterChannelPerformanceChannels(channels, "", "issues").map(channel => channel.label)).toEqual(["Booking.com"]);
  });

  it("returns all channels for a cleared filter", () => {
    expect(filterChannelPerformanceChannels(channels, "", "all")).toHaveLength(3);
  });
});
