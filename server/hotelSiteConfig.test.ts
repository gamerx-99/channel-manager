import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getHotelSiteConfig, getHotelSiteConfigBySlug, saveHotelSiteConfig, DEFAULT_HOTEL_SITE_CONFIG_HERO_COPY, DEFAULT_HOTEL_SITE_CONFIG_ACCENT_COLOR } from './db';

function makeClient(fromHandler: (table: string) => Record<string, unknown>) {
  return { from: fromHandler } as unknown as import('@supabase/supabase-js').SupabaseClient;
}

describe('hotel_site_config 42P01 graceful fallback', () => {
  it('getHotelSiteConfig returns null when table missing (42P01 error object)', async () => {
    const client = makeClient((table: string) => {
      if (table === 'hotel_site_config') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: null, error: { code: '42P01', message: 'relation \"hotel_site_config\" does not exist' } }),
            }),
          }),
        } as unknown as Record<string, unknown>;
      }
      return {} as Record<string, unknown>;
    });
    const result = await getHotelSiteConfig(client, '00000000-0000-0000-0000-000000000000');
    expect(result).toBeNull();
  });

  it('getHotelSiteConfig returns null when error thrown as exception with 42P01 code', async () => {
    const client = makeClient((table: string) => {
      if (table === 'hotel_site_config') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => { throw { code: '42P01', message: 'relation \"hotel_site_config\" does not exist' }; },
            }),
          }),
        } as unknown as Record<string, unknown>;
      }
      return {} as Record<string, unknown>;
    });
    const result = await getHotelSiteConfig(client, '00000000-0000-0000-0000-000000000000');
    expect(result).toBeNull();
  });

  it('getHotelSiteConfig returns data when config exists', async () => {
    const row = { hotel_id: 'h1', hero_copy: 'Custom hero', accent_color: '#123456', visible_sections: null, updated_at: new Date().toISOString() };
    const client = makeClient((table: string) => {
      if (table === 'hotel_site_config') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: row, error: null }),
            }),
          }),
        } as unknown as Record<string, unknown>;
      }
      return {} as Record<string, unknown>;
    });
    const result = await getHotelSiteConfig(client, 'h1');
    expect(result).toEqual(row);
  });

  it('getHotelSiteConfigBySlug returns null when hotels lookup has 42P01 missing table (graceful)', async () => {
    const client = makeClient((table: string) => {
      if (table === 'hotels') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: null, error: { code: '42P01', message: 'relation \"hotel_site_config\" does not exist' } }),
            }),
          }),
        } as unknown as Record<string, unknown>;
      }
      return {} as Record<string, unknown>;
    });
    const result = await getHotelSiteConfigBySlug(client, 'some-slug');
    expect(result).toBeNull();
  });

  it('saveHotelSiteConfig returns synthetic record when table missing', async () => {
    const client = makeClient((table: string) => {
      if (table === 'hotel_site_config') {
        return {
          upsert: () => ({
            select: () => ({
              single: async () => ({ data: null, error: { code: '42P01', message: 'relation \"hotel_site_config\" does not exist' } }),
            }),
          }),
        } as unknown as Record<string, unknown>;
      }
      return {} as Record<string, unknown>;
    });
    const result = await saveHotelSiteConfig(client, { hotel_id: 'h1', hero_copy: 'Hello', accent_color: '#abcdef' });
    expect(result.hotel_id).toBe('h1');
    expect(result.hero_copy).toBe('Hello');
    expect(result.accent_color).toBe('#abcdef');
  });

  it('defaults are exported and match PublicHotel fallback', () => {
    expect(DEFAULT_HOTEL_SITE_CONFIG_HERO_COPY).toBe('Explore room types, rates, and availability directly from this hotel.');
    expect(DEFAULT_HOTEL_SITE_CONFIG_ACCENT_COLOR).toBe('#334155');
  });
});
