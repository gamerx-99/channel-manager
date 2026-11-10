import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

describe('hotel profile page contract', () => {
  const app = read('client/src/App.tsx');
  const page = read('client/src/pages/HotelProfile.tsx');
  const detail = read('client/src/pages/HotelDetail.tsx');
  const scope = read('client/src/lib/routeScope.ts');
  const hook = read('client/src/components/hotel/useHotelProfileForm.ts');
  const mapPicker = read('client/src/components/hotel/HotelMapPicker.tsx');

  it('registers the profile before the hotel detail route and gates it for the hotel', () => {
    expect(app.indexOf('path="/hotels/:id/profile"')).toBeLessThan(app.indexOf('path="/hotels/:id"'));
    expect(app).toContain('<PrivateRoute><HotelProfile id={params.id} /></PrivateRoute>');
    expect(scope).toContain('return "property.manage_profile"');
    expect(hook).toContain("hasHotelPermission(authMeQuery.data?.roles ?? [], authMeQuery.data?.memberships ?? [], id, 'property.manage_profile')");
    expect(page).toContain('if (!canManage) return');
    expect(page).toContain('<PageState tone="error" title={t(\'accessRestricted.title\')}');
  });

  it('shows the tour fields, map, save, and inline success feedback', () => {
    expect(page).toContain('data-tour="hotel-settings-fields"');
    expect(page).toContain('<HotelMapPicker');
    expect(page).toContain('type="submit" disabled={isPending}');
    expect(page).toContain('role="status"');
    expect(page).toContain('role="alert"');
    expect(page).toContain('<HotelGeneralOperations hotel={hotelQuery.data} />');
  });

  it('keeps coordinate control styling in CSS', () => {
    expect(mapPicker).not.toContain('style={{');
    expect(mapPicker).toContain('className="hotel-map-coordinates"');
  });

  it('removes the modal and redirects old profile links', () => {
    expect(detail).not.toContain('showEditHotel');
    expect(detail).not.toContain('<Dialog open={showEditHotel}');
    expect(detail).toContain("get('edit') === 'profile'");
    expect(detail).toContain('return <Redirect to={`/hotels/${id}/profile`} />');
  });
});
