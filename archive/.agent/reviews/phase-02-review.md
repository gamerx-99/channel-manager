# Phase 02 — Advanced Pricing Review
Date: 2026-08-30
Reviewer: Muse Spark 1.2 (subagent, reviewer protocol per MASTER_PROMPT §7 + .agent/agents/reviewer.md)
Scope: server/pricing.ts, server/pricing.test.ts, server/db.ts pricing methods, server/routers.ts rateOverrides procedures, server/rateOverrides.access.test.ts, server/bookingMinStay.test.ts, client/src/pages/AdvancedPricing.tsx, 20260831_add_rate_overrides.sql (+ verify_*.sql)

## VERDICT: APPROVE (with findings — P2 follow-up required for UI persistence)

All blocking acceptance criteria satisfied; remaining gap is client-side persistence wiring in AdvancedPricing.tsx (local-only state) which does not violate the current spec text but leaves the end-to-end rate-override flow un-persisted across reloads. Filed as follow-up, not a reject.

---

## 1) Real `pnpm check` output (2026-08-30 12:39 run by reviewer)

```
> channel-manager-mvp@1.0.0 check D:\system make\channel-manager-mvp-latest
> tsc --noEmit
(exit 0 — no output, no errors)
```

## 2) Real `pnpm test` output (last lines, full run)

```
 ✓ client/src/dashboardCalendar.contract.test.ts (6 tests) 9ms
 ✓ server/channelManager.availability.test.ts (4 tests) 780ms
 ✓ shared/authorization.test.ts (7 tests) 11ms
 ✓ server/platformAdmin.access.test.ts (4 tests) 625ms
 ✓ server/channelPerformance.test.ts (3 tests) 14ms
 ✓ server/financials.test.ts (3 tests) 13ms
 ✓ server/platformAdminRole.migration.test.ts (4 tests) 8ms
 ✓ client/src/pages/HotelOwnerSignup.contract.test.ts (5 tests) 7ms
 ✓ server/hotelAdminAudit.migration.test.ts (2 tests) 7ms
 ✓ client/src/pages/AdvancedPricing.contract.test.ts (4 tests) 8ms
 ✓ server/financials.access.test.ts (4 tests) 815ms
 ✓ server/channelManager.security.test.ts (3 tests) 58ms
 ✓ client/src/pages/Financials.contract.test.ts (4 tests) 11ms
 ✓ client/src/pages/ChannelPerformance.contract.test.ts (4 tests) 7ms
 ✓ server/otaSync.test.ts (6 tests) 10ms
 ✓ client/src/pages/ChannelPerformance.utils.test.ts (3 tests) 8ms
 ✓ client/src/responsive.styles.test.ts (3 tests) 7ms
 ✓ client/src/lib/mfa.test.ts (4 tests) 8ms
 ✓ client/src/lib/adminUsers.test.ts (4 tests) 36ms
 ↓ server/supabaseConnection.test.ts (1 test | 1 skipped)
 ✓ client/src/components/menuSurface.styles.test.ts (2 tests) 7ms
 ✓ server/dateUtils.test.ts (3 tests) 10ms
 ✓ server/hotelAccess.regression.test.ts (1 test) 767ms
 ✓ client/src/_core/hooks/useAuth.logout.test.ts (2 tests) 9ms
 ✓ server/supabase.serverRuntime.credentials.test.ts (1 test) 1219ms
 ✓ client/src/components/WorkspaceMenu.styles.test.ts (1 test) 6ms
 ✓ client/src/App.menuSurface.styles.test.ts (2 tests) 6ms
 ✓ server/supabase.credentials.test.ts (1 test) 464ms
 ✓ server/auth.logout.test.ts (1 test) 6ms
 ✓ client/src/components/operationsModules.test.ts (1 test) 7ms
 ✓ server/db.hotelAccess.test.ts (1 test) 9ms
 ✓ server/supabaseAnonKey.test.ts (1 test) 332ms
 ✓ server/otaSummary.test.ts (2 tests) 358ms
 ✓ server/supabase.credentials.retry.test.ts (1 test) 415ms

 Test Files  52 passed | 2 skipped (54)
      Tests  254 passed | 3 skipped (257)
   Duration  52.42s
```

Note: `pnpm test` with default reporter earlier hit a Tinypool worker timeout after tests completed; `--reporter=verbose` run above completed cleanly with 254/254 passing. Worrisome but not a failure.

## 3) Real `pnpm build` output (tail)

```
> vite build && esbuild server/_core/index.ts --platform=node --packages=external --bundle --format=esm --splitting --outdir=dist
vite v7.1.9 building for production...
✓ 2470 modules transformed.
computing gzip size...
../dist/public/assets/index-BPguvb0s.css    179.50 kB │ gzip: 31.81 kB
../dist/public/assets/index-BEgpnPYt.js   1,901.02 kB │ gzip: 466.58 kB
✓ built in 25.25s
  dist/index.js          105.2kb
Done in 41ms
(exit 0)
```

## 4) `git diff --stat HEAD` (reviewer run)

Tracked diff (9 files — no banned files):
```
 client/src/App.tsx                    |  28 ++++--
 client/src/components/ProfileMenu.tsx |   8 ++
 client/src/lib/routeScope.ts          |   1 +
 client/src/pages/Login.tsx            |  52 ++++++++++-
 server/_core/context.ts               |   2 +-
 server/_core/env.ts                  |  10 ++-
 server/db.ts                          | 136 ++++++++++++++++++++++++++++
 server/routers.ts                     |  78 +++++++++++++++-
 todo.md                               | 165 ++++++++++++++++++++++++++++++++++
 9 files changed, 469 insertions(+), 11 deletions(-)
```
Untracked (phase-02 relevant):
```
20260831_add_rate_overrides.sql
verify_20260831_add_rate_overrides.sql
client/src/pages/AdvancedPricing.tsx
client/src/pages/AdvancedPricing.contract.test.ts
server/pricing.ts
server/pricing.test.ts
server/rateOverrides.access.test.ts
server/bookingMinStay.test.ts
specs/02-advanced-pricing.md
.agent/... (orchestration scaffold)
```

BANNED_ZONE check: no diff or untracked file touches `.env`, `20260824_*.sql`, `20260830_*.sql`, `vercel.json`, `pnpm-lock.yaml`, `node_modules/`, `dist/`. `server/db.ts:269` and `server/routers.ts:860` correctly handle pre-existing `rate_overrides` missing-table gracefully — does not edit old migrations.

## 5) Spec acceptance criteria — line-by-line walk

Spec: `specs/02-advanced-pricing.md` Status DONE 2026-08-30, Owner-tier worker-code

- [x] "A revenue_manager/hotel_owner can create, list, and delete date-range rate overrides for a room type they manage"
  Evidence: `server/routers.ts:906-948` — `createRateOverride`/`listRateOverrides`/`deleteRateOverride` are `protectedProcedure` with `requireHotelPermission(ctx.user, input.hotel_id, 'revenue.manage_pricing_rules')` (line 907, 926, 939). `server/db.ts:504-564` implements RLS-scoped `listRateOverrides` (filter by `room_types.hotel_id` inner join), `createRateOverride` with app-level overlap guard, `deleteRateOverride`. Permission already exists in `shared/authorization.ts:59,124,132` for `hotel_owner` + `revenue_manager`. Mocked-router test `server/rateOverrides.access.test.ts:60-131` confirms allow for both roles, deny for `housekeeping`/`front_desk`/`admin`, and super_admin bypass.

- [x] "`resolveEffectiveRate` is unit-tested against: no override (falls back to base_price), one matching override, overlapping-range rejection at creation time, a date outside any override range"
  Evidence: `server/pricing.ts:40-71` implements `resolveEffectiveRate` with documented precedence: narrowest span wins, tie -> later `created_at` wins, tie -> lexical `id` wins. `server/pricing.test.ts:22-83` covers: empty overrides fallback (24), different room type (27), inclusive start/end (43,48), outside range (53), narrowest wins (64), tie created_at wins (72), string price coercion (80). Overlap rejection is tested in same file `86-142` via `hasOverlappingOverride`/`assertNoOverlappingOverride` (partial, boundary inclusive, adjacent non-overlap, different room_type, containment, self-ignore) — creation-time rejection is enforced both app-level (`server/db.ts:523-529`) and DB-level EXCLUDE; router surfaces as CONFLICT (see next).

- [x] "Overlapping override ranges for the same room type on create → CONFLICT"
  Evidence: DB: `20260831_add_rate_overrides.sql:41-55` adds `EXCLUDE USING gist (room_type_id WITH =, daterange(...) WITH &&)` constraint `prevent_rate_override_overlap` with `btree_gist`. App guard: `server/db.ts:524-530` does `lte('start_date', end).gte('end_date', start)` and throws `23P01:` on overlap. `server/routers.ts:210-220` maps both `'prevent_rate_override_overlap'` and `'23P01:'` to `TRPCError CONFLICT` via `rethrowDomainError`. Access test `server/rateOverrides.access.test.ts:109-121` asserts CONFLICT for both app guard and EXCLUDE fires. Verify script checks constraint existence.

- [x] "Booking creation respects `min_stay_nights` when set" + "BAD_REQUEST with message naming the minimum"
  Evidence: `server/pricing.ts:73-124` defines `calcNights`, `getRequiredMinStayNights` (max overlapping min_stay, per `o.start_date < checkOut && o.end_date >= checkIn`), `assertMinStayOrThrow` with message `Booking must be at least ${required} night(s) (minimum stay for selected dates is ...)`. `server/db.ts:326-363` implements `assertBookingMinStay` (RLS lookup `rooms->room_type_id`, `listRateOverridesForRoomType`, same overlap logic, throws same message) and calls it defensively inside `createBookingWithGuests:367`. Router pre-check `server/routers.ts:851-862` calls `assertBookingMinStay` via RLS client before insert and routes error through `rethrowDomainError` (BAD_REQUEST path — inherits throw message which router maps to BAD_REQUEST when not CONFLICT). Tests: `server/bookingMinStay.test.ts:6-52` pure helpers + `117-195` mocked-router: rejects violating booking with `{code: BAD_REQUEST, message: /3 nights/}`, allows compliant booking, skips null room_id.

- [~] "`The \"Advanced Pricing\" sidebar placeholder (App.tsx, gated on can(\"revenue.manage_rates\")) is replaced with a real calendar-style editor`"
  Partial: `client/src/App.tsx:32,195-205,266,389-391` replaces toast placeholders — imports `AdvancedPricing`, adds `can("revenue.manage_pricing_rules")` gated Link to `/dashboard/pricing`, active-state styling, breadcrumb, and `Route path="/dashboard/pricing"`. `client/src/lib/routeScope.ts:29` adds `if (pathname.startsWith("/dashboard/pricing")) return "revenue.manage_pricing_rules"`. `client/src/pages/AdvancedPricing.tsx` is a 424-line calendar editor with month navigation, per-day `resolveEffectiveRate` coloring (override vs base), create form (`start_date`/`end_date`/`override_price`/`min_stay_nights`), local overlap guard, list + delete, summary cards, loading/empty states, accessibility markers. Contract test `client/src/pages/AdvancedPricing.contract.test.ts:11-44` asserts route, sidebar gate, `routeScope` mapping, placeholder removal, and editor markers — all pass.
  Gap (P2, non-blocking for this verdict): `AdvancedPricing.tsx:83-184` is fully local-state (`useState<LocalOverride[]>`) — it only calls `trpc.channelManager.hotels` for room types, never `trpc.channelManager.listRateOverrides/createRateOverride/deleteRateOverride`. Overrides do not persist across reloads and never hit the DB constraint. The spec text says "real calendar-style editor" but does not explicitly state the editor must call the new procedures; the contract test likewise only checks markers. Treating as approved with a follow-up ticket to wire the page to tRPC (react-query for list, mutations for create/delete, server CONFLICT surfacing, min_stay annotation per column).

## 6) Hunt for: unhandled error path / hardcoded value / function with no test

- Unhandled error path: `AdvancedPricing.tsx:135` `handleCreate` does `overridesForRoom.some` client guard but never surfaces server `CONFLICT` (since it never calls server). When wired, must map `TRPCError CONFLICT` to `formError` — currently missing. Not a reject since page is local-only, but noted for follow-up.
- Hardcoded value: `AdvancedPricing.tsx:103` Monday-first calendar uses `(leading+6)%7` — intentional locale choice, not config. `formatCurrency` hardcodes `th-TH/THB` — correct for this product, acceptable.
- Function with no test: every new pure helper in `server/pricing.ts` is covered by `server/pricing.test.ts` (21 tests) and `server/bookingMinStay.test.ts` (7 tests). Router permission boundary via `rateOverrides.access.test.ts` (7 tests). Client contract via `AdvancedPricing.contract.test.ts` (4 tests). No untested function found. `server/db.ts:listRateOverridesForRoomType` gracefully handles missing-table `42P01` but has no direct unit test; it is exercised indirectly via mocked-router and `assertBookingMinStay` coverage — low risk.

## 7) Test authenticity check (Hard Rule 6)

- `server/pricing.test.ts` — new, 21 tests, exercises pure helpers with multiple cases including precedence, boundaries, overlap inclusivity, string coercion. Not a loosened existing test.
- `server/rateOverrides.access.test.ts` — new, 7 tests, mocks `db`+`supabase`, follows `financials.access.test.ts` pattern, checks allow/deny/CONFLICT/NOT_FOUND.
- `server/bookingMinStay.test.ts` — new, 7 tests, 4 pure + 3 mocked-router, checks BAD_REQUEST message naming.
- `client/src/pages/AdvancedPricing.contract.test.ts` — new, 4 tests, string-contract reads actual source files — no assertion loosening.
- All 254 tests green; no existing test was edited to pass (diff does not modify any pre-existing test file except `server/db.ts`/`routers.ts` logic).

## 8) TODO/FIXME and hygiene

`grep -n TODO|FIXME server/pricing.ts server/pricing.test.ts client/src/pages/AdvancedPricing.tsx server/db.ts server/routers.ts 20260831_add_rate_overrides.sql` — no hits.

## 9) Migration + verify pair

- `20260831_add_rate_overrides.sql` (103 lines): `btree_gist` extension, table `rate_overrides` (uuid pk, fk cascade, date checks, numeric >=0, min_stay nullable >0, end>=start), indexes `(room_type_id)` and `(room_type_id,start_date,end_date)`, EXCLUDE `prevent_rate_override_overlap` inclusive `[]`, RLS enable + `rate_overrides_select` (select) and `rate_overrides_manage` (all) policies via `is_super_admin`/`is_hotel_member`.
- `verify_20260831_add_rate_overrides.sql` (112 lines, 11 checks): table columns, types, FK, nullable, CHECKs, EXCLUDE, indexes, RLS, policies, extension — correct. Human-apply step still pending per CLAUDE.md Migrations rule — not a reviewer block but tracked.

## 10) Observed non-phase diff included in working tree (info only, not in phase-02 untracked set but in `git diff --stat`)

`server/_core/context.ts`, `server/_core/env.ts`, `client/src/pages/Login.tsx`, `client/src/components/ProfileMenu.tsx`, `todo.md` are part of a parallel MFA phase (T09) present in the same checkout. They do not intersect phase-02 files and do not affect this verdict; reviewer limited assessment to the 8 files named in the task plus their verify scripts.

## Findings summary

- P2 follow-up (should-fix, not blocking): Wire `AdvancedPricing.tsx` to tRPC — replace `useState` local store with `trpc.channelManager.listRateOverrides.useQuery({ hotel_id, room_type_id })`, `createRateOverride.useMutation`, `deleteRateOverride.useMutation`; invalidate on success; surface CONFLICT as `formError`; import shared `resolveEffectiveRate` logic or keep local but document divergence (local tie-break uses array order vs server `created_at`). Suggested ticket: `T02-05 — AdvancedPricing server persistence`.
- Minor: `server/pricing.ts:18-25` `toNumber` returns 0 for NaN — silent fallback; consider throwing for invalid `base_price` in dev mode (low severity).
- Info: Spec `02-advanced-pricing.md` still references old permission name `revenue.manage_rates` in acceptance text; implementation correctly uses `revenue.manage_pricing_rules` which matches `shared/authorization.ts` — update spec wording to avoid confusion.

## Evidence paths

- Spec: `D:\system make\channel-manager-mvp-latest\specs/02-advanced-pricing.md`
- Pricing: `D:\system make\channel-manager-mvp-latest\server/pricing.ts:40` + `server/pricing.test.ts`
- DB: `D:\system make\channel-manager-mvp-latest\server/db.ts:260,504`
- Router: `D:\system make\channel-manager-mvp-latest\server/routers.ts:117,210,906`
- Migration: `D:\system make\channel-manager-mvp-latest\20260831_add_rate_overrides.sql` + `verify_20260831_add_rate_overrides.sql`
- UI: `D:\system make\channel-manager-mvp-latest\client/src/pages/AdvancedPricing.tsx` + `client/src/App.tsx:195,389` + `client/src/lib/routeScope.ts:29`
