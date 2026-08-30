# T06-04 — Website Builder UI
Status: TODO
Owner: worker-code
Spec: specs/06-website-builder.md
Depends: T06-02
# Goal: Replace Website Builder sidebar placeholder in App.tsx with real settings page client/src/pages/WebsiteBuilder.tsx — upload/delete media (with preview as hero), edit hero_copy/accent_color/visible_sections toggles, save via tRPC. Add Route /website-builder and routeScope mapping. Wire to tRPC saveHotelSiteConfig/getHotelSiteConfig + hotel media procedures if available, else local state with TODO like T02-05 pattern. Add client/src/pages/WebsiteBuilder.contract.test.ts. Ensure pnpm test/check/build pass. Document hotel_domains defer in DECISIONS.md if deferring.
