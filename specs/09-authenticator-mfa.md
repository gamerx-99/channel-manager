# 09 Authenticator (TOTP MFA)
Status: DONE — 2026-08-30 (deepseek-v4-pro, 4 tickets T09-01→04)
Depends on: —
Owner-tier: worker-code

## Goal
Add TOTP-based multi-factor authentication using Supabase Auth's built-in MFA
support (`supabase.auth.mfa.*`) — no custom TOTP implementation needed. Required for
platform roles (`super_admin`, `admin`) from the first ticket; optional (opt-in) for
hotel-level roles initially, per the human's decision this session.

**This phase is a prerequisite for Phase 01 (SlipOK)**: entering or viewing a
hotel's SlipOK settings requires a step-up MFA check, even for a user who is
already logged in — see 01's updated Business rules.

## Non-goals
- SMS/email-based MFA — TOTP (authenticator app) only for v1, matching what the
  human asked for
- Recovery codes UI beyond whatever Supabase's MFA API provides by default — don't
  build a custom backup-code system unless Supabase's own flow is insufficient

## Interface contract
- Client: use `supabase.auth.mfa.enroll()` / `.challenge()` / `.verify()` /
  `.unenroll()` directly (Supabase JS SDK) — this is a Supabase Auth feature, not a
  new tRPC procedure. `client/src/pages/Login.tsx`'s `supabase` import
  (`@/lib/supabase`) is the same client to use.
- A new step-up check, e.g. `requireRecentMfaVerification()`, used wherever a
  sensitive action needs to confirm MFA was verified recently (not just that it's
  enrolled) — check Supabase's session/AAL (Authenticator Assurance Level) claims
  for how "verified this session" is actually represented before designing this;
  don't assume a shape.

## Data model
No new table expected — Supabase Auth stores MFA factor state itself. If step-up
"verified within the last N minutes" tracking needs app-side state beyond what
Supabase's session already exposes, that's a deviation from the default assumption
above — confirm against Supabase's actual MFA/AAL API before adding one.

## Business rules
- `super_admin`/`admin` accounts must enroll MFA — decide whether this is enforced
  at first-login (blocking) or via a grace-period nag; blocking is safer and
  simpler, prefer it unless told otherwise.
- Hotel-level roles (`hotel_owner`, `revenue_manager`, `front_desk`, `housekeeping`)
  can enroll but are not required to, in this phase.
- **SlipOK settings step-up (ties into Phase 01)**: opening or saving a hotel's
  SlipOK API key settings requires a fresh MFA verification (an AAL2 session, or
  equivalent step-up check), regardless of role — including `hotel_owner` accounts
  that haven't otherwise been required to enroll MFA. A `hotel_owner` who hasn't
  enrolled MFA yet must be prompted to enroll at that point, not silently blocked.

## Error handling
- No enrolled MFA factor when a step-up check is required → prompt to enroll first,
  don't just deny access with no path forward.
- Expired step-up verification (session aged past whatever freshness window is
  chosen) → re-prompt for the TOTP code, don't silently fall back to allowing access.

## Acceptance criteria
- [ ] `super_admin`/`admin` accounts are required to enroll TOTP MFA (blocking or
      grace-period, per the decision made when this ticket starts)
- [ ] Any user can optionally enroll/unenroll MFA from their profile settings
- [ ] Opening SlipOK settings (Phase 01) triggers a fresh MFA challenge if the
      current session isn't already step-up-verified, for every role including
      `hotel_owner`
- [ ] A user with no enrolled factor who hits the SlipOK step-up check is guided to
      enroll, not just blocked

## Test plan
- Client-side test of the enrollment/challenge/verify flow against a mocked
  Supabase client (follow whatever mocking pattern `Login.tsx`'s existing tests, if
  any, or `HotelStaff.test.tsx`'s `vi.mock` style use)
- A test proving the SlipOK settings page redirects to a step-up challenge when MFA
  hasn't been freshly verified, for a `hotel_owner` session
- A test proving `super_admin` login without an enrolled factor triggers enrollment,
  not silent bypass

## Definition of Done
- [ ] `pnpm test`, `pnpm check`, `pnpm build` all pass
- [ ] No TODO/FIXME left in touched files
- [ ] Spec status updated to DONE, `.agent/handoff.md` entry written
- [ ] Reviewer approved with evidence
