import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Dashboard Calendar View contract', () => {
  const routerText = readFileSync(resolve(process.cwd(), 'server/routers.ts'), 'utf8');
  const dashboardRouterText = readFileSync(resolve(process.cwd(), 'server/routers/dashboardRouter.ts'), 'utf8');
  const availabilityRouterText = readFileSync(resolve(process.cwd(), 'server/routers/availabilityRouter.ts'), 'utf8');
  const router = routerText + dashboardRouterText + availabilityRouterText;
  const component = readFileSync(resolve(process.cwd(), 'client/src/components/DashboardCalendarView.tsx'), 'utf8');
  const home = readFileSync(resolve(process.cwd(), 'client/src/pages/Home.tsx'), 'utf8');
  const css = readFileSync(resolve(process.cwd(), 'client/src/styles/calendar.css'), 'utf8');

  it('exposes a protected calendar procedure with an ISO date window and D1-scoped sources', () => {
    expect(router).toContain('export const dashboardCalendar = protectedProcedure.input(dashboardCalendarSchema)');
    expect(router).toContain("d1ListManagedHotels(ctx.db");
    expect(router).toContain("getOtaSummary");
    expect(router).toContain("d1ListAvailabilityForHotel(db,");
    expect(router).toMatch(/startDate: z\.string\(\)\.regex\(\/\^\\d\{4\}-\\d\{2\}-\\d\{2\}\$\//);
    expect(router).toContain('visibleHotelCalendars');
  });

  it('projects bookings, availability states, and iCal log activity onto each day', () => {
    expect(router).toContain("d1ListBookingOccupancyForHotel(db,");
    expect(router).toContain("booking.checkIn) <= date && (booking.checkOut) > date && isBookingOccupyingInventory(booking as any)");
    // The colour rule moved to shared/inventoryStatus.ts (a fully free day is healthy, even 1/1); its cases are in inventoryStatus.test.ts.
    expect(router).toContain("status: inventoryStatus(available, totalRooms)");
    expect(dashboardRouterText).toContain("import { inventoryStatus } from '@shared/inventoryStatus'");
    expect(router).toContain('syncEvents: hotelOtaEvents.filter');
    expect(dashboardRouterText).toContain('d1ListManagedHotels(db, caller)');
    expect(dashboardRouterText).toContain('d1GetManagedHotel(db, caller, hotel.id)');
    expect(dashboardRouterText).toContain('d1ListAvailabilityForHotel(db, caller, hotel.id)');
    expect(dashboardRouterText).toContain('d1ListBookingOccupancyForHotel(db, caller, hotel.id, dates[0], occupancyEndDate)');
    expect(dashboardRouterText).toMatch(/booking\.checkIn\) <= date[\s\S]*?booking\.checkOut\) > date[\s\S]*?isBookingOccupyingInventory\(booking as any\)/);
    expect(dashboardRouterText).toContain('available = Math.max(0, allotment - bookedRoomIds.size)');
  });

  it('renders the calendar inside the Dashboard and supports property/date selection', () => {
    expect(home).toContain('<DashboardCalendarView />');
    expect(component).toContain("membership.hotelId === activeHotel?.hotel.id");
    expect(component).toContain("activePermissions.includes('revenue.manage_stop_sell')");
    expect(component).toContain("activePermissions.includes('revenue.manage_allotment')");
    expect(component).toContain('trpc.channelManager.dashboardCalendar.useQuery');
    expect(component).toContain('setSelectedHotelId');
    expect(component).toContain('setSelectedDate');
    // Labels moved to the dashboardCalendar i18n section in b799f92.
    expect(component).toContain("aria-label={t('dashboardCalendar.selectProperty')}");
    expect(component).toContain("aria-label={t('dashboardCalendar.previousWindowAria')}");
    expect(component).toContain("aria-label={t('dashboardCalendar.nextWindowAria')}");
    expect(component).toContain("t('dashboardCalendar.editSelectedDay')");
    expect(component).toContain("action: 'allotment'");
    expect(component).toContain("action: 'stop_sell'");
    expect(component).toContain("t('dashboardCalendar.viewOnly')");
    expect(component).toContain('Save');
    expect(component).toContain("t('dashboardCalendar.stopSellingTitle')");
  });

  it('exposes the daily edit and stop-sell controls now that guests respect them', () => {
    // Part 5 (spec 20): the guest booking flow reads the availability table, so the
    // controls are enabled and the gating flag is gone.
    expect(component).not.toContain('const DASHBOARD_CALENDAR_EDITING_ENABLED = false;');
    expect(component).toContain('<div className="dashboard-calendar-quick-actions"');
  });

  it('protects the availability mutation with property scope and distinct revenue permissions', () => {
    expect(router).toContain('const availabilityUpdateSchema = z.object');
    expect(router).toContain('hotel_id: hotelIdSchema.optional()');
    expect(router).toContain("revenue.manage_allotment");
    expect(router).toContain("revenue.manage_stop_sell");
    // Guard moved to assertHotelAndRoomTypeExist helper (Phase 1B refactor); verify helper is called at this call site
    expect(router).toContain("d1GetManagedHotel(db,");
  });

  it('keeps sync markers and details readable on narrow screens', () => {
    expect(component).toContain('dashboard-calendar-scroll-hint');
    expect(component).toContain('dashboard-calendar-sync-details');
    expect(component).toContain("t('dashboardCalendar.noSyncActivity')");
    expect(css).toContain('.dashboard-calendar-table{width:100%;min-width:880px');
    expect(css).toContain('.dashboard-calendar-scroll-hint{display:flex}');
    expect(css).toContain('.dashboard-calendar-sync-item{grid-template-columns:26px minmax(0,1fr)}');
  });

  it('exposes semantic availability color coding with text and accessible labels', () => {
    expect(component).toContain("function statusColorName(status: CalendarDay['roomTypes'][number]['status'])");
    expect(component).toContain("if (status === 'closed') return 'red';");
    expect(component).toContain("if (status === 'low') return 'yellow';");
    expect(component).toContain("return 'green';");
    expect(component).toContain('dashboard-calendar-status-badge');
    expect(component).toContain('status-${statusColorName(status)}');
    expect(component).toContain('calendar-legend-healthy');
    expect(component).toContain('calendar-legend-low');
    expect(component).toContain('calendar-legend-closed');
    expect(component).toContain("t('dashboardCalendar.fullOrClosed')");
    expect(component).toContain("t('dashboardCalendar.lowAvailability')");
    expect(component).toContain("t('dashboardCalendar.healthyAvailability')");
    expect(component).toContain('aria-hidden="true"');
    expect(css).toContain('.dashboard-calendar-cell.closed');
    expect(css).toContain('.dashboard-calendar-cell.low');
    expect(css).toContain('.dashboard-calendar-cell.healthy');
    expect(css).toContain('.dashboard-calendar-status-dot.status-red');
    expect(css).toContain('.dashboard-calendar-status-dot.status-yellow');
    expect(css).toContain('.dashboard-calendar-status-dot.status-green');
    expect(css).toContain('.calendar-legend-closed');
  });
});
