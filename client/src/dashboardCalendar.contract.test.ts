import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Dashboard Calendar View contract', () => {
  const router = readFileSync(resolve(process.cwd(), 'server/routers.ts'), 'utf8');
  const component = readFileSync(resolve(process.cwd(), 'client/src/components/DashboardCalendarView.tsx'), 'utf8');
  const home = readFileSync(resolve(process.cwd(), 'client/src/pages/Home.tsx'), 'utf8');
  const css = readFileSync(resolve(process.cwd(), 'client/src/index.css'), 'utf8');

  it('exposes a protected calendar procedure with an ISO date window and RLS-scoped sources', () => {
    expect(router).toContain('dashboardCalendar: protectedProcedure.input(dashboardCalendarSchema)');
    expect(router).toContain("listManagedHotels(client)");
    expect(router).toContain("getGlobalOtaSummary(ctx.user.accessToken)");
    expect(router).toContain("listAvailabilityForHotel(client, hotel.id)");
    expect(router).toMatch(/startDate: z\.string\(\)\.regex\(\/\^\\d\{4\}-\\d\{2\}-\\d\{2\}\$\//);
    expect(router).toContain('visibleHotelCalendars');
  });

  it('projects bookings, availability states, and iCal log activity onto each day', () => {
    expect(router).toContain("booking.status !== 'cancelled' && booking.check_in <= date && booking.check_out > date");
    expect(router).toContain("status: (available <= 0 ? 'closed' : available <= Math.max(1, Math.ceil(totalRooms * 0.25)) ? 'low' : 'healthy')");
    expect(router).toContain('syncEvents: hotelOtaEvents.filter');
    expect(router).toContain('getUpdatedItemCount(log)');
  });

  it('renders the calendar inside the Dashboard and supports property/date selection', () => {
    expect(home).toContain('<DashboardCalendarView canEditAvailability={canEditCalendar} />');
    expect(component).toContain('trpc.channelManager.dashboardCalendar.useQuery');
    expect(component).toContain('setSelectedHotelId');
    expect(component).toContain('setSelectedDate');
    expect(component).toContain('aria-label="Select property for calendar"');
    expect(component).toContain('aria-label="Previous calendar window"');
    expect(component).toContain('aria-label="Next calendar window"');
    expect(component).toContain('แก้ไขห้องว่างของวันที่เลือก');
    expect(component).toContain("action: 'allotment'");
    expect(component).toContain("action: 'stop_sell'");
    expect(component).toContain('View only · Revenue Manager or Hotel Admin can edit');
    expect(component).toContain('Save');
    expect(component).toContain('Stop Sell');
  });

  it('protects the availability mutation with property scope and distinct revenue permissions', () => {
    expect(router).toContain('const availabilityUpdateSchema = z.object');
    expect(router).toContain('hotel_id: hotelIdSchema.optional()');
    expect(router).toContain("revenue.manage_allotment");
    expect(router).toContain("revenue.manage_stop_sell");
    // Guard moved to assertHotelAndRoomTypeExist helper (Phase 1B refactor); verify helper is called at this call site
    expect(router).toContain("assertHotelAndRoomTypeExist(client, input.hotel_id, input.room_type_id)");
  });

  it('keeps sync markers and details readable on narrow screens', () => {
    expect(component).toContain('dashboard-calendar-scroll-hint');
    expect(component).toContain('dashboard-calendar-sync-details');
    expect(component).toContain('No iCal sync activity recorded for this day.');
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
    expect(component).toContain('Full / closed');
    expect(component).toContain('Low availability');
    expect(component).toContain('Healthy availability');
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
