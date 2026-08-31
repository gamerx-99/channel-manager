-- PHASE10_ONESHOT_APPLY_AND_VERIFY.sql
-- Phase 10 closure in ONE run. Safe to run in ANY current state (Case A, Case B,
-- or already-applied): everything is idempotent and wrapped in a single
-- transaction — if any check fails, the whole run rolls back and the database
-- is left exactly as it was.
--
-- What it does, in order:
--   PART 1  Ensure notifications schema + correct policies + immutable trigger
--   PART 2  Ensure hotel_payment_settings schema + membership-scoped policies
--   PART 3  Static verification (18 checks, each prints PASS or FAIL)
--   PART 4  Live RLS behaviour tests with simulated users:
--             - non-member sees nothing
--             - member sees only their hotel's rows
--             - cross-hotel access denied (when a second hotel member exists)
--             - super_admin / admin see all rows
--             - member can mark is_read, but INSERT / DELETE / content-edit
--               are all blocked
--
-- Expected output: a Messages panel full of "PASS: ..." notices ending with
-- "PHASE 10 ONESHOT: ALL CHECKS PASSED". Any failure raises an exception with
-- the failing check names and rolls everything back.
--
-- Run as the default postgres session in the Supabase SQL Editor.

BEGIN;

-- ============================================================================
-- PART 1 — Notifications schema (idempotent, converges Case A and Case B)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id UUID NOT NULL REFERENCES public.hotels(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  message TEXT NOT NULL,
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Drop every policy name this table has ever carried in the repository,
-- including the broken public.users ones from the original 20260904 script.
DROP POLICY IF EXISTS "Service role full access on notifications" ON public.notifications;
DROP POLICY IF EXISTS "Users can view notifications for their hotels" ON public.notifications;
DROP POLICY IF EXISTS "Users can mark notifications as read" ON public.notifications;
DROP POLICY IF EXISTS notifications_select_member ON public.notifications;
DROP POLICY IF EXISTS notifications_mark_read_member ON public.notifications;

CREATE POLICY notifications_select_member
  ON public.notifications FOR SELECT TO authenticated
  USING (public.is_hotel_member(hotel_id));

CREATE POLICY notifications_mark_read_member
  ON public.notifications FOR UPDATE TO authenticated
  USING (public.is_hotel_member(hotel_id))
  WITH CHECK (public.is_hotel_member(hotel_id));

CREATE OR REPLACE FUNCTION public.prevent_notification_content_changes()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
BEGIN
  IF auth.uid() IS NOT NULL AND (
    NEW.hotel_id IS DISTINCT FROM OLD.hotel_id OR
    NEW.type IS DISTINCT FROM OLD.type OR
    NEW.message IS DISTINCT FROM OLD.message OR
    NEW.created_at IS DISTINCT FROM OLD.created_at
  ) THEN
    RAISE EXCEPTION 'Notification content is immutable';
  END IF;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS notifications_content_immutable ON public.notifications;
CREATE TRIGGER notifications_content_immutable
  BEFORE UPDATE ON public.notifications
  FOR EACH ROW EXECUTE FUNCTION public.prevent_notification_content_changes();

CREATE INDEX IF NOT EXISTS notifications_hotel_id_idx ON public.notifications(hotel_id);

-- ============================================================================
-- PART 2 — Payment settings schema (idempotent)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.hotel_payment_settings (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id        uuid        NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
  slipok_key_enc  text        NULL,
  slipok_key_hash text        NULL,
  slipok_enabled  boolean     NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT hotel_payment_settings_hotel_id_unique UNIQUE (hotel_id)
);

ALTER TABLE public.hotel_payment_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS hotel_payment_settings_select ON public.hotel_payment_settings;
DROP POLICY IF EXISTS hotel_payment_settings_upsert ON public.hotel_payment_settings;
DROP POLICY IF EXISTS hotel_payment_settings_update ON public.hotel_payment_settings;

CREATE POLICY hotel_payment_settings_select
  ON public.hotel_payment_settings FOR SELECT
  USING (public.is_hotel_member(hotel_id));

CREATE POLICY hotel_payment_settings_upsert
  ON public.hotel_payment_settings FOR INSERT
  WITH CHECK (public.is_hotel_member(hotel_id));

CREATE POLICY hotel_payment_settings_update
  ON public.hotel_payment_settings FOR UPDATE
  USING (public.is_hotel_member(hotel_id))
  WITH CHECK (public.is_hotel_member(hotel_id));

CREATE OR REPLACE FUNCTION update_hotel_payment_settings_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $fn$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$fn$;

DROP TRIGGER IF EXISTS hotel_payment_settings_updated_at ON public.hotel_payment_settings;
CREATE TRIGGER hotel_payment_settings_updated_at
  BEFORE UPDATE ON public.hotel_payment_settings
  FOR EACH ROW EXECUTE FUNCTION update_hotel_payment_settings_updated_at();

-- ============================================================================
-- PART 3 — Static verification (18 checks)
-- ============================================================================

DO $blk$
DECLARE
  v_failures text[] := '{}';
  v_checks int := 0;
BEGIN
  RAISE NOTICE '--- PART 3: static verification ---';

  v_checks := v_checks + 1;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='notifications') THEN
    RAISE NOTICE 'PASS n1: notifications table exists';
  ELSE
    v_failures := array_append(v_failures, 'n1 notifications table missing'); RAISE NOTICE 'FAIL n1: notifications table missing';
  END IF;

  v_checks := v_checks + 1;
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='notifications' AND rowsecurity) THEN
    RAISE NOTICE 'PASS n2: RLS enabled on notifications';
  ELSE
    v_failures := array_append(v_failures, 'n2 notifications RLS disabled'); RAISE NOTICE 'FAIL n2: notifications RLS disabled';
  END IF;

  v_checks := v_checks + 1;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='notifications' AND (qual LIKE '%public.users%' OR with_check LIKE '%public.users%')) THEN
    RAISE NOTICE 'PASS n3: no policy references public.users';
  ELSE
    v_failures := array_append(v_failures, 'n3 public.users reference remains'); RAISE NOTICE 'FAIL n3: public.users reference remains';
  END IF;

  v_checks := v_checks + 1;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='notifications' AND (btrim(qual,'() ')='true' OR btrim(with_check,'() ')='true')) THEN
    RAISE NOTICE 'PASS n4: no broad true policy on notifications';
  ELSE
    v_failures := array_append(v_failures, 'n4 broad true policy on notifications'); RAISE NOTICE 'FAIL n4: broad true policy on notifications';
  END IF;

  v_checks := v_checks + 1;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='notifications' AND cmd IN ('INSERT','DELETE')) THEN
    RAISE NOTICE 'PASS n5: no INSERT/DELETE policy for clients';
  ELSE
    v_failures := array_append(v_failures, 'n5 client INSERT/DELETE policy exists'); RAISE NOTICE 'FAIL n5: client INSERT/DELETE policy exists';
  END IF;

  v_checks := v_checks + 1;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='notifications' AND policyname='notifications_select_member' AND cmd='SELECT' AND roles='{authenticated}' AND qual LIKE '%is_hotel_member%') THEN
    RAISE NOTICE 'PASS n6: member select policy via is_hotel_member';
  ELSE
    v_failures := array_append(v_failures, 'n6 member select policy wrong'); RAISE NOTICE 'FAIL n6: member select policy wrong';
  END IF;

  v_checks := v_checks + 1;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='notifications' AND policyname='notifications_mark_read_member' AND cmd='UPDATE' AND roles='{authenticated}' AND qual LIKE '%is_hotel_member%' AND with_check LIKE '%is_hotel_member%') THEN
    RAISE NOTICE 'PASS n7: member update policy via is_hotel_member';
  ELSE
    v_failures := array_append(v_failures, 'n7 member update policy wrong'); RAISE NOTICE 'FAIL n7: member update policy wrong';
  END IF;

  v_checks := v_checks + 1;
  IF to_regclass('public.notifications') IS NOT NULL AND EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid=to_regclass('public.notifications') AND tgname='notifications_content_immutable' AND tgenabled <> 'D') THEN
    RAISE NOTICE 'PASS n8: immutable-content trigger active';
  ELSE
    v_failures := array_append(v_failures, 'n8 immutable trigger missing'); RAISE NOTICE 'FAIL n8: immutable trigger missing';
  END IF;

  v_checks := v_checks + 1;
  IF EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public' AND tablename='notifications' AND indexname='notifications_hotel_id_idx') THEN
    RAISE NOTICE 'PASS n9: hotel_id index exists';
  ELSE
    v_failures := array_append(v_failures, 'n9 hotel_id index missing'); RAISE NOTICE 'FAIL n9: hotel_id index missing';
  END IF;

  v_checks := v_checks + 1;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='hotel_payment_settings') THEN
    RAISE NOTICE 'PASS p1: hotel_payment_settings table exists';
  ELSE
    v_failures := array_append(v_failures, 'p1 payment settings table missing'); RAISE NOTICE 'FAIL p1: payment settings table missing';
  END IF;

  v_checks := v_checks + 1;
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='hotel_payment_settings' AND rowsecurity) THEN
    RAISE NOTICE 'PASS p2: RLS enabled on hotel_payment_settings';
  ELSE
    v_failures := array_append(v_failures, 'p2 payment settings RLS disabled'); RAISE NOTICE 'FAIL p2: payment settings RLS disabled';
  END IF;

  v_checks := v_checks + 1;
  IF EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE table_name='hotel_payment_settings' AND constraint_name='hotel_payment_settings_hotel_id_unique') THEN
    RAISE NOTICE 'PASS p3: one-row-per-hotel unique constraint exists';
  ELSE
    v_failures := array_append(v_failures, 'p3 unique hotel_id constraint missing'); RAISE NOTICE 'FAIL p3: unique hotel_id constraint missing';
  END IF;

  v_checks := v_checks + 1;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='hotel_payment_settings' AND column_name='slipok_key_enc' AND is_nullable='YES') THEN
    RAISE NOTICE 'PASS p4: slipok_key_enc is nullable (removable)';
  ELSE
    v_failures := array_append(v_failures, 'p4 slipok_key_enc not nullable'); RAISE NOTICE 'FAIL p4: slipok_key_enc not nullable';
  END IF;

  v_checks := v_checks + 1;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='hotel_payment_settings' AND column_name='slipok_enabled' AND column_default='true') THEN
    RAISE NOTICE 'PASS p5: slipok_enabled defaults true';
  ELSE
    v_failures := array_append(v_failures, 'p5 slipok_enabled default wrong'); RAISE NOTICE 'FAIL p5: slipok_enabled default wrong';
  END IF;

  v_checks := v_checks + 1;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='hotel_payment_settings' AND policyname='hotel_payment_settings_select' AND qual LIKE '%is_hotel_member%') THEN
    RAISE NOTICE 'PASS p6: payment select policy via is_hotel_member';
  ELSE
    v_failures := array_append(v_failures, 'p6 payment select policy wrong'); RAISE NOTICE 'FAIL p6: payment select policy wrong';
  END IF;

  v_checks := v_checks + 1;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='hotel_payment_settings' AND policyname='hotel_payment_settings_upsert' AND with_check LIKE '%is_hotel_member%') THEN
    RAISE NOTICE 'PASS p7: payment insert policy via is_hotel_member';
  ELSE
    v_failures := array_append(v_failures, 'p7 payment insert policy wrong'); RAISE NOTICE 'FAIL p7: payment insert policy wrong';
  END IF;

  v_checks := v_checks + 1;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='hotel_payment_settings' AND policyname='hotel_payment_settings_update' AND qual LIKE '%is_hotel_member%' AND with_check LIKE '%is_hotel_member%') THEN
    RAISE NOTICE 'PASS p8: payment update policy via is_hotel_member';
  ELSE
    v_failures := array_append(v_failures, 'p8 payment update policy wrong'); RAISE NOTICE 'FAIL p8: payment update policy wrong';
  END IF;

  v_checks := v_checks + 1;
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='is_hotel_member' AND p.prosecdef) THEN
    RAISE NOTICE 'PASS g1: is_hotel_member gatekeeper is SECURITY DEFINER';
  ELSE
    v_failures := array_append(v_failures, 'g1 is_hotel_member gatekeeper wrong'); RAISE NOTICE 'FAIL g1: is_hotel_member gatekeeper wrong';
  END IF;

  IF array_length(v_failures, 1) IS NOT NULL THEN
    RAISE EXCEPTION 'PART 3 STATIC VERIFY FAILED (%): %', array_length(v_failures,1), array_to_string(v_failures, ' | ');
  END IF;
  RAISE NOTICE 'PART 3 RESULT: ALL % STATIC CHECKS PASS', v_checks;
END
$blk$;

-- ============================================================================
-- PART 4 — Live RLS behaviour tests (simulated users, rolled back afterwards)
-- ============================================================================

DO $blk$
DECLARE
  v_hotel_a uuid;
  v_member_a uuid;
  v_super_admin uuid;
  v_platform_admin uuid;
  v_hotel_b uuid;
  v_member_b uuid;
  v_nonmember uuid := gen_random_uuid();
  v_expected_a int;
  v_expected_b int;
  v_total int;
  v_count int;
  v_rows int;
  v_failures text[] := '{}';
BEGIN
  RAISE NOTICE '--- PART 4: live RLS behaviour tests ---';

  SELECT hu.hotel_id, hu.user_id INTO v_hotel_a, v_member_a
  FROM public.hotel_users hu WHERE hu.role = 'hotel_owner' LIMIT 1;
  IF v_member_a IS NULL THEN
    SELECT hu.hotel_id, hu.user_id INTO v_hotel_a, v_member_a
    FROM public.hotel_users hu WHERE hu.role NOT IN ('super_admin','admin') LIMIT 1;
  END IF;

  SELECT hu.user_id INTO v_super_admin FROM public.hotel_users hu WHERE hu.role = 'super_admin' LIMIT 1;
  SELECT hu.user_id INTO v_platform_admin FROM public.hotel_users hu WHERE hu.role = 'admin' LIMIT 1;

  IF v_hotel_a IS NOT NULL THEN
    SELECT hu.hotel_id, hu.user_id INTO v_hotel_b, v_member_b
    FROM public.hotel_users hu
    WHERE hu.role NOT IN ('super_admin','admin') AND hu.hotel_id <> v_hotel_a
    LIMIT 1;
  END IF;

  IF v_member_a IS NULL THEN
    RAISE NOTICE 'SKIP PART 4: this project has no hotel member to test with';
    RETURN;
  END IF;

  -- Seed ephemeral test rows (deleted before commit; rolled back on any error).
  INSERT INTO public.notifications (hotel_id, type, message)
  VALUES (v_hotel_a, 'phase10_selftest', 'isolation test row A');
  IF v_hotel_b IS NOT NULL THEN
    INSERT INTO public.notifications (hotel_id, type, message)
    VALUES (v_hotel_b, 'phase10_selftest', 'isolation test row B');
  END IF;

  SELECT count(*) INTO v_expected_a FROM public.notifications WHERE hotel_id = v_hotel_a;
  SELECT count(*) INTO v_total FROM public.notifications;
  IF v_hotel_b IS NOT NULL THEN
    SELECT count(*) INTO v_expected_b FROM public.notifications WHERE hotel_id = v_hotel_b;
  END IF;

  -- T1: non-member sees nothing
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_nonmember::text, 'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO v_count FROM public.notifications;
  RESET ROLE;
  IF v_count = 0 THEN RAISE NOTICE 'PASS T1: non-member sees 0 rows';
  ELSE v_failures := array_append(v_failures, 'T1 non-member saw rows'); RAISE NOTICE 'FAIL T1: non-member saw % rows', v_count; END IF;

  -- T2: member sees exactly their hotel's rows, zero foreign rows
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_member_a::text, 'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO v_count FROM public.notifications;
  SELECT count(*) INTO v_rows FROM public.notifications WHERE hotel_id <> v_hotel_a;
  RESET ROLE;
  IF v_count = v_expected_a AND v_rows = 0 THEN
    RAISE NOTICE 'PASS T2: member sees only own hotel rows (%, foreign %)', v_count, v_rows;
  ELSE
    v_failures := array_append(v_failures, 'T2 member scoping wrong'); RAISE NOTICE 'FAIL T2: member saw % rows (% foreign), expected %', v_count, v_rows, v_expected_a;
  END IF;

  -- T3: cross-hotel member cannot read hotel A rows (only when a second hotel exists)
  IF v_member_b IS NOT NULL THEN
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_member_b::text, 'role','authenticated')::text, true);
    SET LOCAL ROLE authenticated;
    SELECT count(*) INTO v_count FROM public.notifications;
    SELECT count(*) INTO v_rows FROM public.notifications WHERE hotel_id = v_hotel_a;
    RESET ROLE;
    IF v_count = v_expected_b AND v_rows = 0 THEN
      RAISE NOTICE 'PASS T3: cross-hotel member denied hotel A rows';
    ELSE
      v_failures := array_append(v_failures, 'T3 cross-hotel leak'); RAISE NOTICE 'FAIL T3: cross-hotel member saw hotel A rows';
    END IF;
  ELSE
    RAISE NOTICE 'SKIP T3: only one hotel on this project — T1/T2 already prove the deny path';
  END IF;

  -- T4: super_admin sees all rows
  IF v_super_admin IS NOT NULL THEN
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_super_admin::text, 'role','authenticated')::text, true);
    SET LOCAL ROLE authenticated;
    SELECT count(*) INTO v_count FROM public.notifications;
    RESET ROLE;
    IF v_count = v_total THEN RAISE NOTICE 'PASS T4: super_admin sees all % rows', v_total;
    ELSE v_failures := array_append(v_failures, 'T4 super_admin scoping wrong'); RAISE NOTICE 'FAIL T4: super_admin saw % of %', v_count, v_total; END IF;
  ELSE
    RAISE NOTICE 'SKIP T4: no super_admin on this project';
  END IF;

  -- T4b: read-only platform admin also sees all rows
  IF v_platform_admin IS NOT NULL THEN
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_platform_admin::text, 'role','authenticated')::text, true);
    SET LOCAL ROLE authenticated;
    SELECT count(*) INTO v_count FROM public.notifications;
    RESET ROLE;
    IF v_count = v_total THEN RAISE NOTICE 'PASS T4b: platform admin sees all % rows', v_total;
    ELSE v_failures := array_append(v_failures, 'T4b platform admin scoping wrong'); RAISE NOTICE 'FAIL T4b: platform admin saw % of %', v_count, v_total; END IF;
  ELSE
    RAISE NOTICE 'SKIP T4b: no admin role on this project';
  END IF;

  -- T5: member can mark is_read (must succeed)
  BEGIN
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_member_a::text, 'role','authenticated')::text, true);
    SET LOCAL ROLE authenticated;
    UPDATE public.notifications SET is_read = true WHERE hotel_id = v_hotel_a AND type = 'phase10_selftest';
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    RESET ROLE;
    IF v_rows = 1 THEN RAISE NOTICE 'PASS T5: member marked is_read (% row)', v_rows;
    ELSE v_failures := array_append(v_failures, 'T5 is_read update failed'); RAISE NOTICE 'FAIL T5: is_read update touched % rows', v_rows; END IF;
  EXCEPTION WHEN others THEN
    v_failures := array_append(v_failures, 'T5 is_read update raised: ' || SQLERRM);
    RAISE NOTICE 'FAIL T5: is_read update raised %', SQLERRM;
  END;

  -- T6: member cannot rewrite content (trigger must block)
  BEGIN
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_member_a::text, 'role','authenticated')::text, true);
    SET LOCAL ROLE authenticated;
    UPDATE public.notifications SET message = 'tampered' WHERE hotel_id = v_hotel_a AND type = 'phase10_selftest';
    RESET ROLE;
    v_failures := array_append(v_failures, 'T6 content edit was NOT blocked');
    RAISE NOTICE 'FAIL T6: content edit was not blocked';
  EXCEPTION WHEN others THEN
    IF SQLERRM LIKE '%immutable%' THEN RAISE NOTICE 'PASS T6: content edit blocked (%)', SQLERRM;
    ELSE v_failures := array_append(v_failures, 'T6 unexpected: ' || SQLERRM); RAISE NOTICE 'FAIL T6: unexpected error %', SQLERRM; END IF;
  END;

  -- T7: member cannot INSERT
  BEGIN
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_member_a::text, 'role','authenticated')::text, true);
    SET LOCAL ROLE authenticated;
    INSERT INTO public.notifications (hotel_id, type, message) VALUES (v_hotel_a, 'phase10_selftest', 'should be denied');
    RESET ROLE;
    v_failures := array_append(v_failures, 'T7 INSERT was NOT blocked');
    RAISE NOTICE 'FAIL T7: INSERT was not blocked';
  EXCEPTION WHEN others THEN
    IF SQLSTATE = '42501' THEN RAISE NOTICE 'PASS T7: INSERT denied by RLS';
    ELSE v_failures := array_append(v_failures, 'T7 unexpected: ' || SQLERRM); RAISE NOTICE 'FAIL T7: unexpected error %', SQLERRM; END IF;
  END;

  -- T8: member cannot DELETE
  BEGIN
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_member_a::text, 'role','authenticated')::text, true);
    SET LOCAL ROLE authenticated;
    DELETE FROM public.notifications WHERE hotel_id = v_hotel_a AND type = 'phase10_selftest';
    RESET ROLE;
    v_failures := array_append(v_failures, 'T8 DELETE was NOT blocked');
    RAISE NOTICE 'FAIL T8: DELETE was not blocked';
  EXCEPTION WHEN others THEN
    IF SQLSTATE = '42501' THEN RAISE NOTICE 'PASS T8: DELETE denied by RLS';
    ELSE v_failures := array_append(v_failures, 'T8 unexpected: ' || SQLERRM); RAISE NOTICE 'FAIL T8: unexpected error %', SQLERRM; END IF;
  END;

  -- Remove ephemeral test rows before committing.
  DELETE FROM public.notifications WHERE type = 'phase10_selftest';

  IF array_length(v_failures, 1) IS NOT NULL THEN
    RAISE EXCEPTION 'PART 4 BEHAVIOUR TESTS FAILED (%): %', array_length(v_failures,1), array_to_string(v_failures, ' | ');
  END IF;
  RAISE NOTICE 'PART 4 RESULT: ALL BEHAVIOUR TESTS PASS';
END
$blk$;

COMMIT;

DO $blk$
BEGIN
  RAISE NOTICE 'PHASE 10 ONESHOT: ALL CHECKS PASSED — migration applied and verified';
END
$blk$;
