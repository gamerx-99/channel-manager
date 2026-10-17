-- Read-only verification for 20261017_ical_feed_token_rotation.sql.
-- Every row must read PASS. Run only after the owner applies the migration.

SELECT
  'no hotel still carries a derivable md5 token' AS check_name,
  CASE WHEN NOT EXISTS (
      -- The old backfill formula. If any row still matches it, the rotation
      -- did not run (or ran before this file).
      SELECT 1
      FROM public.ota_connections c
      JOIN public.hotels h ON h.id = c.hotel_id
      WHERE c.ical_feed_token = md5('ical-feed-token-v1:' || h.id::text)
    )
    THEN 'PASS' ELSE 'FAIL' END AS result

UNION ALL

SELECT
  'every connection has a token',
  CASE WHEN NOT EXISTS (
      SELECT 1 FROM public.ota_connections WHERE ical_feed_token IS NULL
    )
    THEN 'PASS' ELSE 'FAIL' END

UNION ALL

SELECT
  'every token is 64 hex chars (32 random bytes)',
  CASE WHEN NOT EXISTS (
      SELECT 1 FROM public.ota_connections
      WHERE ical_feed_token !~ '^[0-9a-f]{64}$'
    )
    THEN 'PASS' ELSE 'FAIL' END

UNION ALL

SELECT
  'all connections of a hotel still share one token',
  CASE WHEN NOT EXISTS (
      SELECT 1
      FROM public.ota_connections a
      JOIN public.ota_connections b
        ON a.hotel_id = b.hotel_id
       AND a.id <> b.id
       AND a.ical_feed_token IS DISTINCT FROM b.ical_feed_token
    )
    THEN 'PASS' ELSE 'FAIL' END

UNION ALL

SELECT
  'tokens are unique across hotels (not forked)',
  CASE WHEN (
      SELECT count(DISTINCT hotel_id) FROM (
        SELECT hotel_id, min(ical_feed_token) as token
        FROM public.ota_connections
        WHERE ical_feed_token IS NOT NULL
        GROUP BY hotel_id
      ) per_hotel
    ) = (
      SELECT count(DISTINCT ical_feed_token) FROM public.ota_connections
      WHERE ical_feed_token IS NOT NULL
    )
    THEN 'PASS' ELSE 'FAIL' END

ORDER BY check_name;

-- ===========================================================================
-- MANUAL TEST (owner-run)
-- ===========================================================================
-- After applying, copy the .ics URL from the OTA page for one hotel and fetch
-- it directly. Expected: 200 with a VCALENDAR body.
--
--   curl -i "<url from the OTA page>"
--
-- Then prove the OLD derivable token no longer works:
--
--   -- substitute the hotel id you are testing
--   curl -i "https://<app-domain>/api/ical/<HOTEL_UUID>.ics?token=$(printf 'ical-feed-token-v1:%s' <HOTEL_UUID> | md5sum | cut -d' ' -f1)"
--
-- EXPECTED: 404 / 401 (no calendar body). If it returns a calendar, the
-- rotation did not apply.
--
-- REMINDER: every OTA already holding a link now has a dead one. Re-send the
-- new URL from the OTA page before going live.
-- ===========================================================================