# 10 Production & Security Closure

Status: BLOCKED — awaiting live Supabase migration and RLS verification

## Scope

- Confirm the 20260904 payment-settings and notifications migrations against the live database.
- Harden notifications so human users can only read their hotel notifications and mark them read.
- Confirm hotel-scoped tables use membership-based RLS and that frontend hotel selection is not a security boundary.
- Confirm SlipOK secrets remain server-side and MFA protects sensitive settings.

## Current Evidence

- Source migration and authorization audit completed.
- Notification hardening migration added: `20260905_harden_notifications_rls.sql`.
- Verification scripts updated/added.
- `pnpm test`: 344 passed, 3 skipped.
- `pnpm check`: passed.
- Live verification is blocked because no Postgres connection string is available in this environment.

## Exit Criteria

- Human applies all required migrations in Supabase SQL Editor.
- Payment-settings and both notification verification scripts return all PASS.
- Authenticated Hotel A/Hotel B isolation test passes for SELECT, UPDATE, and DELETE.
- Phase 10 handoff contains the live SQL output.
