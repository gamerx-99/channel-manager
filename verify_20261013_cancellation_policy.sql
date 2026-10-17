-- Read-only verification for 20261013_cancellation_policy.sql.
-- Every row should return PASS. Run only after the owner applies the migration.

SELECT
  'policy table exists with version + cutoff ordering' AS check_name,
  CASE WHEN
    (SELECT count(*) FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'hotel_cancellation_policies'
        AND column_name IN ('hotel_id','free_cancellation_days','partial_keep_percent',
          'partial_cutoff_days','deposit_percent','no_show_keep_percent',
          'policy_text_th','policy_text_en','version')) = 9
    AND EXISTS (SELECT 1 FROM pg_constraint
      WHERE conrelid = 'public.hotel_cancellation_policies'::regclass
        AND conname = 'hotel_cancellation_policies_cutoff_order')
    THEN 'PASS' ELSE 'FAIL' END AS result

UNION ALL

SELECT
  'bookings snapshot + refund columns exist',
  CASE WHEN
    (SELECT count(*) FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'bookings'
        AND column_name IN ('policy_snapshot','policy_accepted_at',
          'refund_amount')) = 3
    THEN 'PASS' ELSE 'FAIL' END

UNION ALL

SELECT
  'one policy per hotel (unique hotel_id)',
  CASE WHEN EXISTS (SELECT 1 FROM pg_constraint
      WHERE conrelid = 'public.hotel_cancellation_policies'::regclass
        AND conname = 'hotel_cancellation_policies_hotel_id_unique')
    THEN 'PASS' ELSE 'FAIL' END

UNION ALL

SELECT
  'RLS enabled with member + public read policies',
  CASE WHEN
    (SELECT relrowsecurity FROM pg_class
      WHERE relnamespace = 'public'::regnamespace
        AND relname = 'hotel_cancellation_policies')
    AND (SELECT count(*) FROM pg_policies
      WHERE schemaname = 'public' AND tablename = 'hotel_cancellation_policies'
        AND policyname IN ('hotel_cancellation_policies_select',
          'hotel_cancellation_policies_public_read',
          'hotel_cancellation_policies_upsert',
          'hotel_cancellation_policies_update')) = 4
    THEN 'PASS' ELSE 'FAIL' END

ORDER BY check_name;
