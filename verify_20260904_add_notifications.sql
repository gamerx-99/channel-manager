-- verify_20260904_add_notifications.sql
-- Run this block in the Supabase SQL editor to verify the notifications schema.
-- Expected output: all checks should return 'PASS'

DO $$
DECLARE
    passed BOOLEAN;
    msg TEXT;
BEGIN
    RAISE NOTICE 'Verifying notifications table schema...';

    -- Check 1: Table exists
    SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_name = 'notifications'
    ) INTO passed;

    IF passed THEN
        RAISE NOTICE 'PASS: Table public.notifications exists';
    ELSE
        RAISE EXCEPTION 'FAIL: Table public.notifications missing';
    END IF;

    -- Check 2: RLS is enabled
    SELECT relrowsecurity FROM pg_class WHERE relname = 'notifications' INTO passed;
    IF passed THEN
        RAISE NOTICE 'PASS: RLS is enabled on public.notifications';
    ELSE
        RAISE EXCEPTION 'FAIL: RLS is disabled on public.notifications';
    END IF;

    -- Check 3: member-scoped select policy exists
    SELECT EXISTS (
        SELECT FROM pg_policies
        WHERE schemaname = 'public' AND tablename = 'notifications' AND policyname = 'notifications_select_member'
    ) INTO passed;
    IF passed THEN
        RAISE NOTICE 'PASS: Select policy exists';
    ELSE
        RAISE EXCEPTION 'FAIL: Select policy missing';
    END IF;

    -- Check 4: no broad policy grants every role access
    SELECT NOT EXISTS (
        SELECT FROM pg_policies
        WHERE schemaname = 'public' AND tablename = 'notifications'
          AND (qual = 'true' OR with_check = 'true')
    ) INTO passed;
    IF passed THEN
        RAISE NOTICE 'PASS: No broad USING (true) or WITH CHECK (true) policy exists';
    ELSE
        RAISE EXCEPTION 'FAIL: Broad notification policy still grants unrestricted access';
    END IF;

    RAISE NOTICE 'All checks passed successfully.';
END $$;
