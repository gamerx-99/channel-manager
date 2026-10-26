-- =====================================================================
-- Migration: 20261027_hotel_site_config_public_read.sql
-- Target: channel-manager (Supabase / Postgres)
--
-- Context:
--   1. Create public.hotel_site_config table if not exists (with indexes and RLS).
--   2. Allow anonymous visitors to read hotel_site_config for published hotels
--      (matching hotel_media_public_select pattern).
--   3. Ensure table grants for public.hotel_site_config are accessible via PostgREST.
--   4. Create Supabase Storage bucket 'hotel-media' (public read).
--   5. Install storage.objects RLS policies so uploads/deletes require hotel
--      management rights (can_manage_property) and enforce hotel_id path prefix.
-- =====================================================================

BEGIN;

-- 1. Create public.hotel_site_config table if not already created
CREATE TABLE IF NOT EXISTS public.hotel_site_config (
  hotel_id uuid PRIMARY KEY REFERENCES public.hotels(id) ON DELETE CASCADE,
  hero_copy text,
  accent_color text CHECK (accent_color ~ '^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$'),
  visible_sections jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_hotel_site_config_hotel_id
  ON public.hotel_site_config (hotel_id);

CREATE INDEX IF NOT EXISTS idx_hotel_site_config_updated_at
  ON public.hotel_site_config (updated_at desc);

ALTER TABLE public.hotel_site_config ENABLE ROW LEVEL SECURITY;

-- 2. Grants & RLS Policies for public.hotel_site_config
GRANT SELECT ON TABLE public.hotel_site_config TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON TABLE public.hotel_site_config TO authenticated;

DROP POLICY IF EXISTS hotel_site_config_select ON public.hotel_site_config;
DROP POLICY IF EXISTS hotel_site_config_public_select ON public.hotel_site_config;
DROP POLICY IF EXISTS hotel_site_config_manage ON public.hotel_site_config;

-- Public read for visitors when hotel is published or caller is hotel member
CREATE POLICY hotel_site_config_public_select ON public.hotel_site_config
  FOR SELECT
  USING (
    public.is_super_admin()
    OR EXISTS (
      SELECT 1 FROM public.hotels h
      WHERE h.id = hotel_id AND (h.public_enabled = true OR public.is_hotel_member(h.id))
    )
  );

-- Manage policy: hotel_owner and super_admin
CREATE POLICY hotel_site_config_manage ON public.hotel_site_config
  FOR ALL
  USING (
    public.is_super_admin() OR public.can_manage_property(hotel_id)
  )
  WITH CHECK (
    public.is_super_admin() OR public.can_manage_property(hotel_id)
  );

-- 3. Supabase Storage: Bucket 'hotel-media' (public read)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'hotel-media',
  'hotel-media',
  true,
  10485760, -- 10MB limit
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO UPDATE SET
  public = true,
  file_size_limit = 10485760,
  allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

-- 4. Storage Policies on storage.objects

-- 4a. Public Read: anyone can view objects in hotel-media
DROP POLICY IF EXISTS "hotel_media_public_read" ON storage.objects;
CREATE POLICY "hotel_media_public_read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'hotel-media');

-- 4b. Insert: only authenticated users with property management rights for the hotel
--     Enforces path convention: <hotel_id>/<filename>
DROP POLICY IF EXISTS "hotel_media_manage_insert" ON storage.objects;
CREATE POLICY "hotel_media_manage_insert"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'hotel-media'
    AND split_part(name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    AND public.can_manage_property(split_part(name, '/', 1)::uuid)
  );

-- 4c. Update: only authenticated users with property management rights
DROP POLICY IF EXISTS "hotel_media_manage_update" ON storage.objects;
CREATE POLICY "hotel_media_manage_update"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'hotel-media'
    AND split_part(name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    AND public.can_manage_property(split_part(name, '/', 1)::uuid)
  )
  WITH CHECK (
    bucket_id = 'hotel-media'
    AND split_part(name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    AND public.can_manage_property(split_part(name, '/', 1)::uuid)
  );

-- 4d. Delete: only authenticated users with property management rights
DROP POLICY IF EXISTS "hotel_media_manage_delete" ON storage.objects;
CREATE POLICY "hotel_media_manage_delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'hotel-media'
    AND split_part(name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    AND public.can_manage_property(split_part(name, '/', 1)::uuid)
  );

COMMIT;
