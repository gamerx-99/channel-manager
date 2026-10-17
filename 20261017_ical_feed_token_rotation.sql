-- P1 SECURITY FIX: rotate iCal feed tokens off a derivable value.
-- Additive only; human applies in Supabase SQL editor (agent never runs live SQL).
-- Verify with: verify_20261017_ical_feed_token_rotation.sql
--
-- WHY THIS EXISTS
-- ---------------
-- 20261012 backfilled every hotel's `ical_feed_token` as
--     md5('ical-feed-token-v1:' || hotel.id::text)
-- with an ASSUMPTION that the value was "acceptable because this backfill runs
-- once per hotel". It is not acceptable: hotel.id is readable by anonymous
-- callers, so the token was not guessable, it was DERIVABLE:
--
--   1. read any published hotel's slug
--   2. get_public_hotel() returns its id (supabase_migration_production.sql:283)
--   3. compute md5('ical-feed-token-v1:' || id)
--   4. GET /api/ical/<id>.ics?token=<md5>  ->  the hotel's entire booking calendar
--
-- No brute force, no oracle, no rate limit. This migration replaces every
-- backfilled token with cryptographically random bytes.
--
-- OPERATIONAL NOTE — READ BEFORE APPLYING
-- --------------------------------------
-- This INVALIDATES every outbound .ics URL an OTA has already been given.
-- Each OTA must be re-sent its calendar URL after the owner copies the new
-- link from the OTA page. There is no way to keep the old URLs working and
-- remove the weakness at the same time: the old token is public knowledge.
-- The owner should apply this together with the link rotation in the OTA page.
--
-- `upsertOtaConnection` generates tokens as sha256(randomUUID()) for any
-- connection created after this migration, so only the backfilled rows are at
-- risk — but rotating everything is the only way to be sure no weak value
-- survives, including any hand-entered token.

begin;

-- Rotate every hotel's token to a fresh random value.
--
-- All rows of a hotel are updated in ONE statement to the SAME new token so the
-- single-token-per-hotel trigger (20261012:35-61) holds during the update. The
-- subquery derives one token per hotel via gen_random_bytes, which cannot be
-- derived by an attacker from any public value.
--
-- `is distinct from` is used rather than `is not null`, so hotels that have
-- connections but no token yet are filled in by the same statement.
--
-- Re-running always converges on a strong random token, but it invalidates the
-- links again — do not re-run casually.
update public.ota_connections target
set ical_feed_token = tokens.new_token
from (
  select h.id as hotel_id,
    encode(gen_random_bytes(32), 'hex') as new_token
  from public.hotels h
  where exists (
    select 1
    from public.ota_connections other
    where other.hotel_id = h.id
  )
) tokens
where target.hotel_id = tokens.hotel_id
  and target.ical_feed_token is distinct from tokens.new_token;

commit;

-- ===========================================================================
-- The application already mints strong tokens: upsertOtaConnection
-- (server/otaSync.ts:380) uses sha256(randomUUID()). This migration aligns the
-- historical rows with that rule. No app change required.
-- ===========================================================================