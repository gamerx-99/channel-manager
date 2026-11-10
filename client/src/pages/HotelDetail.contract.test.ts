import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Hotel Detail calendar navigation', () => {
  const hotelDetail = readFileSync(resolve(process.cwd(), 'client/src/pages/HotelDetail.tsx'), 'utf8');
  const app = readFileSync(resolve(process.cwd(), 'client/src/App.tsx'), 'utf8');

  it('links availability to the registered calendar route', () => {
    expect(hotelDetail).toContain('href={`/hotels/${hotel.id}/calendar`}');
    expect(hotelDetail).not.toContain('href={`/hotels/${hotel.id}/availability`}');
    expect(app).toContain('path="/hotels/:id/calendar"');
  });

  it('exposes per-occupancy prices, child age bands, and the alternate height rule', () => {
    expect(hotelDetail).toContain('hotelDetail.baseOccupancyLabel');
    expect(hotelDetail).toContain('hotelDetail.maxOccupancyLabel');
    expect(hotelDetail).toContain('hotelDetail.occupancyLevelLabel');
    expect(hotelDetail).toContain('hotelDetail.occupancyPricingHint');
    expect(hotelDetail).toContain('hotelDetail.childRuleLabel');
    expect(hotelDetail).toContain('hotelDetail.infantAgeFixedRange');
    expect(hotelDetail).toContain('hotelDetail.addChildAgeGroup');
    expect(hotelDetail).toContain('hotelDetail.heightChildRateLabel');
    expect(hotelDetail).toContain('hotelDetail.childrenCountTowardMaxLabel');
  });

  it('lets a holder of property.manage_profile publish or unpublish the hotel page', () => {
    expect(hotelDetail).toContain("hasHotelPermission(authMeQuery.data?.roles ?? [], authMeQuery.data?.memberships ?? [], id, 'property.manage_profile')");
    expect(hotelDetail).toContain('trpc.channelManager.setHotelPublished.useMutation');
    expect(hotelDetail).toContain('{canPublish && <div className="publish-control">');
    expect(hotelDetail).toContain('id="hotel-publish-toggle"');
    expect(hotelDetail).toContain("t('hotelDetail.confirmUnpublish')");
  });

  it('opens the hotel profile form and saves name, address and owner contact', () => {
    expect(hotelDetail).toContain('trpc.channelManager.updateHotelProfile.useMutation');
    expect(hotelDetail).toContain('onClick={openHotelEditor}');
    expect(hotelDetail).toContain("t('hotelDetail.hotelNameLabel')");
    expect(hotelDetail).toContain("t('hotelDetail.addressLabel')");
    expect(hotelDetail).toContain("t('hotelDetail.contactLabel')");
    expect(hotelDetail).toContain("t('hotelDetail.notificationEmailLabel')");
    expect(hotelDetail).toContain('notification_email: hotelProfileForm.notification_email.trim() || null');
    expect(hotelDetail).not.toContain('hotelDetail.comingSoon');
  });

  it('has no dead href="#" tabs: Photos opens the website builder for this hotel, Domains is gone', () => {
    const services = readFileSync(resolve(process.cwd(), 'client/src/pages/HotelServices.tsx'), 'utf8');
    const builder = readFileSync(resolve(process.cwd(), 'client/src/components/website-builder/useWebsiteBuilder.ts'), 'utf8');

    // AGENTS.md Rule 6 rationale: HotelDetail retains the full sub-navigation bar including the website builder link.
    expect(hotelDetail).not.toContain('href="#"');
    expect(hotelDetail).not.toContain('tabDomains');
    expect(hotelDetail).toContain("<Link href={`/website-builder?hotel=${hotel.id}`}>{t('hotelDetail.tabImages')}</Link>");

    // AGENTS.md Rule 6 rationale: Commit b3f8b3f removed duplicate nav tabs from HotelServices;
    // assert no dead links, no tabDomains, and no detail-tabs.
    expect(services).not.toContain('href="#"');
    expect(services).not.toContain('tabDomains');
    expect(services).not.toContain('detail-tabs');

    expect(builder).toContain('new URLSearchParams(window.location.search).get("hotel")');
  });

  it('manages room type amenities with RoomAmenitiesPicker instead of freeform textarea', () => {
    expect(hotelDetail).toContain('RoomAmenitiesPicker');
    expect(hotelDetail).not.toContain('<textarea value={roomTypeForm.amenities}');
    expect(hotelDetail).not.toContain('amenitiesHelp');
  });
});
