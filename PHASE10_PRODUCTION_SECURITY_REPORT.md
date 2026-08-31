# RMS Phase 10 — Production & Security Closure

Date: 2026-08-31
Status: BLOCKED — live database verification required

## Current Status

```
Code Fix        PASS
Root Cause      CONFIRMED
Git             CLEAN
Supabase State  UNKNOWN
Live Verify     REQUIRED
Phase 10        OPEN
```

Root cause of the `42P01: relation "public.users" does not exist` error: the
original `20260904_add_notifications.sql` references `public.users`, a table this
project does not have (roles live in `public.hotel_users`). Depending on how far
that script executed on the live database, the notifications table may exist with
zero or broken policies (Case A) or may not exist at all (Case B).

Code-level fact confirmed during this pass: `insertNotification` (server/db.ts)
is imported into `server/routers.ts` but has **no call sites** — no code path
inserts notifications through a user-scoped RLS client. Therefore the correct
RLS shape has no INSERT policy for authenticated clients at all: only the
service-role admin client can ever create notification rows.

## STEP 0 — Inspect before applying (read-only)

Run `PHASE10_INSPECT_DATABASE_STATE.sql` first. It changes nothing and reports:

- whether `public.notifications` exists and its policy names
- whether any broad `true` policy remains
- whether any policy anywhere references `public.users`
- whether `hotel_payment_settings` exists, its RLS state, and its policies
- whether the gatekeeper functions and immutable-content trigger exist

Paste the output into the ticket before applying anything else.

## Case A / Case B — both converge on one migration

`20260906_notifications_recreate_policies.sql` is idempotent and transactional:

- Case A (table exists, policies broken/missing): legacy names are dropped and
  the correct member-scoped policies + immutable trigger are created.
- Case B (table missing): the table is created first, then the same policies.

It supersedes the `20260904_add_notifications.sql` +
`20260905_harden_notifications_rls.sql` sequence for the notifications concern.
Run it once regardless of which case the inspection shows, then verify.

## Run order (after STEP 0)

1. `20260906_notifications_recreate_policies.sql`
2. `verify_20260906_notifications_recreate_policies.sql` — every row must be PASS
3. `verify_20260904_add_notifications.sql` — every check must be PASS
4. `20260904_add_hotel_payment_settings.sql` — only if STEP 0 shows the table or
   its policies are missing; otherwise skip
5. `verify_20260904_add_hotel_payment_settings.sql` — every row must be PASS
6. Cross-hotel isolation test: Hotel A user must fail SELECT/UPDATE/DELETE on
   Hotel B notifications; marking only `is_read` must succeed
7. Confirm SlipOK endpoints return only `configured`/`enabled` — never key
   material — and that MFA step-up is enforced

## Final checklist

```
PAYMENT SETTINGS
[ ] Migration Applied
[ ] Verify PASS

NOTIFICATIONS
[ ] Correct schema exists
[ ] No public.users reference
[ ] No broad FOR ALL USING(true)
[ ] 20260906 migration applied
[ ] Verify 20260906 PASS
[ ] Verify 20260904 PASS

MULTI-TENANT
[ ] Hotel A cannot access Hotel B

QUALITY
[x] pnpm test
[x] pnpm check
[x] pnpm build
```

Phase 10 must remain open until live SQL results are pasted into the handoff.
