-- Adds the SlipOK branch ID column, missing from the original Phase 01 schema.
-- SlipOK's API requires TWO separate credentials, not one:
--   - branchId: identifies the SlipOK branch, sent as a URL path segment
--   - apiKey:   the secret, sent in the `x-authorization` header
-- (see https://slipok.com/api-document). hotel_payment_settings only ever
-- stored the encrypted apiKey, so server/slipVerification.ts had no branch ID
-- to call SlipOK with and never sent the header at all — real slip
-- verification would fail for every hotel. Branch ID is an identifier, not a
-- secret, so it's stored in plaintext (unlike slipok_key_enc) and safe to
-- read back to the settings UI.
-- Run in Supabase SQL editor. Verify with: verify_20260909_add_slipok_branch_id.sql

ALTER TABLE public.hotel_payment_settings
  ADD COLUMN IF NOT EXISTS slipok_branch_id text NULL;

COMMENT ON COLUMN public.hotel_payment_settings.slipok_branch_id IS
  'SlipOK branch identifier (from the SlipOK dashboard). Sent as a URL path segment on verify calls, alongside slipok_key_enc sent as the x-authorization header. Not secret — plaintext, unlike the API key.';
