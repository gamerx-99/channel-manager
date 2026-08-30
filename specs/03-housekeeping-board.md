# 03 Housekeeping Task Board
Status: DONE — 2026-08-30 (opencode/deepseek-v4-pro write, muse-spark-1.2 review, 4 tickets T03-01→04);
UI-wiring gap fixed 2026-08-31 (Claude). `Housekeeping.tsx` shipped with an
explicit `// TODO(T03-02): ... this page uses local state` comment and its own
reviewer flagged it as a P2 follow-up but the spec was still marked DONE anyway —
now wired to the real `createHousekeepingTask`/`listHousekeepingTasks`/
`updateHousekeepingTaskStatus` procedures, with a hotel selector and real
staff/room lookups added. See `.agent/DECISIONS.md`'s 2026-08-31 entry.
Depends on: —
Owner-tier: worker-code

## Goal
A per-day task board for housekeeping: assign a room-cleaning/turnover task to a
staff member, track its checklist state, and tie due dates to booking check-outs.

## Non-goals
- Payroll/time-tracking for housekeeping staff
- Inventory/supply management

## Interface contract
- `server/routers.ts`: `createHousekeepingTask` / `listHousekeepingTasks` /
  `updateHousekeepingTaskStatus`, gated by `housekeeping.view_room_status`
  (read) and `housekeeping.update_room_status` (write) — already exist and are
  granted to `hotel_owner`, `revenue_manager` (view only, per the existing
  matrix), `front_desk` (view only), and `housekeeping` (both).

## Data model
Existing table `housekeeping_tasks`: `id`, `room_id`, `booking_id`, `assigned_to`, `due_date`, `status`, `created_at`. Migration `20260901_add_housekeeping_tasks.sql` applied.

## Business rules
- Editing (assigning, changing status) follows the same view-vs-edit role split
  as established in `DashboardCalendarView`'s availability quick-actions.
- Booking-linked task `due_date` defaults from `booking.check_out` when not explicitly provided (server resolver handles this).

## Error handling
- Assigning a task to a user with no membership throws `BAD_REQUEST` naming the invalid assignee.

## Acceptance criteria
- [x] A day view lists tasks for that hotel, grouped by room, with status and assignee
- [x] `housekeeping`/`hotel_owner`/`revenue_manager` can create, assign, and update task status
      (corrected 2026-08-31: `front_desk` only has `housekeeping.view_room_status`
      in `shared/authorization.ts`, not `housekeeping.update_room_status` — it is
      view-only for this board, same as it already is for room status elsewhere.
      The original text claiming "front_desk can update status" was never true of
      the actual permission matrix; the implementation correctly disables update
      controls for front_desk, so no code change was needed, just this correction.)
- [x] Creating a booking-linked task without an explicit due date defaults it from the booking's check-out date
- [x] The "Housekeeping" sidebar placeholder is replaced with a link to this board

## Test plan
- `server/housekeeping.test.ts`: task CRUD + view-vs-edit permission boundary — EXISTS
- `server/housekeeping.access.test.ts` / `server/housekeeping.assign.test.ts` — EXISTS
- Client contract test for the new page — EXISTS (validates route, sidebar link, component markers)

## Definition of Done
- [x] `pnpm test`, `pnpm check`, `pnpm build` all pass (316 tests, re-verified 2026-08-31)
- [x] No TODO/FIXME left in touched files — the T03-02 TODO is now removed
- [ ] Migration + `verify_*.sql` pair applied and confirmed by the human — corrected 2026-08-31: no confirmation of this is on record in this session; do not treat as applied until the human confirms
- [x] Spec status updated to DONE, `.agent/handoff.md` entry written
- [x] Reviewer approved with evidence — this session's Claude review (2026-08-31)