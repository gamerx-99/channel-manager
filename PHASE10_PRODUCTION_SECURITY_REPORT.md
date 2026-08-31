# RMS Phase 10 — Production & Security Closure

Date: 2026-08-31
Status: BLOCKED — live database verification required

## Migration Inventory

| Migration | Applied | Verify |
|---|---|---|
| `20260904_add_hotel_payment_settings.sql` | BLOCKED: no live Postgres connection configured | BLOCKED |
| `20260904_add_notifications.sql` | BLOCKED: no live Postgres connection configured | BLOCKED |
| `20260905_harden_notifications_rls.sql` | NOT APPLIED | NOT RUN |

`node server/verifySupabaseMigration.mjs` returned:

```text
[Migration verification] Failed: SUPABASE_POOLER_DB_URL or SUPABASE_DB_URL is required.
```

No live migration or RLS result is claimed as PASS.

## Source Audit

- Payment settings: SELECT/INSERT/UPDATE use `public.is_hotel_member`; tRPC adds `property.manage_profile` and MFA.
- Notifications: the correction migration removes broad `FOR ALL USING (true)`, scopes reads/updates to membership, and makes content immutable for browser sessions. Inserts remain service-role-only.
- Bookings, rooms, availability, rate overrides, housekeeping, messages, hotel media, and site config use hotel membership or a related hotel membership check in existing SQL/application paths.
- Frontend `selected-hotel-id` is a routing convenience only. Server authorization and RLS remain the security boundary.

## Required Human Verification

1. Apply `20260904_add_hotel_payment_settings.sql` and run its verify script.
2. Apply `20260904_add_notifications.sql` if it is not already applied.
3. Apply `20260905_harden_notifications_rls.sql`.
4. Run both notification verify scripts. Every result must be PASS.
5. Test Hotel A and Hotel B with two authenticated users: cross-hotel SELECT, UPDATE, and DELETE must fail; marking only `is_read` must succeed.
6. Confirm SlipOK returns only `configured`/`enabled`, never key material, and MFA is required.

Phase 10 must remain open until live SQL results are pasted into the handoff.
