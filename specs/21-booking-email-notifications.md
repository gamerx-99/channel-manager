# 21 Booking email notifications
Status: IN PROGRESS — code verified locally; migration must be applied by a human before this ticket can close.

## Acceptance criteria
- A completed direct booking sends guest and hotel a booking-received email with the persisted hotel, booking reference, dates, room type, amount due, current status, and a relevant link. It must clearly say the notice is not a confirmation.
- When a slip remains in `pending_verification` for staff review, send only a review notice to the hotel. Do not confirm the guest at this point.
- Send a booking-confirmed email to the guest and hotel only after a successful transition to `confirmed` and verified payment, including SlipOK approval and staff manual approval.
- Failed/rejected slips and bookings still awaiting review do not send guest confirmation.
- Reprocessing the same notification event, including after a Worker restart, does not send the same email twice.
- A guest must supply an email address for direct booking notices. A hotel can configure its booking-notification address in its profile.
- The guest detail link opens the current booking summary and, while payment is pending, allows the guest to continue payment.

## Operational notes
- Email delivery is best-effort and does not roll back a persisted booking transition. Failed event claims can be cleared and retried; sent events remain blocked by their durable unique key. A crash that leaves an event in `sending` is not automatically retried because the provider may already have accepted it.
- Migration: `drizzle/d1/20261110000000_staff_invite_booking_email_schema.sql`. It is not applied to staging or production by the agent. A human must apply and verify it before marking this spec DONE.
- That pending migration also carries the already-staged staff-invite `verification.cancelled_at` column; review that adjacent invite work before applying the combined migration.
- Customer-email requirement is an ASSUMPTION pending owner confirmation; see `.agent/OPEN_QUESTIONS.md`.
