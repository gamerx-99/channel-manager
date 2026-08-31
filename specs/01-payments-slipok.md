# 01 Payments — per-hotel SlipOK slip verification
Status: PARTIAL — Settings infrastructure done (MFA gate, encryption, migration, UI); verifySlip booking mutation pending.
Depends on: 09-authenticator-mfa (DONE)
Owner-tier: worker-code

## Goal
Let each hotel verify guest bank-transfer/PromptPay payment slips using their own SlipOK API key, and track which bookings have a verified payment against them — without the platform touching real money, cards, or a central payment gateway.

## Non-goals
- Card/PromptPay checkout (that's Phase E, and depends on this phase existing first)
- Refunds
- KBank's own corporate API (revisit only once a hotel's real slip volume clears their ≥300/month threshold)
- Any central platform payment gateway — explicitly rejected, see `.agent/DECISIONS.md`'s 2026-08-30 entry

## Blocking questions — NEEDS HUMAN CONFIRMATION (not actually resolved)
The opencode/deepseek loop recorded these as "RESOLVED" and cited a "user decision,"
but there is no record of the human confirming either answer in this session. Treat
both as proposals to confirm before implementation starts, not settled decisions:
1. **Encryption approach (proposed, unconfirmed):** App-level encryption (AES-256 in
   Postgres w/ DEK, stored hash for dedup, QR Prompay test flow)
2. **Settings page permission (proposed, unconfirmed):** `property.manage_profile` —
   already exists in `shared/authorization.ts`, so reusing it is low-risk if confirmed

## Interface contract
- `server/routers.ts`: `saveSlipOkSettings(hotel_id, api_key)` — mutation, gated on `property.manage_profile` + MFA step-up (Phase 09)
- `server/routers.ts`: `verifySlip(hotel_id, booking_id, slipData)` — mutation, calls SlipOK API with stored key, on success updates booking's `payment_status`
- `server/routers.ts`: `getSlipOkSettings(hotel_id)` — query, returns only whether key is configured (never raw key)

## Data model
- `hotel_payment_settings` table: `hotel_id` (FK, unique), `slipok_api_key_hash`, `slipok_enabled` (bool), `created_at`, `updated_at`
- Bookings: add `payment_status` (`unpaid` | `verified` | `pending`) and `amount_paid` (numeric)

## Business rules
- A hotel with no SlipOK key configured simply doesn't get the "verify slip" action in the UI
- `verifySlip` must be idempotent — check SlipOK's transaction reference before counting payment
- **MFA step-up required:** opening/saving settings requires fresh MFA verification (Phase 09), for every role including `hotel_owner`

## Error handling
- SlipOK API failure → clear client error, booking's `payment_status` unchanged
- Invalid/expired key → surface distinctly from "slip didn't match"

## Acceptance criteria
- [x] Opening or saving SlipOK settings requires a fresh MFA verification (Phase 09)
      — `requireRecentMfaVerification` enforced in all three slipok.* router procedures
- [x] Hotel owner can enter and save a SlipOK API key; it is never echoed back in
      plaintext — AES-256-GCM encryption in `server/slipokCrypto.ts`, only `configured: bool` returned
- [ ] Hotel owner can submit a slip for a booking; on success, the booking's payment status updates
      — `verifySlip` procedure not yet implemented
- [ ] A failed verification leaves the booking's payment status unchanged and shows a clear error
- [x] `super_admin` can also configure/verify (via `requireHotelPermission`'s normal bypass)
- [ ] Financials page gets "collected vs outstanding" breakdown once `payment_status` exists

## Test plan
- `server/slipOkSettings.test.ts`: unit test the settings save/read path, confirm key is never returned in plaintext
- `server/slipVerification.test.ts`: mock the SlipOK call, cover success/failure/invalid-key paths
- Client contract test for the settings page route + MFA step-up verification

## Definition of Done
- [x] `pnpm test` passes (344 passed)
- [x] `pnpm check` + `pnpm build` pass
- [x] No TODO/FIXME left in touched files
- [x] Migration + `verify_*.sql` pair written and human-applied (`PHASE10_ONESHOT_APPLY_AND_VERIFY.sql`)
- [ ] Spec status updated to DONE, `.agent/handoff.md` entry written
- [ ] Reviewer approved with evidence