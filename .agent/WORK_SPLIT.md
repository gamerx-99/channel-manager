# Work split: A (Claude Code) / B (Antigravity)

Confirmed by the human on 2026-10-26. Both agents read this file before starting work.
If an area is not listed, ask the human before touching it.

## Ownership

| | **A: Claude Code** | **B: Antigravity** |
|---|---|---|
| Scope | OTA / iCal sync, iCal room-type mode, OTA cron, SaaS plans & billing (spec 12) | Website Builder, public booking page (PublicHotel), image upload via Supabase Storage, occupancy pricing |
| Main files | `server/ota*`, `server/ical*`, `client/src/pages/OtaSync.tsx`, `client/src/components/OtaSyncStatusWidget*`, `ota_ical_sync_cron_setup.sql`, `specs/12-*` | `client/src/pages/WebsiteBuilder.tsx`, `client/src/pages/PublicHotel.tsx`, `server/db/siteConfig.ts`, `server/db/booking.ts`, `server/storage.ts`, `shared/occupancyPricing*`, `client/src/pages/HotelDetail.tsx` |
| Working folder | Own git worktree `C:\WORK\channel-manager-a`, branches `agent-a/*` | Main folder `C:\WORK\channel-manager` |

## Rules

1. **Separate folders and branches.** A works only in its own worktree, so neither side ever sees the other's uncommitted files.
2. **Shared files** (edit only your own part, commit soon after):
   - `server/routers.ts`: router registration only
   - `client/src/lib/i18n/en.ts`, `th.ts`: add keys only in your own section (`otaSync`/`billing` = A)
   - `shared/authorization.ts`
   - `client/src/index.css`
   - `.agent/handoff.md`: append only, never edit the other side's entries
3. **Migrations.** Always create a new file of your own; never edit the other side's migration. If two migrations touch the same table (e.g. `bookings`), tell the human first. The human applies them in Supabase, in order.
4. **Reaching `main` always goes through the human.** Each side works on its own branch. The human approves before every merge or push, one side at a time.
5. **Work in flight at split time:** the uncommitted occupancy files in the main folder (`server/db/booking.ts`, `server/db/types.ts`, `client/src/pages/HotelDetail.tsx`, `server/routers/bookingRouter.ts`, `server/routers/hotelRouter.ts`, `shared/occupancyPricing*`, `20261009_room_type_occupancy_pricing.sql`, `20261025_*.sql`, `tsconfig.json`, `drizzle-orm-mysql-core.d.ts`) belong to B. A does not touch them.

## Known overlap to coordinate

- `bookings` table: A's iCal blocks are rows with `source = 'ota_ical'` (price 0, no guests). B's booking/occupancy changes must keep accepting that source, and must not make `adults_count`/`children_count` NOT NULL without a default.
- `server/db/types.ts` `BookingRecord.source` already includes `'ota_ical'` (committed in d23447b).
