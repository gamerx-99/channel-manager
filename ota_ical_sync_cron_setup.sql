-- Scheduled iCal sync: Supabase pg_cron calls the app's cron endpoint every 15 minutes.
-- NOT a numbered migration: it is environment-specific and run once by hand in the
-- Supabase SQL editor, after 20261026_ota_ical_room_sync.sql has been applied and the
-- app (with CRON_SECRET and SUPABASE_SERVICE_ROLE_KEY set in Vercel) is deployed.
--
-- Why 15 minutes: Booking.com / Airbnb only refresh their own iCal exports and pull
-- ours every 1-3 hours, so polling faster adds load (and rate-limit risk) without
-- making data fresher. To change it, edit the schedule below and re-run the
-- cron.schedule statement (same job name replaces the old schedule).

-- 1. Extensions (no-ops if already enabled; can also be enabled under Database > Extensions).
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- 2. Store the shared secret in Vault ONCE. Use the same value as CRON_SECRET in Vercel.
--    Replace the placeholder, run this single statement, and do not commit the real value.
-- SELECT vault.create_secret('<paste the CRON_SECRET value here>', 'ota_ical_cron_secret');

-- 3. Schedule the job. Replace the URL if the production domain differs.
SELECT cron.schedule(
  'ota-ical-sync',
  '*/15 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://channel-manager-seven-blue.vercel.app/api/cron/ota-ical-sync',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (
        SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'ota_ical_cron_secret'
      )
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
  $$
);

-- 4. Check it (read-only):
-- SELECT jobname, schedule, active FROM cron.job WHERE jobname = 'ota-ical-sync';
-- SELECT status_code, left(content::text, 300), created FROM net._http_response ORDER BY created DESC LIMIT 5;

-- To stop the schedule: SELECT cron.unschedule('ota-ical-sync');
