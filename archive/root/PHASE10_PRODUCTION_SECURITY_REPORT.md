# RMS Phase 10 — Production & Security Closure

Date: 2026-08-31
Status: BLOCKED — live database verification required

## Current Status

```
Code Fix        PASS
Root Cause      CONFIRMED
Git             CLEAN
Supabase State  notifications = Case B CONFIRMED (live 42P01: table absent)
                payment settings = pending full inspect output
Live Verify     REQUIRED
Phase 10        OPEN
```

First live evidence (2026-08-31): running `PHASE10_INSPECT_DATABASE_STATE.sql`
failed with `42P01: relation "public.notifications" does not exist` at the
trigger check — proving the notifications table is absent on the live database,
i.e. **Case B**: the original 20260904 script rolled back entirely when its
`public.users`-referencing policy failed to create. The inspect script's hard
`::regclass` cast aborted the run; it now uses `to_regclass()` so every check
returns YES/NO instead of erroring when the table is missing.

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

## Run order — ONE run, one file

STEP 0 (separate inspect) is superseded: `PHASE10_ONESHOT_APPLY_AND_VERIFY.sql`
does the conditional apply, all 18 static checks, and the live RLS behaviour
tests in a single all-or-nothing transaction:

1. Run `PHASE10_ONESHOT_APPLY_AND_VERIFY.sql` once in the Supabase SQL Editor
   (safe in Case A, Case B, or already-applied states — fully idempotent).
2. Expected Messages output: every line `PASS ...` ending with
   `PHASE 10 ONESHOT: ALL CHECKS PASSED`.
3. Any failure raises an exception naming the failed checks and rolls the whole
   run back — the database is left untouched; paste the output either way.

The behaviour tests simulate real users (member, non-member, cross-hotel
member, super_admin, platform admin) and prove: non-member sees 0 rows, members
see only their hotel, cross-hotel reads are denied, `is_read` updates succeed,
and INSERT / DELETE / content edits are all blocked. Test rows are deleted
before commit.

After the one-shot passes, the remaining Phase 10 item is the app-level
confirmation: SlipOK endpoints return only `configured`/`enabled` — never key
material — and MFA step-up is enforced.

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
