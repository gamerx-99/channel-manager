import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';

describe('PublicHotel site config fallback contract (T06-03)', () => {
  const publicHotelSource = readFileSync(resolve(process.cwd(), 'client/src/pages/PublicHotel.tsx'), 'utf8');
  const siteConfigSource = readFileSync(resolve(process.cwd(), 'server/db/siteConfig.ts'), 'utf8');
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
    expect(publicHotelSource).toMatch(/hero_copy.*\?\?.*DEFAULT_HERO_COPY|DEFAULT_HERO_COPY.*\?\?/s);
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
    // Derive logic string is present: heroCopy = siteConfig?.hero_copy ?? DEFAULT_HERO_COPY
    expect(publicHotelSource).toMatch(/const heroCopy = siteConfig\?\.hero_copy \?\? DEFAULT_HERO_COPY/);
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
  });
});

describe('PublicHotel Direct Booking Engine contract (Phase 05)', () => {
  const publicHotelSource = readFileSync(resolve(process.cwd(), 'client/src/pages/PublicHotel.tsx'), 'utf8');
  const dbSource = readFileSync(resolve(process.cwd(), 'server/db/booking.ts'), 'utf8');
  const routerText = readFileSync(resolve(process.cwd(), 'server/routers.ts'), 'utf8');
  const bookingRouterText = readFileSync(resolve(process.cwd(), 'server/routers/bookingRouter.ts'), 'utf8');
  const routerSource = routerText + bookingRouterText;

  it('PublicHotel hooks into tRPC public availability and booking procedures', () => {
    expect(publicHotelSource).toContain('trpc.channelManager.publicHotelAvailability.useQuery');
    expect(publicHotelSource).toContain('trpc.channelManager.createPublicBooking.useMutation');
  });

  it('PublicHotel renders interactive date picker and guest information form', () => {
    // Note: Updated per Rule 6 to match translation dictionary keys used in PublicHotel.tsx
    expect(publicHotelSource).toContain('publicHotel.checkInDate');
    expect(publicHotelSource).toContain('publicHotel.checkOutDate');
    expect(publicHotelSource).toContain('type="date"');
    expect(publicHotelSource).toContain('guestName');
    expect(publicHotelSource).toContain('guestPhone');
    expect(publicHotelSource).toContain('guestEmail');
  });

  it('PublicHotel renders confirmation screen with booking reference', () => {
    // Note: Updated per Rule 6 to match translation dictionary keys
    expect(publicHotelSource).toContain('publicHotel.bookingConfirmedTitle');
    expect(publicHotelSource).toContain('confirmedBooking');
    expect(publicHotelSource).toContain('publicHotel.bookAnotherStay');
  });

  it('server/db/booking.ts exposes getPublicHotelAvailability and createPublicBooking with double-booking prevention', () => {
    expect(dbSource).toContain('export async function getPublicHotelAvailability');
    expect(dbSource).toContain('export async function createPublicBooking');
    expect(dbSource).toContain('prevent_double_booking');
    expect(dbSource).toContain('resolveEffectiveRate');
  });

  it('server/routers.ts exposes public procedures for availability and booking', () => {
    expect(routerSource).toMatch(/publicHotelAvailability\s*[:=]\s*rateLimitedProcedure\.input/);
    expect(routerSource).toMatch(/createPublicBooking\s*[:=]\s*rateLimitedProcedure\.input/);
  });
});
