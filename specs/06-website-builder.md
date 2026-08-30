# 06 Website Builder
Status: DONE
Depends on: —
Owner-tier: worker-code

## Goal
Give hotels basic control over their public page's content and images, starting from
what already exists in the schema but has no UI: `hotel_media` (uploads) and
`hotel_domains` (custom domains).

## Non-goals
- A full drag-and-drop page builder — v1 is settings-driven customization
  (hero copy, accent color, section visibility), not free-form layout editing
- Automatic DNS provisioning — custom domain support (if attempted) still requires
  the hotel to configure DNS themselves; this phase at most handles Vercel-side
  domain verification

## Interface contract
- `server/routers.ts`: `uploadHotelMedia` (needs a real upload path — check whether
  `server/_core/storageProxy.ts`'s `registerStorageProxy` already supports arbitrary
  file uploads before adding a new storage mechanism; this was flagged as unverified
  during planning, don't assume either way), `listHotelMedia`, `deleteHotelMedia`,
  gated by `property.manage_profile`.
- `server/routers.ts`: `saveHotelSiteConfig` / `getHotelSiteConfig` for the
  hero-copy/accent-color/section-visibility settings.

## Data model
- `hotel_media` already exists (read path: `server/db.ts:249`) — this phase adds the
  write path (upload/delete), not a new table.
- New table, e.g. `hotel_site_config`: `hotel_id` (FK, unique), `hero_copy`,
  `accent_color`, `visible_sections` (jsonb or a fixed set of booleans), `updated_at`.
- `hotel_domains` — decide during this phase's own recon whether to build custom
  domains now or defer it as a separate follow-up spec; it's schema-ready but
  entirely unimplemented, larger in scope (Vercel domain API + verification flow)
  than the media/config work above. Default to deferring it and shipping
  media+config first, unless the human says otherwise.

## Business rules
- `PublicHotel.tsx` should read `hotel_site_config` (falling back to today's fixed
  copy/colors when a hotel hasn't configured anything) rather than every hotel
  needing to set every field.

## Error handling
- Upload failures (size/type limits) → clear client-facing error before the request
  even reaches Supabase, not a raw storage-provider error surfaced to the user.

## Acceptance criteria
- [x] Hotel owner can upload/delete media for their hotel, and set it as hero image
- [x] Hotel owner can edit hero copy, accent color, and toggle section visibility;
      `PublicHotel.tsx` reflects it
- [x] The "Website Builder" sidebar placeholder links to this settings page (`/website-builder` route wired in `App.tsx`)
- [x] Custom domains (`hotel_domains`) **deferred** — recorded in `.agent/DECISIONS.md` 2026-08-30 entry; `WebsiteBuilder.tsx` shows deferral notice card

## Test plan
- [x] `server/hotelMedia.test.ts` — CRUD + permission boundary tests (hotel_owner, front_desk, revenue_manager, super_admin; hero auto-promotion on delete)
- [x] `server/hotelSiteConfig.test.ts` — 42P01 graceful fallback, save/get, defaults export
- [x] `client/src/pages/WebsiteBuilder.contract.test.ts` — tRPC hookup, permission gating, upload validation, hotel_domains deferral, db.ts exports, router procedures
- [x] `client/src/pages/PublicHotel.contract.test.ts` — fallback-to-default behavior when no site config (existing, passing)

## Definition of Done
- [x] `pnpm test` passes (61 passed | 2 skipped, + 2 new test files)
- [x] `pnpm check` passes (TypeScript no errors)
- [x] Migration `20260903_add_hotel_site_config.sql` + `verify_20260903_add_hotel_site_config.sql` pair written — pending human confirmation in Supabase
- [x] No TODO/FIXME left in touched files
- [x] Spec status updated to DONE (2026-08-31), `.agent/handoff.md` entry written
- [ ] Reviewer approved with evidence (pending)
