# Handoff

Newest entry on top. Old history: archive/ (do not read).

## 2026-10-12 - A1: iCal two-way sync (Phase A) — implementation complete, pending migration apply
- Inbound: `triggerOtaCalendarSync` now fetches the raw feed (`fetchIcalFeedText`),
  parses full VEVENTs (`parseIcalEvents` — UID/SUMMARY/DTSTART/DTEND, multi-night
  expansion, RFC 5545 unfolding), resolves event summaries to room types by
  normalized name (`resolveRoomTypesBySummary` in `server/db/otaBlocks.ts`),
  diffs against the persisted block set (`buildOtaImportBlockDiff`), and applies
  delete/insert via `replaceOtaImportBlocks`. Cancelled/shortened OTA events
  re-open exactly the nights they covered. Block application failures are
  logged and non-fatal to the sync run itself.
- Outbound: token-authed Express route `GET /api/ical/:hotelId.ics?token=…`
  (`server/_core/icalExport.ts`, registered in `server/_core/index.ts`) streams
  a derived feed from `buildOtaIcalFeed` (all-day VEVENTs, half-open DTEND,
  stable `ota-block-…@channel-manager` UIDs, no guest names). Token is generated
  lazily in `upsertOtaConnection` (one per hotel, trigger-enforced single token
  per hotel in the migration), surfaced copyable in the OTA page export dialog
  (new i18n keys en/th). `rebuildOwnExportFeed` writes an outbound
  `export_calendar` audit log after each successful sync.
- Client availability math: `getBookedRoomCountForDate` now also counts OTA
  blocked nights (`client/src/pages/calendarAvailability.ts`); Calendar page
  feeds the fetched block list in.
- Migration pair (human must apply in Supabase SQL editor — no DATABASE_URL here):
  `20261012_ical_two_way_sync.sql` (ota_import_blocks + RLS, ical_feed_token
  column + backfill + single-token-per-hotel trigger, block-count SQL fn, both
  public availability RPCs rewritten to subtract blocks) and
  `verify_20261012_ical_two_way_sync.sql` (10 checks, all should read PASS).
  Ticket is NOT done until the human confirms the verify script passes live.
- Tests: `server/otaSync.test.ts` +13 (expandDateRange, countNights,
  parseIcalEvents incl. unfolding, block diff, feed builder, UID);
  `client/src/pages/OtaSync.contract.test.ts` new (export affordance markers);
  `client/src/pages/calendarAvailability.test.ts` +2 (block counting and
  availability subtraction); `Calendar.test.tsx` tRPC mock extended with
  `ota.listImportedBlocks`.
- Evidence (final, after wiring client-side block subtraction and fixing the
  Calendar test mock): `pnpm check` exit 0; `pnpm test` → 91 files passed /
  2 skipped, **510 passed | 3 skipped, 0 failed**; `pnpm build` exit 0.
- Sidebar menu renamed "OTA Sync" → "Calendar Sync" / "ซิงก์ปฏิทิน" (both
  sidebar i18n blocks in en.ts/th.ts).
- ASSUMPTION (logged per hard rule 7): imported OTA events are matched to room
  types by case-insensitive SUMMARY === room_types.name; unmatched summaries are
  skipped (not persisted) for this phase. Feed payloads stay privacy-safe
  (fingerprints + counts only), so no guest data reaches ota_sync_logs.
- AcceptInvite flake re-confirmed: passed in the full run twice.


## 2026-10-12 - Scope reset
- Old plans, specs, reports and reference data moved to archive/.
- Scope and tasks: RONDMAP.md only. Next task: A1 iCal two-way sync (Codex), then A2.
