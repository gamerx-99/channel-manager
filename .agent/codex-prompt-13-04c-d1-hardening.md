# Codex Prompt — Phase 2: D1 booking_nights hardening (13-04c)

Working directory: C:\WORK\channel-manager-c, branch agent-c/d1-schema.

Goal: Prevent double-booking at the DB level using a booking_nights table with UNIQUE(room_id, night), and separate SlipOK secret reads.

Tasks:
1. Add `booking_nights(room_id, night, booking_id)` table to drizzle/d1-schema.ts with UNIQUE(room_id, night).
2. Create a SQL migration file with backfill (INSERT, not OR IGNORE) to detect existing overlaps.
3. In every booking write path (hold, direct, staff create, expiry, checkout, cancel, iCal sync insert/update/revive/delete), maintain booking_nights rows. Clear expired holds first in each D1 batch.
4. Order booking_nights writes last in D1 batches to preserve changes()=1 checks.
5. iCal conflicts: count as conflict, try next room, don't abort sync.
6. Split getHotelPaymentConfig (no secret) from getSlipOkCredentialsForVerification (secret only for verifySlip).
7. Add tests: 8 booking_nights scenarios + paymentRouter secret leak sweep.

Constraints: no push, no .env changes, run pnpm check/test/build.
Acceptance: pnpm test green (except known credential-env failures).
