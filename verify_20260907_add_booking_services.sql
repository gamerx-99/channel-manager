-- verify_20260907_add_booking_services.sql

-- Helper to format output
CREATE OR REPLACE FUNCTION test_pass(msg text) RETURNS text AS $$
BEGIN
  RETURN '✅ PASS: ' || msg;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION test_fail(msg text) RETURNS text AS $$
BEGIN
  RETURN '❌ FAIL: ' || msg;
END;
$$ LANGUAGE plpgsql;

DO $$ 
DECLARE
  v_table_exists boolean;
  v_policy_exists boolean;
  v_result text;
BEGIN
  -- 1. Check if booking_services table exists
  SELECT EXISTS (
    SELECT FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name = 'booking_services'
  ) INTO v_table_exists;
  
  IF v_table_exists THEN
    RAISE NOTICE '%', test_pass('booking_services table exists');
  ELSE
    RAISE EXCEPTION '%', test_fail('booking_services table missing');
  END IF;

  -- 2. Check if RLS is enabled
  IF (SELECT rowsecurity FROM pg_tables WHERE schemaname = 'public' AND tablename = 'booking_services') THEN
    RAISE NOTICE '%', test_pass('booking_services has RLS enabled');
  ELSE
    RAISE EXCEPTION '%', test_fail('booking_services RLS is disabled');
  END IF;

  -- 3. Check if policy exists
  SELECT EXISTS (
    SELECT FROM pg_policies 
    WHERE schemaname = 'public' 
    AND tablename = 'booking_services' 
    AND policyname = 'Users can view and manage services for bookings in their hotels'
  ) INTO v_policy_exists;

  IF v_policy_exists THEN
    RAISE NOTICE '%', test_pass('Policy "Users can view and manage services for bookings in their hotels" exists');
  ELSE
    RAISE EXCEPTION '%', test_fail('Policy missing');
  END IF;
  
END $$;
