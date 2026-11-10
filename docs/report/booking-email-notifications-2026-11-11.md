# Booking email notifications — implementation report

**Status:** Implemented and locally verified; **release blocked** pending owner decisions/configuration and human migration application.

## 1. Author, reviewer, base and head
- Author: GPT-6 Luna (OpenCode coding agent).
- Reviewer: `general` read-only reviewer; **APPROVE**.
- BASE: `fd86d6345a8b8c39c80ef7f5352fe8fce81bc0e9`.
- HEAD: `fd86d6345a8b8c39c80ef7f5352fe8fce81bc0e9` (no commit created).

## 2. Scope
- **FILES:** booking email templates and event sender; booking/payment/hotel routers and D1 repositories; Worker context/config; hotel profile and guest booking page; translations and focused tests; D1 schema/migration metadata; `specs/21-booking-email-notifications.md`, overview index, open question, checklist and handoff.
- **TOUCHES:** `booking_email_events`, `bookings.guest_email`, `hotels.notification_email`, Booking `status` and `payment_status`, Worker `RESEND_API_KEY`/`EMAIL_FROM`/`PUBLIC_APP_URL` inputs.
- **RISK:** high (payment-state transitions, D1 migration and guest-facing public data).
- Separate in-progress staff-invite/support work and `shared/roomAmenities.adversarial.test.ts` were preserved and excluded from this feature review. The pending migration contains the pre-existing `verification.cancelled_at` change too; see release blocker below.

## 3. Checklist summary
- TODO: 9 total — all 9 implementation/documentation items complete; final reviewer verdict is APPROVE.
- FOUND: 2 recorded — F1 unrelated staged changes preserved; F2 initial in-memory-only email dedupe / missing Worker transport wiring replaced in this implementation.
- DONE: T1–T9, with evidence in `docs/report/checklist-booking-email-notifications-2026-11-10.md`.

## 4. Evidence
- Scoped tracked-file diff: `git diff --stat -- <scope files>` → 26 files changed, 351 insertions(+), 44 deletions(-). Newly added scoped files (not included by `git diff --stat` until tracked): `client/src/pages/GuestBooking.tsx`, `client/src/pages/GuestBooking.contract.test.ts`, `server/appUrl.ts`, `server/appUrl.test.ts`, `server/d1/bookingEmails.ts`, `server/d1/bookingEmails.test.ts`, `server/paymentRouter.guestBooking.test.ts`, the timestamped migration and matching snapshot, and `specs/21-booking-email-notifications.md`.
- `pnpm check` → exit 0 (`tsc --noEmit`).
- `pnpm test` → exit 0; **227 test files passed, 1,601 tests passed**.
- `pnpm build` → exit 0; Vite build and Wrangler `--dry-run` completed. Existing large-chunk warning remains; Wrangler also warns that the multi-environment config has no target env in this dry-run.
- `pnpm exec drizzle-kit generate --config drizzle.d1.config.ts` → `No schema changes, nothing to migrate` after the new migration/snapshot were registered.
- `git diff --check` → exit 0.
- No deploy, remote D1 command, secret change or migration application was run.

## 5. Implementation and remaining unknowns
- Booking-received messages reload persisted booking data and clearly state that they are not confirmations. Guest and hotel links lead to the public booking/payment page and hotel booking list respectively.
- A hotel-only review notice is sent only when the SlipOK flow leaves a booking for staff review. SlipOK success and staff approval send guest + hotel confirmation only after a conditional write sets both `confirmed` and `payment_status = verified`.
- Durable unique D1 event keys prevent duplicate sends across Worker restarts/concurrent processing. Delivery is best-effort; failed attempts are recorded and are not automatically retried, to avoid duplicate delivery.
- The Worker now refuses to use the mock mail sender when `RESEND_API_KEY` is missing. Production must have the Resend secret and the hotel must configure a notification email (legacy `owner_contact` is used only if it looks like an email).
- Owner decisions still open: whether guest email is mandatory, and whether the booking UUID may be used as the bearer credential in the public detail link. Both assumptions are in `.agent/OPEN_QUESTIONS.md` and the guest-link access is rate-limited and restricted to published hotels.

## 6. Release blocker and next steps
1. A human reviews the pending migration `drizzle/d1/20261110000000_staff_invite_booking_email_schema.sql`. It also adds the already-staged staff-invite `verification.cancelled_at` field; confirm the adjacent invite work before applying.
2. Human applies/verifies the migration on staging, configures `RESEND_API_KEY` / `EMAIL_FROM` and (if desired) `PUBLIC_APP_URL`, then tests one booking-received, one manual-review and one confirmed path in staging.
3. Owner answers the two open questions. Only then update the spec status to DONE and consider deployment with explicit approval.

**Reviewer verdict:** APPROVE. Non-blocking coverage note: the test suite does not inject a status-log failure after a confirmed write; the notice is deliberately attempted before that audit insert. Migration application and the two documented owner decisions remain release gates.
