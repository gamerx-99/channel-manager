# T04-02 — Communications table + tRPC router
Status: TODO
Owner: worker-code
Spec: specs/04-communications.md
Depends: T04-01
# Goal: Create migration YYYYMMDD_add_message_threads.sql + verify_*.sql for message_threads (id, hotel_id FK, booking_id nullable FK, created_at) and messages (id, thread_id FK, sender_user_id nullable, body, created_at) + RLS via is_super_admin/is_hotel_member + indexes. Wire server/db.ts helpers and server/routers.ts procedures sendMessage/listMessages scoped to hotel/booking, gated by operations.view_bookings (read) / operations.manage_bookings (write). Handle FORBIDDEN if booking outside caller's hotel scope. Add server/messaging.access.test.ts mocked-router permission boundary test. Run pnpm check/test/build.
