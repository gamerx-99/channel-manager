# Handoff

Newest entry on top. Old history: archive/ (do not read).

## 2026-10-17 — Remaining three review findings closed (token, dashboard, .ics button)
- **1. iCal feed token was derivable, not just guessable** (P1).
  `20261012` backfilled `md5('ical-feed-token-v1:' || hotel.id)`, and hotel.id
  is readable by anonymous callers via `get_public_hotel()`. So an attacker
  computed the token instead of brute-forcing it and read any hotel's booking
  calendar. New `20261017_ical_feed_token_rotation.sql` + verify rotate every
  row to `encode(gen_random_bytes(32),'hex')`, one token per hotel per statement
  so the single-token trigger holds. `upsertOtaConnection` already used
  `sha256(randomUUID())`, so only backfilled rows were weak — rotating all is
  the only way to be sure. **The migration header states plainly that every
  `.ics` URL already sent to an OTA stops working and must be re-sent**; there is
  no way to keep the old URLs and remove the weakness, the old value is public.
  Owner action: apply + verify, then re-send URLs from the OTA page. Still no
  rotate button — a separate small ticket.
- **2. `dashboardCalendar` ignored imported OTA blocks** — the cross-hotel Home
  calendar showed rooms as sellable that the per-hotel calendar
  (`client/src/pages/Calendar.tsx`) and the public availability RPCs both closed,
  so staff saw availability the guest site would refuse. Now reads
  `listOtaImportBlocks` per hotel and subtracts before computing
  healthy/low/closed.
  The arithmetic moved into shared helpers `countBlockedUnitsByRoomTypeAndDate`
  and `subtractOtaBlocks` in `server/db/otaBlocks.ts` so the three surfaces
  that subtract OTA inventory cannot drift apart again — that drift is what
  caused the bug. `countOtaBlockedNights` in `server/db/booking.ts` still has its
  own inline loop; consolidating it onto the helper is a tidy-up, not a fix.
- **3. The `.ics` export button was unreachable** — gated on
  `conn.ical_export_url`, which is only populated when an OTA supplies one, but
  the dialog it opens shows OUR generated URL built from `ical_feed_token`.
  Every connection a hotel created from that page therefore had no way to see
  or copy its own calendar URL — the RONDMAP A1 deliverable was invisible for
  exactly the hotels that need it. Gate removed.
- **Tests:** `server/db/otaBlocks.test.ts` 7→13 cases (the 6 new ones cover the
  shared helpers, including the multi-event-one-night count and the floor at
  zero); `client/src/dashboardCalendar.contract.test.ts` +1 regression asserting
  the dashboard calls the helpers; `client/src/pages/OtaSync.contract.test.ts`
  +2 asserting the button is not gated on `ical_export_url`.
- **Evidence:** `pnpm check` exit 0 · `pnpm test` 100 files passed / 2 skipped,
  **597 passed | 3 skipped, 0 failed** · `pnpm build` ✓, dist/index.js 272.1kb.
- **No app change needed for the token rotation.** Still not committed, not
  pushed, no SQL run against live.

## 2026-10-17 — Gate A P0 fixed: OTA cancellation reopened other bookings' rooms
- **Bug:** `replaceOtaImportBlocks` deleted OTA blocks on
  (hotel, provider, room_type_id, date) with **no `source_uid`**, while the
  schema's uniqueness key is (provider, room_type_id, date, source_uid) — i.e.
  several reservations may block the same room type on the same night. A hotel
  selling 3 Deluxe rooms on Agoda, cancelling one, deleted all three blocks and
  re-opened the 2 rooms that were still sold (over-sell on both availability
  RPCs and the public hold path).
- **Fix (`server/db/otaBlocks.ts`, `server/otaSync.ts`):**
  1. Added `.eq('source_uid', item.source_uid)` to the delete.
  2. `listOtaImportBlocks(client, hotelId, provider?)` gained an optional
     provider scope; `triggerOtaCalendarSync` now passes `provider`. Reading all
     providers let another OTA's row with a colliding `source_uid` satisfy the
     key, so this provider's own reservation was never inserted and silently
     stopped blocking inventory.
  3. New `selectDeletableBlocks(previous, unresolvedUids)` keeps blocks whose
     event is still in the feed but whose SUMMARY no longer matches a room type.
     Previously such an event fell out of `resolvedEvents`, landed in `removed`,
     and re-opened a room the OTA still holds. Now logged via `console.warn`
     (the `unmatched` list was destructured and never read).
  4. Moved the `status:'success'` sync-log write to AFTER the block apply and
     `last_sync_at`. `getPreviousIcalSnapshot` filters on `success`, so the old
     order let the next run diff against a snapshot whose inventory change never
     happened.
- **Tests:** new `server/db/otaBlocks.test.ts` (7 cases) asserts the delete
  filter carries `source_uid` and that cancelling one of three same-night
  siblings leaves two blocks standing. Verified it catches the bug: removing
  `.eq('source_uid')` makes 2 of the 7 fail. `server/otaSync.test.ts` +4 for
  `selectDeletableBlocks`.
- **Evidence:** `pnpm check` exit 0 · `pnpm test` 100 files passed / 2 skipped,
  **588 passed | 3 skipped, 0 failed** · `pnpm build` ✓, dist/index.js 271.1kb.
- **No migration needed** — code-only change, works against the schema already
  applied on 2026-10-13.
- **Still open from the same review:** the iCal feed token is
  `md5('ical-feed-token-v1:' || hotel_id)` and derivable, with no rotate path
  (P1); `dashboardCalendar` ignores OTA blocks so the Home calendar disagrees
  with the per-hotel one; the `.ics` button is gated on `ical_export_url` which
  UI-created connections never set.
- **Not committed, not pushed.**

## 2026-10-17 — Independent review + SaaS shell (6 steps, all six done, nothing committed)
- **Step 1 restored the build.** The working tree had uncommitted B1 work that
  did not parse: a nested `import {}` in `server/routers/bookingRouter.ts` and a
  missing/extra brace around `createBookingWithGuests` in `server/db/booking.ts`.
  Root cause of the confusing second error: the repo has BOTH `server/db.ts` and
  `server/db/index.ts`, and `from '../db'` resolves to the **file** `server/db.ts`.
  B1 had added its exports to the dead `index.ts`. Added the missing export to
  `server/db.ts`; left `index.ts` alone pending the owner's delete decision
  (logged in RONDMAP "พบระหว่างทาง").
- **One behaviour change:** `accepted_policy_version` is now `.optional()`
  (`bookingRouter.ts:71`). B1 made it required, but the wizard never sends it,
  so every public booking would have failed validation. Server-side enforcement
  is unchanged — a hotel WITH a policy row still requires a matching version
  (`server/db/booking.ts:518`). Marked `ASSUMPTION:` in the schema comment.
- **Step 2 — P0 cross-tenant escalation closed at the DB layer.**
  `20261017_hotel_users_role_escalation_guard.sql` + verify. `hotel_users`
  writes previously allowed `can_manage_staff(hotel_id) and role <> 'super_admin'`,
  which let any hotel_owner self-assign the platform `admin` role via direct
  PostgREST (anon key is public in client source); `is_platform_admin()` then
  short-circuits `is_hotel_member()` for every tenant. New WITH CHECK allows
  only the four hotel-scoped roles for non-super-admins. Verify asserts the
  policy text no longer contains a bare `role <> ` guard.
- **Steps 3–5 — billing.** `20261017_saas_billing_schema.sql` adds `plans`,
  `subscriptions`, `hotels.suspended_at/deleted_at`, and `hotel_is_active()`.
  RLS is capability-scoped from the start (`is_super_admin` for subscription
  writes) specifically to avoid the post-bootstrap regression where every newer
  table used `is_hotel_member` on writes. Pure logic lives in `shared/billing/`
  per the `channelPerformance.ts` precedent. `holdRoomType` is the single
  enforcement point; `getPublicHotelAvailability` now returns a `billing` field
  so the public page closes the book action. `billingRouter` covers plans /
  mySubscription / createCheckout (PromptPay QR, amount computed server-side) /
  confirmPayment / trial / listAll / suspend / soft-delete.
- **Step 6 — self-signup + landing.** `signupRouter.createHotel` requires a
  session and always binds `ctx.user.id` (the P1-4 finding on the invite-token
  flow, avoided by construction), derives the slug server-side with Thai
  preserved, and opens the trial in the same call. `Landing.tsx` is the new `/`
  route; `Signup.tsx` is `/signup`. `/` no longer redirects to the dashboard.
- **Owner decision (2026-10-17):** trial first, then tiered by physical room
  count (not room-type count). On non-payment: block NEW bookings only — existing
  data stays readable so check-in/check-out and ร.ร.4 / ตม.30 continue.
- **Evidence:** `pnpm check` exit 0 · `pnpm test` 99 files passed / 2 skipped,
  **577 passed | 3 skipped, 0 failed** · `pnpm build` ✓ built, dist/index.js
  270.4kb.
- **NOT committed, NOT pushed, no SQL run against live.** The two migrations
  need the owner's hands in the Supabase SQL editor, and `PLATFORM_PROMPTPAY_ID`
  must be set in Vercel. Plan prices are placeholders (see
  `.agent/OPEN_QUESTIONS.md`).
- **Out of scope, found by the same review, NOT fixed:** `otaBlocks.ts:193`
  deletes OTA blocks without `source_uid` (P0 — one cancellation reopens other
  bookings' rooms); the iCal feed token is `md5(hotel_id)` and derivable
  (P1, no rotate path); no `past_due` sweep and no PromptPay webhook; no
  staff-facing lapsed-subscription banner yet.

## 2026-10-14 - Gate A independent review — FAIL
- `kb-review -by codex -base origin/main -phase 'Gate A: RONDMAP Phase A (A1-A3)'`
  returned FAIL for HEAD `30b4478`; report is in the KB review folder.
- Confirmed from source: OTA block deletion omits `source_uid` and sync diffs
  all providers together (`server/db/otaBlocks.ts`, `server/otaSync.ts`); the
  live migration backfills public feed tokens deterministically from hotel IDs.
  These are Gate A blockers; no production SQL or code fixes were made.
- RONDMAP A2 verification/UAT and A3 live migration + booking confirmation
  remain unchecked.
- Working tree also has out-of-order, uncommitted B1 work. Current `pnpm check`,
  `pnpm test`, and `pnpm build` fail because `server/routers/bookingRouter.ts`
  and `server/db/booking.ts` have parse errors in those changes.
- Changed files: this handoff, one RONDMAP note; no code or production DB.
- Next step: fix/review Gate A blockers and complete A2/A3 live evidence before
  advancing to B1. Review artifact: `30b4478...claude.md`.

## 2026-10-13 - A1 migration second live failure fixed (21a3c43)
- Owner's live apply failed: 42P13 return type mismatch in
  `get_ota_blocked_room_type_counts` (2 declared columns, 3 selected).
- Running the file on a disposable postgres:16 (base schema + prior migrations)
  also found: both availability RPCs raised a GROUP BY error at call time; the
  ota_import_blocks insert policy let any hotel member insert blocks for every
  hotel (unqualified hotel_id); a re-run failed on the trigger name; verify
  `check_availability_grants` always FAILed. All fixed in 21a3c43.
- Evidence: apply x2 OK, verify 15/15 PASS, cross-hotel insert denied,
  availability 2 rooms - 1 block = 1; negative controls FAIL as expected.
  pnpm test/check/build unchanged since ee10dad (SQL only; no TS reads it).
- Still open: token backfill derives the feed token from the hotel id
  (md5 formula) and no rotate path exists — owner to decide before the live
  apply succeeds. A1 stays NOT-DONE until the owner runs migration + verify on live.

## 2026-10-12 - Phase A working session — A1 committed, A3 retired legacy endpoint, A2 test coverage confirmed
- A1 (iCal two-way sync): code + migration pair committed (`4658dff`) — the working
  tree had the completed implementation uncommitted. Separated the scope-reset
  archive move into its own commit (`6c1b203`). Migration pair
  `20261012_ical_two_way_sync.sql` + `verify_20261012_ical_two_way_sync.sql` still
  requires HUMAN apply in Supabase SQL editor (agent forbidden from running SQL on
  live). Ticket A1 stays NOT-DONE until that confirmation.
- A3: retired the legacy one-shot public booking endpoint. Removed
  `createPublicBooking` from `server/routers.ts` + `bookingRouter.ts`, removed
  `createPublicBooking` from `server/db/booking.ts` and `CreatePublicBookingInput`
  from `server/db/types.ts`. Added router-level regression test in
  `server/bookingRouter.wiring.test.ts` asserting `createPublicBooking` is
  undefined on the real appRouter. Trimmed now-dead tests from
  `server/publicBooking.test.ts` (kept getStayDates / price-override /
  availability-RPC coverage). Commit `11bd5ab`.
- A3 party size: verified already implemented — `holdRoomType` persists
  adults/children/child_measurements on the held booking, Bookings.tsx renders
  occupancy + child measurements, migration pair `20261010_booking_guest_counts.sql`
  exists (human must still confirm apply + verify live).
- A3 extra bed: no code change needed — wizard step ③ already offers the hotel's
  active services catalog; the owner adds an "เตียงเสริม / Extra bed" PER_NIGHT
  service in HotelServices (same owner-action shape as A2's Little Bro item).
- A2: pricing engine + RPCs + hold path already implement occupancy pricing;
  unit coverage exists in `shared/occupancyPricing.test.ts` (2/3/4-guest levels,
  child classification incl. infant/age-group/height, disabled-level rejection).
  Remaining A2 items are human/live: run `verify_20261009_room_type_occupancy_pricing.sql`
  on live, manual 2/3/4-guest booking test, and owner enabling 3–4 person levels
  for Little Bro.
- Evidence (after A3 changes): `pnpm check` exit 0; `pnpm test` → 91 files passed /
  2 skipped, **510 passed | 3 skipped, 0 failed**; `pnpm build` exit 0.
- Note: deleted tests were removed only because the endpoint they exercised no
  longer exists (A3 requirement "เรียก endpoint เก่าไม่ได้"); coverage moved to a
  router-level retirement assertion in bookingRouter.wiring.test.ts.
- Next human steps: apply+verify `20261012_ical_two_way_sync.sql` (A1) and
  `20261010_booking_guest_counts.sql` + `20261009_room_type_occupancy_pricing.sql`
  verify scripts (A2) in Supabase; owner-side pricing/service configuration.
- A1 migration fix (same day, post first apply attempt): the live apply failed at
  the token backfill with 23P01 `ical_feed_token must be identical across all
  connections of a hotel` — the original backfill generated a fresh random token
  per ROW, so a hotel with 2+ connections hit the single-token trigger on its
  second row and the statement aborted, leaving the rest of the file unapplied
  (RLS policies, block-count fn, availability RPC rewrites). Fix: backfill now
  assigns ONE deterministic token per hotel (md5 of 'ical-feed-token-v1:' ||
  hotel id) to all of that hotel's rows in a single UPDATE FROM statement.
  Deterministic = safe to re-run after the partial apply; rows already holding a
  token are skipped. NOTE the token is a deterministic derivation of a public
  hotel id — acceptable here because it is only created by this one-time backfill
  (app path uses hash of random UUID) and rotating it is a future owner action;
  flagged as ASSUMPTION in the migration comment. Verify script gained a
  `check_single_token_per_hotel` check (count(distinct ical_feed_token) > 1 per
  hotel must return zero rows). Re-run the whole migration file top to bottom in
  the SQL editor; every step is idempotent, then run the verify script.


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
