import { describe, expect, it } from "vitest";
import { bangkokDate, bangkokMonth, dashboardFigures, isCancelledStatus, isRevenueStatus, toSatang } from "./finance";

describe("revenue statuses", () => {
  it("counts confirmed, checked-in and checked-out bookings as revenue and nothing else", () => {
    for (const status of ["confirmed", "checked_in", "checked_out"]) expect(isRevenueStatus(status)).toBe(true);
    for (const status of ["held", "pending_payment", "pending_verification", "expired", "payment_rejected", "cancelled", "refund_pending", "refunded"]) expect(isRevenueStatus(status)).toBe(false);
  });

  it("treats cancelled, refund pending and refunded as cancelled; abandoned holds are neither", () => {
    for (const status of ["cancelled", "refund_pending", "refunded"]) expect(isCancelledStatus(status)).toBe(true);
    for (const status of ["held", "expired", "payment_rejected", "confirmed"]) expect(isCancelledStatus(status)).toBe(false);
  });
});

describe("Thailand date", () => {
  it("uses the Thai day, not the UTC day (regression: figures shifted a day between midnight and 07:00 in Thailand)", () => {
    expect(bangkokDate(new Date("2026-11-04T16:59:59.000Z"))).toBe("2026-11-04"); // 23:59 in Thailand
    expect(bangkokDate(new Date("2026-11-04T17:00:00.000Z"))).toBe("2026-11-05"); // 00:00 in Thailand
    expect(bangkokDate(new Date("2026-11-05T03:00:00.000Z"))).toBe("2026-11-05");
  });

  it("rolls the month at Thai midnight", () => {
    expect(bangkokMonth(new Date("2026-11-30T16:59:59.000Z"))).toBe("2026-11");
    expect(bangkokMonth(new Date("2026-11-30T17:00:00.000Z"))).toBe("2026-12");
  });
});

describe("money", () => {
  it("adds in whole satang without floating-point drift", () => {
    expect(toSatang("0.10") + toSatang("0.20")).toBe(30);
    expect(toSatang("1200.00")).toBe(120000);
    expect(toSatang(null)).toBe(0);
    expect(toSatang("not a number")).toBe(0);
  });
});

describe("dashboardFigures", () => {
  const now = new Date("2026-11-05T05:00:00.000Z"); // 12:00 on 2026-11-05 in Thailand
  const booking = (status: string, check_in: string, check_out: string, price: string | number | null) => ({ status, check_in, check_out, price });

  it("keeps a guest in today's figures after check-in and after check-out (regression: they vanished once the status moved on)", () => {
    const figures = dashboardFigures([
      booking("confirmed", "2026-11-05", "2026-11-06", "1000.00"),
      booking("checked_in", "2026-11-05", "2026-11-07", "2000.00"),
      booking("checked_out", "2026-11-05", "2026-11-05", "300.00"),
    ], now);
    expect(figures.arrivalsToday).toBe(3);
    expect(figures.revenueToday).toBe(3300);
    expect(figures.revenueThisMonth).toBe(3300);
  });

  it("counts departures from guests who are checked in (regression: only never-arrived confirmed bookings were counted)", () => {
    const figures = dashboardFigures([
      booking("checked_in", "2026-11-03", "2026-11-05", "1500.00"),
      booking("checked_out", "2026-11-02", "2026-11-05", "900.00"),
      booking("cancelled", "2026-11-03", "2026-11-05", "700.00"),
    ], now);
    expect(figures.departuresToday).toBe(2);
  });

  it("leaves out bookings that are not revenue, however they got here", () => {
    const figures = dashboardFigures([
      booking("held", "2026-11-05", "2026-11-06", "500.00"),
      booking("pending_payment", "2026-11-05", "2026-11-06", "500.00"),
      booking("expired", "2026-11-05", "2026-11-06", "500.00"),
      booking("payment_rejected", "2026-11-05", "2026-11-06", "500.00"),
      booking("cancelled", "2026-11-05", "2026-11-06", "500.00"),
      booking("refunded", "2026-11-05", "2026-11-06", "500.00"),
    ], now);
    expect(figures).toEqual({ arrivalsToday: 0, departuresToday: 0, revenueToday: 0, revenueThisMonth: 0 });
  });

  it("splits today from the rest of the month, and ignores other months", () => {
    const figures = dashboardFigures([
      booking("confirmed", "2026-11-05", "2026-11-06", "1000.00"),
      booking("checked_out", "2026-11-01", "2026-11-03", "2500.50"),
      booking("checked_out", "2026-10-31", "2026-11-02", "999.00"),
    ], now);
    expect(figures.revenueToday).toBe(1000);
    expect(figures.revenueThisMonth).toBe(3500.5);
  });

  it("uses the Thai day for 'today' just after Thai midnight", () => {
    const afterMidnight = new Date("2026-11-04T17:30:00.000Z"); // 00:30 on 2026-11-05 in Thailand
    const figures = dashboardFigures([booking("confirmed", "2026-11-05", "2026-11-06", "800.00")], afterMidnight);
    expect(figures.arrivalsToday).toBe(1);
    expect(figures.revenueToday).toBe(800);
  });

  it("treats a hidden price as 0", () => {
    expect(dashboardFigures([booking("confirmed", "2026-11-05", "2026-11-06", null)], now)).toMatchObject({ arrivalsToday: 1, revenueToday: 0 });
  });
});
