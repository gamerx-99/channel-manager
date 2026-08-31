-- Phase 12B: Verify payment flow migration
-- Run after 20260908_add_payment_flow.sql in Supabase SQL editor.
-- Every row should return PASS.

-- 1. hotel_payment_settings new columns
SELECT
  'hotel_payment_settings.promptpay_id exists' AS check_name,
  CASE WHEN COUNT(*) = 1 THEN 'PASS' ELSE 'FAIL' END AS result
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'hotel_payment_settings'
  AND column_name = 'promptpay_id'

UNION ALL

SELECT
  'hotel_payment_settings.payment_timeout_minutes exists',
  CASE WHEN COUNT(*) = 1 THEN 'PASS' ELSE 'FAIL' END
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'hotel_payment_settings'
  AND column_name = 'payment_timeout_minutes'

UNION ALL

-- 2. bookings.payment_status
SELECT
  'bookings.payment_status exists',
  CASE WHEN COUNT(*) = 1 THEN 'PASS' ELSE 'FAIL' END
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'bookings'
  AND column_name = 'payment_status'

UNION ALL

-- 3. payment_sessions table
SELECT
  'payment_sessions table exists',
  CASE WHEN to_regclass('public.payment_sessions') IS NOT NULL THEN 'PASS' ELSE 'FAIL' END

UNION ALL

-- 4. payment_sessions columns
SELECT
  'payment_sessions has required columns',
  CASE WHEN COUNT(*) = 9 THEN 'PASS' ELSE 'FAIL — got ' || COUNT(*) || ' columns' END
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'payment_sessions'
  AND column_name IN ('id','booking_id','hotel_id','amount','status','qr_reference','expires_at','verified_at','created_at')

UNION ALL

-- 5. RLS enabled on payment_sessions
SELECT
  'payment_sessions RLS enabled',
  CASE WHEN rowsecurity THEN 'PASS' ELSE 'FAIL' END
FROM pg_tables
WHERE schemaname = 'public' AND tablename = 'payment_sessions'

UNION ALL

-- 6. RLS policies exist
SELECT
  'payment_sessions has 3 RLS policies',
  CASE WHEN COUNT(*) >= 3 THEN 'PASS' ELSE 'FAIL — got ' || COUNT(*) END
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'payment_sessions'

UNION ALL

-- 7. Indexes exist
SELECT
  'payment_sessions indexes exist',
  CASE WHEN COUNT(*) >= 2 THEN 'PASS' ELSE 'FAIL' END
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename = 'payment_sessions'
  AND indexname IN ('idx_payment_sessions_booking_id','idx_payment_sessions_hotel_id')

ORDER BY check_name;
