import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';

describe('PublicHotel site config fallback contract (T06-03)', () => {
  const publicHotelSource = readFileSync(resolve(process.cwd(), 'client/src/pages/PublicHotel.tsx'), 'utf8');
  const siteConfigSource = readFileSync(resolve(process.cwd(), 'server/db/siteConfig.ts'), 'utf8');
  const routerText = readFileSync(resolve(process.cwd(), 'server/routers.ts'), 'utf8');
  const hotelRouterText = readFileSync(resolve(process.cwd(), 'server/routers/hotelRouter.ts'), 'utf8');
  const thaiI18n = readFileSync(resolve(process.cwd(), 'client/src/lib/i18n/th.ts'), 'utf8');
  const englishI18n = readFileSync(resolve(process.cwd(), 'client/src/lib/i18n/en.ts'), 'utf8');
  const publicStyles = readFileSync(resolve(process.cwd(), 'client/src/index.css'), 'utf8');
  const routerSource = routerText + hotelRouterText;

  it('PublicHotel reads hotel_site_config via tRPC getHotelSiteConfig with slug', () => {
    expect(publicHotelSource).toContain('trpc.channelManager.getHotelSiteConfig.useQuery');
    // Should be called with slug
    expect(publicHotelSource).toMatch(/getHotelSiteConfig\.useQuery\(slug/);
  });

  it('PublicHotel localizes default hero copy when no site config is present', () => {
    expect(publicHotelSource).toContain('DEFAULT_ACCENT_COLOR');
    expect(publicHotelSource).toContain('t("publicHotel.defaultHeroCopy")');
    expect(thaiI18n).toContain('defaultHeroCopy:');
    expect(englishI18n).toContain('defaultHeroCopy:');
    expect(publicHotelSource).toContain('#334155');
    // Missing and legacy default text both resolve to the active language's translation.
    expect(publicHotelSource).toContain('configuredHeroCopy !== en.publicHotel.defaultHeroCopy');
    expect(publicHotelSource).toContain(': t("publicHotel.defaultHeroCopy")');
    expect(englishI18n).toContain('defaultHeroCopy: "Explore room types, rates, and availability directly from this hotel."');
    expect(publicHotelSource).toMatch(/accent_color.*\?\?.*DEFAULT_ACCENT_COLOR|DEFAULT_ACCENT_COLOR.*\?\?/s);
    // Also checks siteConfigQuery.data ?? null
    expect(publicHotelSource).toContain('siteConfigQuery.data');
    expect(publicHotelSource).toContain('siteConfig?.hero_copy');
    expect(publicHotelSource).toContain('siteConfig?.accent_color');
  });

  it('PublicHotel applies accent_color to CTA buttons and hero copy comes from config', () => {
    expect(publicHotelSource).toContain('{heroCopy}');
    expect(publicHotelSource).toContain('accentColor');
    expect(publicHotelSource).toContain('backgroundColor: accentColor');
  });

  it('PublicHotel shows default hero_copy/accent_color when config missing, and configured values when present (derived logic)', () => {
    // Configured owner copy stays intact while the missing/legacy default is translated.
    expect(publicHotelSource).toContain('const configuredHeroCopy = siteConfig?.hero_copy?.trim();');
    expect(publicHotelSource).toContain('t("publicHotel.defaultHeroCopy")');
    expect(publicHotelSource).toMatch(/const accentColor = siteConfig\?\.accent_color \?\? DEFAULT_ACCENT_COLOR/);
  });

  it('server/db/siteConfig.ts getHotelSiteConfig returns null/default gracefully on 42P01', () => {
    expect(siteConfigSource).toContain('export async function getHotelSiteConfig');
    expect(siteConfigSource).toContain('hotel_site_config');
    expect(siteConfigSource).toContain('return null');
    expect(siteConfigSource).toContain('isMissingHotelSiteConfigTableError');
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

  it('visible_sections fallback keeps sections visible when config absent', () => {
    expect(publicHotelSource).toContain('visible_sections');
    expect(publicHotelSource).toContain('isVisible');
    expect(publicHotelSource).toContain('isVisible("hero")');
    expect(publicHotelSource).toContain('isVisible("rooms")');
    expect(publicHotelSource).toContain('isVisible("booking")');
    expect(publicHotelSource).toContain('isVisible("location")');
  });

  it('uses semantic, keyboard-accessible controls and stable image dimensions', () => {
    expect(publicHotelSource).toContain('className="public-skip-link"');
    expect(publicHotelSource).toContain('aria-controls="public-navigation"');
    expect(publicHotelSource).toContain('className="public-room-action"');
    expect(publicHotelSource).toContain('fetchPriority="high"');
    expect(publicHotelSource).toContain('loading="lazy"');
  });

  it('uses the localized booking CTA and keeps a sticky booking action on all screen sizes', () => {
    expect(publicHotelSource).toContain('label: t("publicHotel.bookNow")');
    expect(thaiI18n).toContain('bookNow: "จองห้องพัก"');
    expect(englishI18n).toContain('bookNow: "Book now"');
    expect(publicHotelSource).toContain('className="public-sticky-booking"');
    expect(publicHotelSource).toContain('onClick={scrollToBooking}');
    expect(publicHotelSource).not.toContain('public-sticky-booking md:hidden');
    expect(publicStyles).toContain('border-top: 0;');
    expect(publicStyles).toContain('.public-page .eyebrow');
    expect(publicStyles).toContain('font-size:13px');
  });

  it('uses room-specific gallery photos when captions match and a labeled placeholder otherwise', () => {
    expect(publicHotelSource).toContain('roomPhotoFor(room.name)');
    expect(publicHotelSource).toContain('publicHotel.roomImagePlaceholder');
  });
});

describe('PublicHotel Wizard Booking Engine contract (Stage E2)', () => {
  const publicHotelSource = readFileSync(resolve(process.cwd(), 'client/src/pages/PublicHotel.tsx'), 'utf8');
  const dbSource = readFileSync(resolve(process.cwd(), 'server/db/booking.ts'), 'utf8');
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
    expect(dbSource).toContain('get_public_room_type_availability_for_guests');
    expect(publicHotelSource).not.toContain('roomTypes.map((rt) => (');
    expect(bookingRouterText).toContain('children: z.array(publicChildMeasurementSchema)');
  });

  it('persists the party size and child age or height from step one on the held booking', () => {
    expect(publicHotelSource).toMatch(/adults,\s+children: childMeasurements/);
    expect(dbSource).toContain('adults: input.adults');
    expect(dbSource).toContain('children: input.children.length');
    expect(dbSource).toContain('child_measurements: input.children');
  });

  it('server/db/booking.ts exposes holdRoomType and confirmBookingDetails with service persistence', () => {
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
