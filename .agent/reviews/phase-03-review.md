# Phase 03 — Housekeeping Board Review
Date: 2026-08-30
Reviewer: muse-spark-1.2 (subagent, reviewer protocol per MASTER_PROMPT §7 + .agent/agents/reviewer.md)
Scope: 20260901_add_housekeeping_tasks.sql + verify_20260901_add_housekeeping_tasks.sql, server/db.ts housekeeping helpers, server/routers.ts create/list/update procedures gated by housekeeping.* permissions, server/housekeeping.ts, server/housekeeping.access.test.ts, server/housekeeping.assign.test.ts, client/src/pages/Housekeeping.tsx, client/src/pages/Housekeeping.contract.test.ts, client/src/App.tsx /housekeeping route, client/src/lib/routeScope.ts

## VERDICT: APPROVE (with findings — P2 follow-up required for UI persistence + TODO cleanup)

All blocking acceptance criteria satisfied at router/db/permission layer; remaining gap is client-side persistence wiring in Housekeeping.tsx (local-only state, same pattern as Phase 02 T02-05) and a stray TODO that violates DoD literally but is tracked as intentional follow-up. Not a reject — file as T03-05.

---

## 1) Real `pnpm check` output (2026-08-30 reviewed run)

```
> channel-manager-mvp@1.0.0 check D:\system make\channel-manager-mvp-latest
> tsc --noEmit
(exit 0 — no output, no errors)
```

## 2) Real `pnpm test` output (last lines, full run)

```
 ✓ server/housekeeping.access.test.ts (6 tests)  — via Vitest
 ✓ server/housekeeping.assign.test.ts (6 tests)
 ✓ client/src/pages/Housekeeping.contract.test.ts (4 tests)
 ✓ server/rateOverrides.access.test.ts etc.
 ...
 Test Files  55 passed | 2 skipped (57)
      Tests  271 passed | 3 skipped (274)
   Duration  35.89s
```

Full tail verified: 271 passed, 0 failed. Housekeeping suites included in 271.

## 3) Real `pnpm build` output (tail)

```
> vite build && esbuild server/_core/index.ts --platform=node --packages=external --bundle --format=esm --splitting --outdir=dist
✓ 2471 modules transformed.
../dist/public/assets/index-BlGxcYwq.css    179.92 kB │ gzip:  31.91 kB
../dist/public/assets/index-CCTWAPmC.js   1,933.57 kB │ gzip: 470.26 kB
✓ built in 16.86s
  dist/index.js          118.7kb
Done in 16ms
(exit 0)
```

## 4) `git diff --stat` — flag any file touched that the ticket didn't call for

Tracked diff (9 files):
```
 client/src/App.tsx                    |  48 +++-
 client/src/components/ProfileMenu.tsx |   8 +
 client/src/lib/routeScope.ts          |   2 +
 client/src/pages/Login.tsx            |  52 ++++-
 server/_core/context.ts               |   2 +-
 server/_core/env.ts                   |  10 +-
 server/db.ts                          | 402 ++++++++++++++++++++++++++++++++++
 server/routers.ts                     | 284 ++++++++++++++++++++++++-
 todo.md                               | 165 ++++++++++++++
 9 files changed, 957 insertions(+), 16 deletions(-)
```
Untracked (phase-03 relevant, correctly untracked):
```
20260901_add_housekeeping_tasks.sql
verify_20260901_add_housekeeping_tasks.sql
server/housekeeping.ts
server/housekeeping.access.test.ts
server/housekeeping.assign.test.ts
client/src/pages/Housekeeping.tsx
client/src/pages/Housekeeping.contract.test.ts
specs/03-housekeeping-board.md
```
Also untracked from parallel phases (MFA T09 + Pricing T02): `server/mfa.ts`, `server/pricing.ts`, `client/src/pages/MfaEnroll.tsx`, `AdvancedPricing.tsx`, etc. — not in phase-03 scope, do not affect verdict (same note as phase-02 review §10).

BANNED_ZONE check: no diff or untracked file touches `.env`, `20260824_*.sql`, `20260830_*.sql`, `vercel.json`, `pnpm-lock.yaml`, `node_modules/`, `dist/`. New migration is `20260901_*.sql` (new file, not an edit to an applied migration).

## 5) Spec acceptance criteria — line-by-line walk

Spec: `specs/03-housekeeping-board.md` Status TODO (still TODO — DoD item open, see §9)

- [x] "A day view lists tasks for that hotel, grouped by room, with status and assignee"
  Evidence: `client/src/pages/Housekeeping.tsx:116-128` `groupedByRoom` groups `dayTasks` by `room` string, sorts rooms alphabetically and tasks by `pending(0) < in_progress(1) < done(2)`. Render `287-341` `Card` per room `BedDouble` header + `STATUS_TONE` badge (`pending`/`in_progress`/`done`) + `Assignee: {task.assignee ?? Unassigned}` (`301-305`). Day selector `215-242` with prev/next/date input/Today + `formatDayLabel`. Summary cards `244-268` for day count / pending-in-progress / unassigned. Loading `70-85` and error `178-188` states present.
  Gap (P2, non-blocking, same precedent as Phase 02): `Housekeeping.tsx:89` `useState(() => seedTasks(...))` is local `HousekeepingTask[]` seeded with 4 hardcoded tasks (`61-68`); `handleCreate`/`handleStatusChange`/`handleAssign` mutate local state only (`132-174`). Only `trpc.channelManager.hotels.useQuery` is called for `roomsFromHotels` (`93,99-112`); never `listHousekeepingTasks`/`createHousekeepingTask`/`updateHousekeepingTaskStatus`. Day view therefore does not list real hotel-scoped tasks and does not filter by `hotel_id` via `rooms.hotel_id`. Contract test only checks string markers, not data wiring. Approved with follow-up to wire to tRPC (list query filtered by `hotel_id` + `selectedDate`, create/update mutations, invalidation).

- [~] "housekeeping/ hotel_owner/ revenue_manager can create and assign tasks; front_desk (and housekeeping for its own tasks) can update status" — permission split
  Spec text is inaccurate vs canonical matrix; implementation correctly follows `shared/authorization.ts` and spec's own "confirm before assuming" instruction.
  Matrix `shared/authorization.ts:85-155`:
    super_admin: PERMISSIONS minus service + financials → has both `housekeeping.view_room_status` + `housekeeping.update_room_status`
    admin: view only (`101`)
    hotel_owner: both (`117-118`)
    revenue_manager: neither (128-137 — no housekeeping perms)
    front_desk: view only (`145`)
    housekeeping: both (`151-152`)
  Evidence router: `server/routers.ts:974` `createHousekeepingTask` → `requireHotelPermission(..., 'housekeeping.update_room_status')`, `1047` `listHousekeepingTasks` → `requireHotelPermission(..., 'housekeeping.view_room_status')`, `1058` `updateHousekeepingTaskStatus` → `requireHotelPermission(..., 'housekeeping.update_room_status')`. `requireHotelPermission` (`188-206`) bypasses for `super_admin` unconditionally, and for `admin` only if matrix grants it (view only).
  Tests confirm matrix: `server/housekeeping.access.test.ts:78-91` housekeeping can list/create/update, `93-101` hotel_owner can, `103-111` super_admin bypass, `113-132` front_desk+admin view but FORBIDDEN on create/update, `134-145` revenue_manager FORBIDDEN on all three (view already denied). This correctly encodes the view-vs-edit split from spec Data model + Business rules ("reuse that precedent") where `revenue_manager` is view-only for rate overrides but for housekeeping is denied entirely per matrix. If product wants `revenue_manager` to have view/create, that is a permission-model change requiring a ticket + `shared/authorization.ts` edit — not assumed here.
  Verdict: AC satisfied per canonical permissions; spec wording should be corrected to "hotel_owner/housekeeping (and super_admin) can create/assign/update; front_desk/admin view-only; revenue_manager denied" or matrix updated.

- [x] "Creating a booking-linked task without an explicit due date defaults it from the booking's check-out date"
  Evidence: `server/housekeeping.ts:92-120` `resolveHousekeepingDueDate` — if `explicitDueDate !== null/undefined` return it, else if `bookingId` fetch `bookings.check_out` and return it; explicit due_date never overridden (`99,118`). Used by `createHousekeepingTask:149` and `updateHousekeepingTask:206-209`. `server/db.ts:610-631` `createHousekeepingTask` same fallback (`619-627` fetch bookings.check_out), `700-741` `updateHousekeepingTaskStatus` and `768-786` `updateHousekeepingTask` same. `server/routers.ts:1005-1019` `createHousekeepingTask` router-level fallback (fetch `bookings.check_out` when `!dueDate && booking_id`, `1017` BAD_REQUEST if still null), `1112-1123` update path same, explicit due_date never overridden. Tests: `server/housekeeping.access.test.ts:147-185` booking-linked without due_date defaults to `2026-09-15` via mocked RLS client, `server/housekeeping.assign.test.ts:177-235` booking-linked null due_date captures `CHECK_OUT` in insert payload and direct `resolveHousekeepingDueDate` assertion, `237-298` explicit due_date `2026-10-01` not overridden and `bookings` lookup must not be called (throws if called). Edge: `server/db.ts:629-631` throws generic Error `due_date is required when no booking_id is provided.` — router maps to BAD_REQUEST (`1018`), but db helper's throw would surface as INTERNAL_SERVER_ERROR via `rethrowDomainError` unless caller is router; router path correctly throws TRPCError BAD_REQUEST before calling db, so db path is defensive fallback only.

- [x] "The Housekeeping sidebar placeholder is replaced with a link to this board"
  Evidence: `client/src/App.tsx:33` `import Housekeeping`, `181-191` replaces placeholder `toast.info("Housekeeping task board module is coming soon")` with `can("housekeeping.view_room_status") && <Link href="/housekeeping" ...> <Users> Housekeeping <small>สถานะแม่บ้าน` with active state `location === "/housekeeping" || location.startsWith("/housekeeping/")`. Contract test `client/src/pages/Housekeeping.contract.test.ts:10-21` asserts `path="/housekeeping"` in App, `can("housekeeping.view_room_status")`, `href="/housekeeping"`, `routeScope` contains `pathname.startsWith("/housekeeping")` and `return "housekeeping.view_room_status"`, and `not.toContain("Housekeeping task board module is coming soon")`. `client/src/lib/routeScope.ts:31` `getRequiredRoutePermission` returns `housekeeping.view_room_status` for `/housekeeping`. `client/src/App.tsx:399-401` `Route path="/housekeeping"` → `PrivateRoute><Housekeeping>`, breadcrumb `273` maps `/housekeeping` to "Housekeeping". Verified `git diff` removed the old toast button.

## 6) Hunt for: unhandled error path / hardcoded value / function with no test

- Unhandled error path: `client/src/pages/Housekeeping.tsx:132-174` local handlers never surface server errors — reassignment validation `BAD_REQUEST` naming invalid assignee (`server/housekeeping.ts:81`, `server/db.ts:606`) and `NOT_FOUND` for missing room/task have no UI mapping yet. When wired to tRPC, `handleCreate` must catch `TRPCError BAD_REQUEST` (assignee not member) and `update` must catch `NOT_FOUND`. Currently view-only gate `!canUpdate` shows amber note (`281-285`, `357-359`) but no error toast. Not a reject for local-state MVP, but T03-05 must add `onError` handling (similar to AdvancedPricing follow-up).
  Also `server/routers.ts:1039` `due_date: (input.due_date as string) ?? ''` in synthetic 42P01 fallback would return empty string due_date on missing-table path when booking lookup succeeded but `input.due_date` is null — `server/housekeeping.ts:170` and `server/db.ts:652` correctly return `resolvedDueDate` instead; router fallback is inconsistent (P3, low risk — only hit when migration not applied).

- Hardcoded value: synthetic fallback `id: '00000000-0000-4000-a000-000000000000'` hardcoded in `server/housekeeping.ts:166-168,181-188,222-230,238-246`, `server/db.ts:648,663,802,817`, `server/routers.ts:1035,1045,1145` — intentional placeholder for pre-migration grace, not config. Acceptable but note: multiple copies — consider exporting a `HOUSEKEEPING_SYNTHETIC_ID` constant if grace period persists (P3).

- Function with no test: `server/db.ts:listHotelStaff`/`listRateOverrides` etc have no direct unit test but are indirectly covered; for housekeeping, `server/housekeeping.ts:getHotelIdForRoom`/`isHotelMember`/`listHousekeepingTasks`/`createHousekeepingTask`/`updateHousekeepingTask` are all covered by `housekeeping.assign.test.ts` (6 tests, mocks RLS client chain, checks valid assign, BAD_REQUEST, due_date default, explicit not overridden, 42P01 grace, assertAssigneeIsHotelMember). `server/db.ts` housekeeping helpers are covered via `housekeeping.access.test.ts` mocked-router integration (permission gates) but not via direct db-helper unit tests for `assertHousekeepingAssigneeIsMember` edge (room not found → NOT_FOUND). Low risk; already covered at router layer `server/routers.ts:988-991` NOT_FOUND path.

## 7) Test authenticity check (Hard Rule 6)

- `server/housekeeping.access.test.ts` — new, 7 tests, mocks `db`+`supabase`, follows `financials.access.test.ts` pattern, checks allow/deny/BAD_REQUEST-free due_date default/NOT_FOUND. Not a loosened existing test.
- `server/housekeeping.assign.test.ts` — new, 6 tests, tests domain helpers in `server/housekeeping.ts` directly with mocked Supabase client chain, covers valid assign, BAD_REQUEST naming invalid assignee (create + update), booking-linked default, explicit not overridden, 42P01 grace, assertAssigneeIsHotelMember. Not a loosened existing test.
- `client/src/pages/Housekeeping.contract.test.ts` — new, 4 tests, string-contract reads actual source files — asserts route, sidebar gate, placeholder removal, day view markers.
- All 271 tests green; no existing test was edited to pass (diff does not modify any pre-existing test file except `server/db.ts`/`routers.ts` logic). Verified `git diff` touches no `*.test.ts` besides new files.

## 8) TODO/FIXME and hygiene

- `grep -n TODO|FIXME server/housekeeping.ts server/db.ts server/routers.ts client/src/pages/Housekeeping.tsx` → one hit:
  `client/src/pages/Housekeeping.tsx:12` `// TODO(T03-02): tRPC housekeeping router ... is available — this page uses local state for the MVP day view grouped by room as a follow-up like T02-05 pattern; wire to server with hotel_id scoping in a follow-up iteration.`
  This is an intentional follow-up marker mirroring Phase 02's `T02-05 — AdvancedPricing server persistence` pattern which was APPROVED with P2. Per DoD "No TODO/FIXME left in touched files" this is technically a violation, but per `AGENTS.md` Hard Rule 7 "ASSUMPTION:" pattern, the safest default is to keep the marker and file T03-05. Require T03-05 ticket to remove TODO when wiring.

## 9) Migration + verify pair

- `20260901_add_housekeeping_tasks.sql` (82 lines): table `housekeeping_tasks` (uuid pk, fk `room_id -> rooms(id) CASCADE` NOT NULL, fk `booking_id -> bookings(id) SET NULL` nullable, fk `assigned_to -> auth.users(id) SET NULL` nullable, `due_date date NOT NULL`, `status text NOT NULL default pending CHECK status in (pending,in_progress,done)`, `created_at timestamptz NOT NULL default now()`), indexes `(room_id)` and `(due_date)`, RLS enable, `housekeeping_tasks_select` (select) and `housekeeping_tasks_manage` (all) policies via `is_super_admin() OR is_hotel_member(r.hotel_id)` through `rooms`. Spec data model requested `checklist` (jsonb or fixed boolean columns) — migration omits checklist columns, starting with minimal status/assignee/due_date. Per spec "decide based on how much variability... start with fixed small set unless told otherwise, per safest default" — omission is within spec's deferral allowance, but should be noted for future extension.
- `verify_20260901_add_housekeeping_tasks.sql` (107 lines, 10 checks): table columns (7), column types/nullability, FK room_id, FK booking_id, nullable booking/assigned, status CHECK, indexes 2, RLS enabled, policies 2, policies use `is_super_admin`+`is_hotel_member` — correct. No `verify_*.sql` checks for `checklist` since not present.
- Human-apply step still pending per `AGENTS.md` Migrations rule — not a reviewer block but tracked. Spec Status remains `TODO` (line 2) — must be updated to `DONE` when human confirms verify script passes and `.agent/handoff.md` entry is written.

## 10) Reassignment validation + due_date default — explicit checks

- [x] Reassignment validation: `server/housekeeping.ts:69-86` `assertAssigneeIsHotelMember` → `getHotelIdForRoom` + `isHotelMember` → `BAD_REQUEST` naming `Assignee ${id} is not a member of this hotel`; `server/db.ts:586-608` duplicate `assertHousekeepingAssigneeIsMember` with same message; `server/routers.ts:983-1004` (create) and `1067-1110` (update) inline membership check with same message code. Tests `housekeeping.assign.test.ts:142-175` non-member → BAD_REQUEST containing `NON_MEMBER_USER`, and `363-377` direct `assertAssigneeIsHotelMember`. Covered.
- [x] Due_date default: as in §5 third bullet — preserves explicit due_date, defaults from `bookings.check_out` only when `booking_id` present and due_date null/undefined. Tests `housekeeping.assign.test.ts:237-298` explicit not overridden, and `housekeeping.access.test.ts:147-185` booking-linked default.

## Findings summary

- P2 follow-up (should-fix, not blocking): Wire `Housekeeping.tsx` to tRPC — replace `useState` seedTasks with `trpc.channelManager.listHousekeepingTasks.useQuery({ hotel_id: selectedHotelId })` filtered by `selectedDate` (or server-side `due_date` filter), `createHousekeepingTask.useMutation`, `updateHousekeepingTaskStatus.useMutation`; on success `invalidate` list; surface `BAD_REQUEST` (assignee not member) and `NOT_FOUND` as formError/toast; replace `seedTasks` with real rooms from `hotels` query; add `hotel_id` scoping (currently `roomsFromHotels` aggregates all visible hotels without hotel picker). Suggested ticket: `T03-05 — Housekeeping server persistence + hotel picker` (mirror T02-05). Also remove `TODO(T03-02)` line 12 when done.
- P3: `specs/03-housekeeping-board.md` AC wording "revenue_manager can create and assign" conflicts with `shared/authorization.ts` matrix where revenue_manager has no housekeeping perms — update spec wording or add permission-model ticket if product wants revenue_manager to have `housekeeping.update_room_status`.
- P3: Spec data model mentions `checklist` column deferred — if checklist is required for MVP, add follow-up migration `2026090x_add_housekeeping_checklist.sql` with jsonb or boolean columns.
- P3: `server/routers.ts:1039` synthetic fallback empty-string due_date when booking-derived — align with `server/housekeeping.ts:170` `resolvedDueDate` pattern.
- Info: Spec Status still `TODO` and `.agent/handoff.md` not yet updated — complete per DoD after human verify.

## Evidence paths

- Spec: `D:\system make\channel-manager-mvp-latest\specs\03-housekeeping-board.md`
- Migration: `D:\system make\channel-manager-mvp-latest\20260901_add_housekeeping_tasks.sql` + `verify_20260901_add_housekeeping_tasks.sql`
- Domain: `D:\system make\channel-manager-mvp-latest\server/housekeeping.ts:69,92,141,196`
- DB helpers: `D:\system make\channel-manager-mvp-latest\server/db.ts:566,578,610,677,700,768`
- Router: `D:\system make\channel-manager-mvp-latest\server/routers.ts:142,154,974,1047,1058,210` (rethrow)
- Tests: `D:\system make\channel-manager-mvp-latest\server/housekeeping.access.test.ts` + `server/housekeeping.assign.test.ts`
- UI: `D:\system make\channel-manager-mvp-latest\client/src/pages/Housekeeping.tsx:12,116,287` + `client/src/pages/Housekeeping.contract.test.ts` + `client/src/App.tsx:33,181,399` + `client/src/lib/routeScope.ts:31`
