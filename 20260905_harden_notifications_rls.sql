-- Phase 10: close the broad notifications policy from 20260904.
-- Notifications are hotel-scoped operational events. Human users may read
-- their hotel's rows and mark only the read flag. Server-side service_role
-- code inserts notifications; it bypasses RLS and needs no USING (true) policy.

BEGIN;

DROP POLICY IF EXISTS "Service role full access on notifications" ON public.notifications;
DROP POLICY IF EXISTS "Users can view notifications for their hotels" ON public.notifications;
DROP POLICY IF EXISTS "Users can mark notifications as read" ON public.notifications;

CREATE POLICY notifications_select_member
  ON public.notifications FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.hotel_users hu
      WHERE hu.hotel_id = notifications.hotel_id
        AND hu.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.hotel_users hu
      WHERE hu.user_id = auth.uid()
        AND hu.role IN ('super_admin', 'admin')
    )
  );

CREATE POLICY notifications_mark_read_member
  ON public.notifications FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.hotel_users hu
      WHERE hu.hotel_id = notifications.hotel_id
        AND hu.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.hotel_users hu
      WHERE hu.user_id = auth.uid()
        AND hu.role IN ('super_admin', 'admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.hotel_users hu
      WHERE hu.hotel_id = notifications.hotel_id
        AND hu.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.hotel_users hu
      WHERE hu.user_id = auth.uid()
        AND hu.role IN ('super_admin', 'admin')
    )
  );

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

COMMIT;
