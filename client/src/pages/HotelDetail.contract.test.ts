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

  it('has no dead href="#" tabs: Photos opens the website builder for this hotel, Domains is gone', () => {
    const services = readFileSync(resolve(process.cwd(), 'client/src/pages/HotelServices.tsx'), 'utf8');
    const builder = readFileSync(resolve(process.cwd(), 'client/src/pages/WebsiteBuilder.tsx'), 'utf8');
    for (const page of [hotelDetail, services]) {
      expect(page).not.toContain('href="#"');
      expect(page).not.toContain('tabDomains');
      expect(page).toContain("<Link href={`/website-builder?hotel=${hotel.id}`}>{t('hotelDetail.tabImages')}</Link>");
    }
    expect(builder).toContain('new URLSearchParams(window.location.search).get("hotel")');
  });
});

