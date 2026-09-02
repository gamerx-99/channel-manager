-- Booking Lifecycle v1, Sub-phase A: Verify migration
-- Run after 20260910_booking_lifecycle_v1.sql in Supabase SQL editor.
-- Every row should return PASS.

-- 1. bookings.status accepts the new lifecycle values
SELECT
  'bookings.status check constraint has 11 allowed values' AS check_name,
  CASE WHEN pg_get_constraintdef(oid) LIKE '%held%'
        AND pg_get_constraintdef(oid) LIKE '%pending_payment%'
        AND pg_get_constraintdef(oid) LIKE '%pending_verification%'
        AND pg_get_constraintdef(oid) LIKE '%expired%'
        AND pg_get_constraintdef(oid) LIKE '%payment_rejected%'
        AND pg_get_constraintdef(oid) LIKE '%refund_pending%'
        AND pg_get_constraintdef(oid) LIKE '%refunded%'
       THEN 'PASS' ELSE 'FAIL' END AS result
FROM pg_constraint
WHERE conname = 'bookings_status_check' AND conrelid = 'public.bookings'::regclass

UNION ALL

-- 2. bookings new columns
SELECT
  'bookings.expires_at exists',
  CASE WHEN COUNT(*) = 1 THEN 'PASS' ELSE 'FAIL' END
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'bookings' AND column_name = 'expires_at'

UNION ALL

SELECT
  'bookings.payment_method exists',
  CASE WHEN COUNT(*) = 1 THEN 'PASS' ELSE 'FAIL' END
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'bookings' AND column_name = 'payment_method'

UNION ALL

SELECT
  'bookings.late_payment exists',
  CASE WHEN COUNT(*) = 1 THEN 'PASS' ELSE 'FAIL' END
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'bookings' AND column_name = 'late_payment'

UNION ALL

SELECT
  'bookings.created_by exists',
  CASE WHEN COUNT(*) = 1 THEN 'PASS' ELSE 'FAIL' END
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'bookings' AND column_name = 'created_by'

UNION ALL

-- 3. hotel_payment_settings.hold_timeout_minutes
SELECT
  'hotel_payment_settings.hold_timeout_minutes exists',
  CASE WHEN COUNT(*) = 1 THEN 'PASS' ELSE 'FAIL' END
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'hotel_payment_settings'
  AND column_name = 'hold_timeout_minutes'

UNION ALL

-- 4. payment_sessions new columns
SELECT
  'payment_sessions.raw_response exists',
  CASE WHEN COUNT(*) = 1 THEN 'PASS' ELSE 'FAIL' END
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'payment_sessions' AND column_name = 'raw_response'

UNION ALL

SELECT
  'payment_sessions.verified_transaction_ref exists',
  CASE WHEN COUNT(*) = 1 THEN 'PASS' ELSE 'FAIL' END
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'payment_sessions'
  AND column_name = 'verified_transaction_ref'

UNION ALL

-- 5. Unique index preventing duplicate SlipOK transaction refs system-wide
SELECT
  'payment_sessions verified_transaction_ref unique index exists',
  CASE WHEN COUNT(*) = 1 THEN 'PASS' ELSE 'FAIL' END
FROM pg_indexes
WHERE schemaname = 'public' AND tablename = 'payment_sessions'
  AND indexname = 'idx_payment_sessions_verified_ref_unique'

UNION ALL

-- 6. booking_status_log table + RLS
SELECT
  'booking_status_log table exists',
  CASE WHEN to_regclass('public.booking_status_log') IS NOT NULL THEN 'PASS' ELSE 'FAIL' END

UNION ALL

SELECT
  'booking_status_log RLS enabled',
  CASE WHEN rowsecurity THEN 'PASS' ELSE 'FAIL' END
FROM pg_tables
WHERE schemaname = 'public' AND tablename = 'booking_status_log'

UNION ALL

SELECT
  'booking_status_log has select policy',
  CASE WHEN COUNT(*) >= 1 THEN 'PASS' ELSE 'FAIL' END
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'booking_status_log'

UNION ALL

SELECT
  'booking_status_log has no public write policy (writes via service-role only)',
  CASE WHEN COUNT(*) = 0 THEN 'PASS' ELSE 'FAIL — found ' || COUNT(*) || ' write policies' END
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'booking_status_log' AND cmd IN ('INSERT', 'UPDATE', 'DELETE')

ORDER BY check_name;
