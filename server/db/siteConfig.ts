import { SupabaseClient } from '@supabase/supabase-js';
import { HotelSiteConfigRecord, HotelMediaRecord } from './types';
import { isMissingTableError, throwOnError } from './utils';
export { DEFAULT_HOTEL_SITE_CONFIG_HERO_COPY, DEFAULT_HOTEL_SITE_CONFIG_ACCENT_COLOR } from './types';


function isMissingHotelSiteConfigTableError(error: unknown): boolean {
  return isMissingTableError('hotel_site_config', error);
}

/** Returns the site config for a hotel, or null if none / table not yet migrated. Gracefully handles 42P01. */
export async function getHotelSiteConfig(
  client: SupabaseClient,
  hotelId: string,
): Promise<HotelSiteConfigRecord | null> {
  try {
    const { data, error } = await client
      .from('hotel_site_config')
      .select('hotel_id,hero_copy,accent_color,visible_sections,updated_at')
      .eq('hotel_id', hotelId)
      .maybeSingle();
    if (error) {
      if (isMissingHotelSiteConfigTableError(error)) return null;
      throw error;
    }
    return (data ?? null) as HotelSiteConfigRecord | null;
  } catch (err) {
    if (isMissingHotelSiteConfigTableError(err)) return null;
    if (err instanceof Error && /hotel_site_config.*does not exist/i.test(err.message)) return null;
    throw err;
  }
}

/** Convenience: resolve hotel id by slug then fetch config. Returns null if hotel or config missing or table missing. */
export async function getHotelSiteConfigBySlug(
  client: SupabaseClient,
  slug: string,
): Promise<HotelSiteConfigRecord | null> {
  try {
    const { data: hotel, error: hotelError } = await client
      .from('hotels')
      .select('id')
      .eq('slug', slug)
      .maybeSingle();
    if (hotelError) {
      if (isMissingHotelSiteConfigTableError(hotelError)) return null;
      throw hotelError;
    }
    const hotelId = (hotel as { id?: string } | null)?.id;
    if (!hotelId) return null;
    return await getHotelSiteConfig(client, hotelId);
  } catch (err) {
    if (isMissingHotelSiteConfigTableError(err)) return null;
    if (err instanceof Error && /hotel_site_config.*does not exist/i.test(err.message)) return null;
    throw err;
  }
}

/** Upserts site config for a hotel. Gracefully returns a synthetic record if table not yet migrated. */
export async function saveHotelSiteConfig(
  client: SupabaseClient,
  input: {
    hotel_id: string;
    hero_copy?: string | null;
    accent_color?: string | null;
    visible_sections?: Record<string, boolean> | null;
  },
): Promise<HotelSiteConfigRecord> {
  const payload: Record<string, unknown> = { hotel_id: input.hotel_id, updated_at: new Date().toISOString() };
  if (input.hero_copy !== undefined) payload.hero_copy = input.hero_copy;
  if (input.accent_color !== undefined) payload.accent_color = input.accent_color;
  if (input.visible_sections !== undefined) payload.visible_sections = input.visible_sections;
  try {
    const { data, error } = await client
      .from('hotel_site_config')
      .upsert(payload, { onConflict: 'hotel_id' })
      .select('hotel_id,hero_copy,accent_color,visible_sections,updated_at')
      .single();
    if (error) {
      if (isMissingHotelSiteConfigTableError(error)) {
        return {
          hotel_id: input.hotel_id,
          hero_copy: (input.hero_copy as string | null) ?? null,
          accent_color: (input.accent_color as string | null) ?? null,
          visible_sections: (input.visible_sections as Record<string, boolean> | null) ?? null,
          updated_at: new Date().toISOString(),
        };
      }
      throw error;
    }
    if (!data) throw new Error('Site config upsert did not return a record.');
    return data as HotelSiteConfigRecord;
  } catch (err) {
    if (isMissingHotelSiteConfigTableError(err)) {
      return {
        hotel_id: input.hotel_id,
        hero_copy: (input.hero_copy as string | null) ?? null,
        accent_color: (input.accent_color as string | null) ?? null,
        visible_sections: (input.visible_sections as Record<string, boolean> | null) ?? null,
        updated_at: new Date().toISOString(),
      };
    }
    if (err instanceof Error && /hotel_site_config.*does not exist/i.test(err.message)) {
      return {
        hotel_id: input.hotel_id,
        hero_copy: (input.hero_copy as string | null) ?? null,
        accent_color: (input.accent_color as string | null) ?? null,
        visible_sections: (input.visible_sections as Record<string, boolean> | null) ?? null,
        updated_at: new Date().toISOString(),
      };
    }
    throw err;
  }
}

export async function listHotelMedia(
  client: SupabaseClient,
  hotelId: string,
): Promise<HotelMediaRecord[]> {
  const { data, error } = await client
    .from('hotel_media')
    .select('id,hotel_id,url,caption,is_hero,display_order,created_at')
    .eq('hotel_id', hotelId)
    .order('display_order', { ascending: true });
  throwOnError(error);
  return (data ?? []) as HotelMediaRecord[];
}

export async function createHotelMedia(
  client: SupabaseClient,
  input: { hotel_id: string; url: string; caption?: string | null; is_hero?: boolean; display_order?: number },
): Promise<HotelMediaRecord> {
  const { data, error } = await client
    .from('hotel_media')
    .insert({
      hotel_id: input.hotel_id,
      url: input.url,
      caption: input.caption ?? null,
      is_hero: input.is_hero ?? false,
      display_order: input.display_order ?? 0,
    })
    .select('id,hotel_id,url,caption,is_hero,display_order,created_at')
    .single();
  throwOnError(error);
  if (!data) throw new Error('Hotel media insert did not return a record.');
  return data as HotelMediaRecord;
}

export async function deleteHotelMedia(
  client: SupabaseClient,
  mediaId: string,
): Promise<{ id: string; url?: string } | null> {
  const { data, error } = await client
    .from('hotel_media')
    .delete()
    .eq('id', mediaId)
    .select('id,url')
    .maybeSingle();
  throwOnError(error);
  return data?.id ? { id: data.id as string, url: (data.url as string) || undefined } : null;
}

export async function setHotelMediaHero(
  client: SupabaseClient,
  hotelId: string,
  mediaId: string,
): Promise<void> {
  // Clear hero flag for all media in this hotel
  const { error: err1 } = await client
    .from('hotel_media')
    .update({ is_hero: false })
    .eq('hotel_id', hotelId);
  throwOnError(err1);

  // Set hero flag for the specified media
  const { error: err2 } = await client
    .from('hotel_media')
    .update({ is_hero: true })
    .eq('id', mediaId)
    .eq('hotel_id', hotelId);
  throwOnError(err2);
}
