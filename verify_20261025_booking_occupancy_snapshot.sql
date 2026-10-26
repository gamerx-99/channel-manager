-- Run after 20261025_booking_occupancy_snapshot.sql in the Supabase SQL editor.
-- Every result row must report PASS. This script is read-only.
SELECT 'booking_occupancy_columns' AS check_name,
  CASE WHEN COUNT(*) = 2 THEN 'PASS' ELSE 'FAIL' END AS result
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'bookings'
  AND column_name IN ('adults_count', 'children_count')
UNION ALL
SELECT 'booking_occupancy_column_types',
  CASE WHEN COUNT(*) = 2 THEN 'PASS' ELSE 'FAIL' END
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'bookings'
  AND column_name IN ('adults_count', 'children_count')
  AND data_type = 'integer'
  AND is_nullable = 'YES';