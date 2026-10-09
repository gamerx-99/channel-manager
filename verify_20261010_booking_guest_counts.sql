-- Read-only verification for 20261010_booking_guest_counts.sql.
-- Every row should return PASS. Run only after the owner applies the migration.

SELECT
  'booking occupancy columns exist with safe defaults' AS check_name,
  CASE WHEN
    (SELECT count(*) FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'bookings'
       AND column_name IN ('adults', 'children', 'child_measurements')) = 3
    AND (SELECT column_default FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'bookings' AND column_name = 'adults') LIKE '%1%'
    AND (SELECT column_default FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'bookings' AND column_name = 'children') LIKE '%0%'
    AND (SELECT column_default FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'bookings' AND column_name = 'child_measurements') LIKE '%[]%'
    THEN 'PASS' ELSE 'FAIL' END AS result

UNION ALL

SELECT
  'existing bookings have valid party counts and matching child measurement arrays',
  CASE WHEN NOT EXISTS (
    SELECT 1 FROM public.bookings b
    WHERE b.adults < 1 OR b.adults > 20
       OR b.children < 0 OR b.children > 20
       OR jsonb_typeof(b.child_measurements) <> 'array'
       OR jsonb_array_length(b.child_measurements) <> b.children
  ) THEN 'PASS' ELSE 'FAIL' END

UNION ALL

SELECT
  'booking occupancy constraints are installed and validated',
  CASE WHEN (
    SELECT count(*) = 3 AND bool_and(convalidated)
    FROM pg_constraint
    WHERE conrelid = 'public.bookings'::regclass
      AND conname IN (
        'bookings_adults_check',
        'bookings_children_check',
        'bookings_child_measurements_count_check'
      )
  ) THEN 'PASS' ELSE 'FAIL' END

ORDER BY check_name;
