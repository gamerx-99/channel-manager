-- 20260904_add_notifications.sql
-- Adds notifications table for in-app alerts

CREATE TABLE IF NOT EXISTS public.notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    hotel_id UUID NOT NULL REFERENCES public.hotels(id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    message TEXT NOT NULL,
    is_read BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- RLS: Hotel staff can read notifications for their hotel, API can create them.
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view notifications for their hotels"
    ON public.notifications
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.hotel_users
            WHERE hotel_users.hotel_id = notifications.hotel_id
            AND hotel_users.user_id = auth.uid()
        )
        OR
        (SELECT role FROM public.users WHERE id = auth.uid()) = 'super_admin'
    );

CREATE POLICY "Users can mark notifications as read"
    ON public.notifications
    FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM public.hotel_users
            WHERE hotel_users.hotel_id = notifications.hotel_id
            AND hotel_users.user_id = auth.uid()
        )
        OR
        (SELECT role FROM public.users WHERE id = auth.uid()) = 'super_admin'
    );

-- Service role bypasses RLS by default, but this policy is kept explicit and
-- scoped strictly TO service_role so it can never widen access for
-- anon/authenticated (an unscoped USING(true) policy applies to every role,
-- not just service_role, and would let any authenticated user read/write/delete
-- another hotel's notifications since Postgres OR's RLS policies together).
CREATE POLICY "Service role full access on notifications"
    ON public.notifications
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

CREATE INDEX IF NOT EXISTS notifications_hotel_id_idx ON public.notifications(hotel_id);
