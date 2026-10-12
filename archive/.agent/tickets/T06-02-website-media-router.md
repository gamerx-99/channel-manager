# T06-02 — Website media table + router
Status: TODO
Owner: worker-code
Spec: specs/06-website-builder.md
Depends: T06-01
# Goal: Create migration 20260903_add_hotel_site_config.sql + verify_*.sql for hotel_site_config (hotel_id FK hotels unique, hero_copy text nullable, accent_color text nullable, visible_sections jsonb nullable, updated_at) + RLS. Note hotel_media already exists — add write helpers only if needed. Wire server/db.ts helpers saveHotelSiteConfig/getHotelSiteConfig and server/routers.ts procedures listHotelMedia/uploadHotelMedia/deleteHotelMedia + saveHotelSiteConfig/getHotelSiteConfig gated by property.manage_profile. Handle upload validation (size/type) before Supabase. Add server/hotelSiteConfig.access.test.ts + server/hotelMedia.test.ts permission tests. Run pnpm check/test/build.
