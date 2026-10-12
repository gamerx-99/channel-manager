# T03-03 — Housekeeping assign validation + due_date from booking
Status: TODO
Owner: worker-code
Spec: specs/03-housekeeping-board.md
Depends: T03-02
# Goal: Enforce assigning to user with hotel membership only (BAD_REQUEST via rethrowDomainError), and auto-populate due_date from booking.check_out when creating booking-linked task without explicit due_date. Add server/housekeeping.assign.test.ts covering valid assign, non-member assign -> BAD_REQUEST, booking-linked default due_date, explicit due_date override.
# DoD: pnpm check/test/build pass
