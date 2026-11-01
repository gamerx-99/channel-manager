// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ language: "th", setLanguage: vi.fn(), toggleLanguage: vi.fn() }) }));
vi.mock("@/lib/trpc", () => ({ trpc: { channelManager: {
  dashboardCalendar: { useQuery: () => ({ isLoading: false, isFetching: false, error: null, refetch: vi.fn(), data: {
    startDate: "2026-11-01", endDate: "2026-11-14", generatedAt: "2026-11-01T00:00:00.000Z",
    hotels: [{ hotel: { id: "h", name: "บ้านทดสอบ" }, roomTypes: [{ id: "t", name: "ดีลักซ์", totalRooms: 2 }],
      days: [{ date: "2026-11-01", bookings: 1, roomTypes: [{ roomTypeId: "t", available: 1, totalRooms: 2, price: null, status: "low" }], syncEvents: [] }] }],
  } }) },
  updateAvailability: { useMutation: () => ({ mutateAsync: vi.fn(), isPending: false }) },
} } }));

import DashboardCalendarView from "./DashboardCalendarView";
(globalThis as { React?: typeof React }).React = React;
afterEach(() => { cleanup(); });

describe("DashboardCalendarView in Thai", () => {
  it("shows Thai text and no developer jargon (regression: the Thai dashboard calendar was English)", () => {
    render(<DashboardCalendarView />);
    expect(screen.getByRole("heading", { name: "ปฏิทินการดำเนินงาน" })).toBeTruthy();
    expect(screen.getAllByText("2 ห้อง").length).toBeGreaterThan(0);
    const text = document.body.textContent ?? "";
    expect(text).not.toMatch(/Operations calendar|Healthy availability|Selected day|Stop Sell|RLS|Supabase/);
    // Prices hidden for staff who cannot read rates.
    expect(text).not.toContain("฿");
  });
});
