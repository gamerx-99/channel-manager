# T03-02 — Housekeeping table + tRPC router
Status: TODO
Owner: worker-code
Spec: specs/03-housekeeping-board.md
Depends: T03-01
# Goal: Create migration YYYYMMDD_add_housekeeping_tasks.sql + verify_*.sql for housekeeping_tasks (id, room_id FK, booking_id nullable FK, assigned_to nullable FK, due_date, status pending/in_progress/done, created_at) + RLS + indexes. Wire server/db.ts helpers and server/routers.ts procedures: createHousekeepingTask / listHousekeepingTasks / updateHousekeepingTaskStatus gated by housekeeping.view_room_status (read) and housekeeping.update_room_status (write). Handle due_date default from booking check_out when booking_id given without due_date. Add server/housekeeping.access.test.ts mocked-router role-boundary test.
# DoD: pnpm check/test/build pass, no TODO, migration pair exists.
