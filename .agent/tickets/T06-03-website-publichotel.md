# T06-03 — PublicHotel fallback to site config
Status: TODO
Owner: worker-code
Spec: specs/06-website-builder.md
Depends: T06-02
# Goal: Make client/src/pages/PublicHotel.tsx read hotel_site_config (fallback to fixed copy/colors when not configured). Update server/db.ts getHotelSiteConfig to return default when no row. Add client/src/pages/PublicHotel.siteConfig.test.ts or contract test proving fallback behavior. Run pnpm check/test/build.
