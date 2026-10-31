import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';

describe('PublicHotel site config fallback contract (T06-03)', () => {
  const publicHotelSource = readFileSync(resolve(process.cwd(), 'client/src/pages/PublicHotel.tsx'), 'utf8');
  const siteConfigSource = readFileSync(resolve(process.cwd(), 'server/d1/siteConfig.ts'), 'utf8');
  const routerText = readFileSync(resolve(process.cwd(), 'server/routers.ts'), 'utf8');
  const hotelRouterText = readFileSync(resolve(process.cwd(), 'server/routers/hotelRouter.ts'), 'utf8');
  const routerSource = routerText + hotelRouterText;

  it('PublicHotel reads hotel_site_config via tRPC getHotelSiteConfig with slug', () => {
    expect(publicHotelSource).toContain('trpc.channelManager.getHotelSiteConfig.useQuery');
    // Should be called with slug
    expect(publicHotelSource).toMatch(/getHotelSiteConfig\.useQuery\(slug/);
  });

  it('PublicHotel falls back to fixed copy/colors when no config (42P01 or missing row)', () => {
    expect(publicHotelSource).toContain('DEFAULT_HERO_COPY');
    expect(publicHotelSource).toContain('DEFAULT_ACCENT_COLOR');
    expect(publicHotelSource).toContain('Explore room types, rates, and availability directly from this hotel.');
    expect(publicHotelSource).toContain('#954831');
    // Fallback via nullish coalescing
    expect(publicHotelSource).toMatch(/const heroCopy\s*=\s*siteConfig\?\.heroCopy\s*\?\?\s*DEFAULT_HERO_COPY/s);
    expect(publicHotelSource).toMatch(/const accentColor\s*=\s*siteConfig\?\.accentColor\s*\?\?\s*DEFAULT_ACCENT_COLOR/s);
    // Also checks siteConfigQuery.data ?? null
    expect(publicHotelSource).toContain('siteConfigQuery.data');
    expect(publicHotelSource).toContain('siteConfig?.heroCopy');
    expect(publicHotelSource).toContain('siteConfig?.accentColor');
  });

  it('PublicHotel applies accent_color to CTA buttons and hero copy comes from config', () => {
    expect(publicHotelSource).toContain('{heroCopy}');
    expect(publicHotelSource).toContain('accentColor');
    expect(publicHotelSource).toContain('backgroundColor: accentColor');
  });

  it('PublicHotel shows default hero_copy/accent_color when config missing, and configured values when present (derived logic)', () => {
    // Derive logic string is present: heroCopy = siteConfig?.heroCopy ?? DEFAULT_HERO_COPY
    expect(publicHotelSource).toMatch(/const heroCopy = siteConfig\?\.heroCopy \?\? DEFAULT_HERO_COPY/);
    expect(publicHotelSource).toMatch(/const accentColor = siteConfig\?\.accentColor \?\? DEFAULT_ACCENT_COLOR/);
  });

  it('server/d1/siteConfig.ts scopes public and managed reads and returns null for missing config', () => {
    expect(siteConfigSource).toContain('export async function getHotelSiteConfig');
    expect(siteConfigSource).toContain('hotelSiteConfig');
    expect(siteConfigSource).toContain('row ?? null');
    expect(siteConfigSource).toContain('const hotel = await requirePublicHotel(db, caller, slug)');
    expect(siteConfigSource).toContain('eq(hotelSiteConfig.hotelId, hotel.id)');
    expect(siteConfigSource).toContain('eq(hotelSiteConfig.hotelId, hotelId)');
  });

  it('server/routers.ts exposes public getHotelSiteConfig (for PublicHotel) and protected saveHotelSiteConfig', () => {
    expect(routerSource).toMatch(/getHotelSiteConfig\s*[:=]\s*rateLimitedProcedure\.input/);
    expect(routerSource).toContain('getHotelSiteConfigBySlug');
    expect(routerSource).toMatch(/saveHotelSiteConfig\s*[:=]\s*protectedProcedure\.input/);
    expect(routerSource).toContain('hotelSiteConfigSaveSchema');
    expect(routerSource).toContain("requireHotelPermission(ctx.user, input.hotel_id, 'property.manage_profile')");
    // Public getHotelSiteConfig returns null gracefully on 42P01
    expect(routerSource).toMatch(/if \(code === '42P01'.*hotel_site_config/);
  });

  it('visibleSections fallback keeps sections visible when config absent', () => {
    expect(publicHotelSource).toContain('visibleSections');
    expect(publicHotelSource).toContain('isVisible');
  });
});

describe('PublicHotel Wizard Booking Engine contract (Stage E2)', () => {
  const publicHotelSource = readFileSync(resolve(process.cwd(), 'client/src/pages/PublicHotel.tsx'), 'utf8');
  const dbSource = readFileSync(resolve(process.cwd(), 'server/d1/booking.ts'), 'utf8');
  const routerText = readFileSync(resolve(process.cwd(), 'server/routers.ts'), 'utf8');
  const bookingRouterText = readFileSync(resolve(process.cwd(), 'server/routers/bookingRouter.ts'), 'utf8');
  const hotelRouterText = readFileSync(resolve(process.cwd(), 'server/routers/hotelRouter.ts'), 'utf8');
  const routerSource = routerText + bookingRouterText + hotelRouterText;

  it('PublicHotel hooks into hold-based booking procedures, not the retired createPublicBooking flow', () => {
    expect(publicHotelSource).toContain('trpc.channelManager.holdRoomType.useMutation');
    expect(publicHotelSource).toContain('trpc.channelManager.confirmBookingDetails.useMutation');
    expect(publicHotelSource).toContain('trpc.channelManager.listPublicHotelServices.useQuery');
    expect(publicHotelSource).not.toContain('trpc.channelManager.createPublicBooking.useMutation');
  });

  it('PublicHotel renders BookingDateRangePicker for date selection instead of raw date inputs', () => {
    expect(publicHotelSource).toContain('BookingDateRangePicker');
    expect(publicHotelSource).toMatch(/from ['"]@\/components\/BookingDateRangePicker['"]/);
    // The old single-form date inputs are gone; the wizard now uses the calendar component.
    expect(publicHotelSource).not.toContain('type="date"');
  });

  it('PublicHotel keeps guest information state and renders the payment flow via PaymentQR', () => {
    expect(publicHotelSource).toContain('guestName');
    expect(publicHotelSource).toContain('guestPhone');
    expect(publicHotelSource).toContain('guestEmail');
    expect(publicHotelSource).toContain('specialRequests');
    expect(publicHotelSource).toContain('<PaymentQR');
    expect(publicHotelSource).toContain('publicHotel.bookingConfirmedTitle');
    expect(publicHotelSource).toContain('publicHotel.bookAnotherStay');
  });

  it('collects party size before selecting exactly one occupancy-matched room type', () => {
    expect(publicHotelSource).toContain('publicHotel.adultsLabel');
    expect(publicHotelSource).toContain('publicHotel.childrenLabel');
    expect(publicHotelSource).toContain('childMeasurements');
    expect(dbSource).toContain('getPublicRoomTypeAvailabilityForGuests');
    expect(publicHotelSource).not.toContain('roomTypes.map((rt) => (');
    expect(bookingRouterText).toContain('children: z.array(publicChildMeasurementSchema)');
  });

  it('server/d1/booking.ts exposes holdRoomType and confirmBookingDetails with service persistence', () => {
    expect(dbSource).toContain('export async function holdRoomType');
    expect(dbSource).toContain('export async function confirmBookingDetails');
    expect(dbSource).toContain('booking_services');
    expect(dbSource).toContain('calculateServiceTotal');
  });

  it('server routers expose holdRoomType, confirmBookingDetails, and listPublicHotelServices as public procedures', () => {
    expect(routerSource).toMatch(/holdRoomType\s*[:=]\s*rateLimitedProcedure\.input/);
    expect(routerSource).toMatch(/confirmBookingDetails\s*[:=]\s*rateLimitedProcedure\.input/);
    expect(routerSource).toMatch(/listPublicHotelServices\s*[:=]\s*rateLimitedProcedure\.input/);
  });
});

describe('PublicHotel private or unknown hotel state', () => {
  const source = readFileSync(resolve(process.cwd(), 'client/src/pages/PublicHotel.tsx'), 'utf8');

  it('does not retry NOT_FOUND, so a private or unknown hotel answers at once', () => {
    expect(source).toContain('retry: (failureCount, error) => error.data?.code !== "NOT_FOUND" && failureCount < 2');
  });

  it('shows a clear unavailable state for NOT_FOUND and a retry for other errors', () => {
    expect(source).toContain('publicHotel.error?.data?.code === "NOT_FOUND"');
    expect(source).toContain('data-testid="public-hotel-not-found"');
    expect(source).toContain('t("publicHotel.hotelUnavailableTitle")');
    expect(source).toContain('data-testid="public-hotel-load-error"');
    expect(source).toContain('onClick={() => void publicHotel.refetch()}');
  });
});

