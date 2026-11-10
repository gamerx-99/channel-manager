import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (file: string) => readFileSync(resolve(process.cwd(), file), "utf8");

describe("paid-day revenue wiring", () => {
  it("feeds dashboard payment/refund timestamps through the shared figure function", () => {
    const hotel = source("server/d1/hotel.ts");
    const dashboard = source("server/routers/dashboardRouter.ts");
    const home = source("client/src/pages/Home.tsx");
    expect(hotel).toContain("paid_at: paidAt.get(b.id)?.toISOString() ?? null");
    expect(hotel).toContain("refunded_at: refundedAt.get(b.id)?.toISOString() ?? null");
    expect(dashboard).toContain("dashboardRevenueFigures(revenueBookings, now)");
    expect(source("server/d1/dashboardStats.ts")).toContain("dashboardFigures(bookings, now)");
    expect(home).toContain("dashboardFigures(hotelBookings)");
  });

  it("routes financial report revenue through the same shared day aggregation", () => {
    expect(source("server/financials.ts")).toContain("revenueByThaiDay");
    expect(source("client/src/pages/financialsPeriod.ts")).toContain('"Paid date"');
  });
});
