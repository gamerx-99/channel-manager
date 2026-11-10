import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (file: string) => readFileSync(resolve(process.cwd(), file), 'utf8');
describe('bookings report page contract', () => {
  it('registers the route and mirrors its named permission in navigation and route scope', () => {
    expect(read('client/src/App.tsx')).toContain('path="/reports/bookings"');
    expect(read('client/src/lib/routeScope.ts')).toContain('return "reports.view_bookings"');
    expect(read('client/src/components/layout/Sidebar.tsx')).toContain('can("reports.view_bookings")');
  });
  it('renders the report sections and keeps the page container and tables scrollable', () => {
    const page = read('client/src/pages/BookingsReport.tsx');
    expect(page).toContain('className="page-content bookings-report-page"');
    expect(page).toContain('bookingsReport.createdBasis');
    expect(page).toContain('bookingsReport.byRoomType');
    expect(page).toContain('bookingsReport.daily');
    expect(page).toContain('<BarChart data={data.daily}');
    expect(page).toContain('className="sr-only" aria-label={t(\'bookingsReport.daily\')}');
    expect(page).not.toContain('bookings-report-daily"><table');
    expect(page).toContain('bookingsReport.exportCsv');
    expect(page).toContain('bookingSourceTranslationKey(row.name)');
    expect(read('client/src/pages/BookingsReport.css')).toContain('.bookings-report-filter-row');
    expect(page).not.toContain('<main');
    expect(read('client/src/pages/BookingsReport.css')).toContain('overflow-x: auto');
  });
});
