# 19 — Booking and financial reports

Status: Reviewer access fix verified locally on `feat/reports` (2026-11-07; uncommitted, not deployed; rendered 375px check outstanding)

## Scope

- The system section contains separate bookings and financial report links. Financials remains at `/dashboard/financials` with its existing paid Thai-day revenue behaviour.
- `/reports/bookings` reports one selected hotel. Its default period is the current Thai month. Stay mode counts only nights within the chosen period; created-date mode selects bookings by their Thai creation day.
- Standing bookings are confirmed, checked in, or checked out. Cancelled, refund-pending, refunded, payment-rejected, and expired bookings do not contribute sold nights or revenue.
- Occupancy uses non-maintenance physical rooms as the sellable-room denominator. Room revenue subtracts `booking_services.total_price` from `bookings.price`; the table's amount is the full booking amount.
- The report uses `reports.view_bookings` in the client route, sidebar, router, and scoped D1 repository. Its dedicated staff switch requires bookings-view access; the legacy reports switch remains separate. ADR, revenue breakdowns, booking amounts, and CSV amounts are omitted from the server payload unless the caller passes the financial report's `property.view_financials` check for the selected hotel.

## Acceptance checks

- Summary, room type/source/status breakdowns, daily sold nights, bookings table, and CSV export render in Thai and English.
- The report table and CSV omit amount fields for staff without financial access.
- Aggregation and permission boundary tests pass; `pnpm check`, `pnpm test`, `pnpm build`, and `git diff --check` pass.
