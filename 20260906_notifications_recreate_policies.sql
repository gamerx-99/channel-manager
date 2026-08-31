-- 20260906_notifications_recreate_policies.sql
-- Phase 10 — Case A/B safe, idempotent notifications fix.
--
-- Why this exists: the original 20260904_add_notifications.sql references
-- public.users, a table this project does not have (roles live in
-- public.hotel_users). Depending on how far that script got on the live
-- database, the notifications table may exist with zero or broken policies
-- (Case A), or may not exist at all (Case B). This migration converges BOTH
-- cases to the correct final state in one transaction:
--
--   * table present (created if missing, untouched if present)
--   * RLS enabled
--   * legacy policy names (including any that reference public.users) dropped
--   * member-scoped SELECT + is_read-only UPDATE policies via the standard
--     public.is_hotel_member() gatekeeper
--   * immutable-content trigger so browser sessions cannot rewrite events
--   * no INSERT policy: authenticated clients can never create notifications;
--     only the server's service-role admin client writes them (verified in
--     code: insertNotification has no call sites through a user RLS client)
--
-- This supersedes the 20260904_add_notifications.sql + 20260905_harden_
-- notifications_rls.sql sequence. Run this once, then its verify script.

BEGIN;

CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id UUID NOT NULL REFERENCES public.hotels(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  message TEXT NOT NULL,
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Drop every policy name this table has ever carried in the repository.
DROP POLICY IF EXISTS "Service role full access on notifications" ON public.notifications;
DROP POLICY IF EXISTS "Users can view notifications for their hotels" ON public.notifications;
DROP POLICY IF EXISTS "Users can mark notifications as read" ON public.notifications;
DROP POLICY IF EXISTS notifications_select_member ON public.notifications;
DROP POLICY IF EXISTS notifications_mark_read_member ON public.notifications;

-- Hotel members read their own hotel's notifications. Platform roles
-- (super_admin, admin) read across hotels — is_hotel_member() short-circuits
-- on them, matching requireHotelPermission's platform bypass in the tRPC layer.
-- This is the same SECURITY DEFINER gatekeeper every other hotel-scoped table
-- uses, so the policy subquery is not subject to hotel_users' own RLS.
CREATE POLICY notifications_select_member
  ON public.notifications FOR SELECT TO authenticated
  USING (public.is_hotel_member(hotel_id));

-- Members may only flip is_read. The trigger below makes every other column
-- immutable for authenticated sessions (service role has no auth.uid()).
CREATE POLICY notifications_mark_read_member
  ON public.notifications FOR UPDATE TO authenticated
  USING (public.is_hotel_member(hotel_id))
  WITH CHECK (public.is_hotel_member(hotel_id));

CREATE OR REPLACE FUNCTION public.prevent_notification_content_changes()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
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
$$;

DROP TRIGGER IF EXISTS notifications_content_immutable ON public.notifications;
CREATE TRIGGER notifications_content_immutable
  BEFORE UPDATE ON public.notifications
  FOR EACH ROW EXECUTE FUNCTION public.prevent_notification_content_changes();

CREATE INDEX IF NOT EXISTS notifications_hotel_id_idx ON public.notifications(hotel_id);

COMMIT;
