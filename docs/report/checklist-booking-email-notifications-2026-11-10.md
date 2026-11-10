# Checklist — Booking email notifications (2026-11-10)

BASE: `fd86d6345a8b8c39c80ef7f5352fe8fce81bc0e9`

## TODO
- [x] T1 Persist booking guest email and hotel notification email settings, including migration. Evidence: `drizzle/d1-schema.ts:44-52,242-279`, `drizzle/d1/20261110000000_staff_invite_booking_email_schema.sql`; still needs human application.
- [x] T2 Send a booking-received notice to guest and hotel with current booking details and correct non-confirmation wording. Evidence: `server/d1/booking.ts:298-301,339-367`; `server/d1/bookingEmails.ts:54-87`.
- [x] T3 Notify only the hotel when a submitted slip remains pending review. Evidence: `server/routers/paymentRouter.ts:257-271`; `server/d1/booking.ts:354-355`.
- [x] T4 Send customer + hotel confirmation only after a successful transition to `confirmed` and verified payment. Evidence: `server/routers/paymentRouter.ts:305-312,384-394`; combined conditional status/payment update.
- [x] T5 Make booking email events idempotent across repeated processing and Worker restarts. Evidence: `server/d1/bookingEmails.ts:170-172`; `server/d1/bookingEmails.test.ts` restart and concurrency cases.
- [x] T6 Add focused tests for rendering, recipients, status boundaries, deduplication, guest access and hotel email configuration. Evidence: `server/d1/bookingEmails.test.ts`, `server/d1/booking.test.ts`, `server/payment.verifySlip.test.ts`, `server/paymentRouter.guestBooking.test.ts`, `server/d1/hotel.test.ts`.
- [x] T7 Run scoped tests, `pnpm test`, `pnpm check`, and `pnpm build`; record real output. See report `docs/report/booking-email-notifications-2026-11-11.md`.
- [x] T8 Write handoff and report; copy report into `claude/`. Evidence: `.agent/handoff.md`, `docs/report/booking-email-notifications-2026-11-11.md`, `claude/booking-email-notifications-2026-11-11.md`.
- [x] T9 Record acceptance and migration status in `specs/21-booking-email-notifications.md` and index it in `specs/00-OVERVIEW.md`.

## FOUND
- [x] F1 Existing uncommitted edits include separate staff-invite/support changes; preserved and excluded from this scope.
- [x] F2 Initial partial implementation used process-memory dedupe and did not pass Worker mail configuration; replaced by durable D1 keys and required Worker transport injection.

## DONE
- T1–T9 are complete in code/docs with evidence above; reviewer verdict is APPROVE. Release remains blocked on human review/application/verification of the migration.

## Release blocker
- The migration is not applied to staging or production. A human must apply and verify it before this ticket/spec can be marked DONE or deployed.
