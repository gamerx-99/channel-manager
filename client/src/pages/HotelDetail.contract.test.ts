import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Hotel Detail calendar navigation', () => {
  const hotelDetail = readFileSync(resolve(process.cwd(), 'client/src/pages/HotelDetail.tsx'), 'utf8');
  const general = readFileSync(resolve(process.cwd(), 'client/src/components/hotel/HotelGeneralOperations.tsx'), 'utf8');
  const finance = readFileSync(resolve(process.cwd(), 'client/src/pages/HotelFinanceSettings.tsx'), 'utf8');
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
    expect(app).toContain('path="/hotels/:id/settings/general"');
    expect(general).toContain('trpc.channelManager.setHotelPublished.useMutation');
    expect(general).toContain('id="hotel-publish-toggle"');
    expect(general).toContain("t('hotelDetail.confirmUnpublish')");
  });

  it('moves payment and invoice settings to the finance page', () => {
    expect(finance).toContain("'property.manage_profile'");
    expect(finance).toContain('<HotelPaymentSettings hotelId={id} />');
    expect(finance).toContain('<HotelInvoiceSettings');
    expect(hotelDetail).not.toContain('HotelPaymentSettings');
    expect(hotelDetail).not.toContain('<Dialog open={showEditHotel}');
  });

  it('redirects the former profile query to the dedicated page', () => {
    expect(hotelDetail).toContain("get('edit') === 'profile'");
    expect(hotelDetail).toContain('return <Redirect to={`/hotels/${id}/profile`} />');
    expect(hotelDetail).not.toContain('openHotelEditor');
    expect(hotelDetail).not.toContain('hotelDetail.comingSoon');
  });

  it('keeps hotel navigation in the sidebar without duplicating page tabs', () => {
    const services = readFileSync(resolve(process.cwd(), 'client/src/pages/HotelServices.tsx'), 'utf8');
    const builder = readFileSync(resolve(process.cwd(), 'client/src/components/website-builder/useWebsiteBuilder.ts'), 'utf8');

    expect(hotelDetail).not.toContain('href="#"');
    expect(hotelDetail).not.toContain('tabDomains');
    expect(hotelDetail).not.toContain('detail-tabs');

    // AGENTS.md Rule 6 rationale: Commit b3f8b3f removed duplicate nav tabs from HotelServices;
    // assert no dead links, no tabDomains, and no detail-tabs.
    expect(services).not.toContain('href="#"');
    expect(services).not.toContain('tabDomains');
    expect(services).not.toContain('detail-tabs');

    expect(builder).toContain('new URLSearchParams(window.location.search).get("hotel")');
  });

  it('matches the room management heading to its sidebar label in both languages', () => {
    const th = readFileSync(resolve(process.cwd(), 'client/src/lib/i18n/th.ts'), 'utf8');
    const en = readFileSync(resolve(process.cwd(), 'client/src/lib/i18n/en.ts'), 'utf8');
    expect(th).toContain('roomTypesManage: "จัดการประเภทห้องพัก"');
    expect(th).toContain('headingRoomTypes: "จัดการประเภทห้องพัก"');
    expect(en).toContain('roomTypesManage: "Manage room types"');
    expect(en).toContain('headingRoomTypes: "Manage room types"');
  });

  it('manages room type amenities with RoomAmenitiesPicker instead of freeform textarea', () => {
    expect(hotelDetail).toContain('RoomAmenitiesPicker');
    expect(hotelDetail).not.toContain('<textarea value={roomTypeForm.amenities}');
    expect(hotelDetail).not.toContain('amenitiesHelp');
  });
});
