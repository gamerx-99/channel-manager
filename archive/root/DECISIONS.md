# Decisions (lightweight ADR log)

Format: `## <date> — <short title>` then **Decision**, **Why**, **Status** (open/closed).
Newest first. Log the reasoning, not just the outcome — the reasoning is what keeps a
future ticket from accidentally reversing a decision that was actually deliberate.

## 2026-08-31 — Keep Database Migrations Manual (Phase 08)
**Decision**: Do not automate SQL migrations as part of the startup/build process. Continue requiring the human developer to manually run `YYYYMMDD_description.sql` in the Supabase SQL editor.
**Why**: Applying migrations programmatically requires exposing a highly privileged `DATABASE_URL` / `SUPABASE_POOLER_DB_URL` to the runtime environment. Since this project runs in a restricted sandboxed environment without these secrets (using only anonymous and service_role Supabase API keys which don't have DDL privileges), injecting SQL directly into the DB is both insecure and physically impossible without expanding the surface area for credentials. Manual execution is safer and guarantees human oversight over schema changes.
**Status**: Closed.

## 2026-08-30 — MFA: blocking enforcement for super_admin/admin (T09-01 recon)
**Decision**: `super_admin` and `admin` (platform roles per `shared/authorization.ts` `PLATFORM_ROLES`) must have TOTP MFA enrolled before any authenticated access is granted — **blocking at first login**, not a grace-period nag. Hotel-level roles (`hotel_owner`, `revenue_manager`, `front_desk`, `housekeeping`) are opt-in only in this phase; required step-up MFA for SlipOK settings (Phase 01 tie-in) will prompt enrollment at point of use rather than silently deny.
**Why — blocking vs grace-period**: spec `specs/09-authenticator-mfa.md` explicitly prefers blocking ("blocking is safer and simpler, prefer it unless told otherwise"). Recon confirms grace-period adds non-trivial state: expiry tracking, nag UI, bypass window, and audit surface for the two most privileged roles. Blocking keeps the auth gate stateless (Supabase Auth factor state is the source of truth) and matches the product's trust model where `super_admin` already bypasses most hotel-scoped RLS — MFA is the only compensating control for that breadth.
**Why — Supabase API supports blocking without custom storage**: verified against installed `supabase-js@2.112.3` bundle (`node_modules/@supabase/supabase-js/dist/umd/supabase.js`, GoTrueClient). Client API is `supabase.auth.mfa.*` (wrap of `GoTrueClient.mfa`): `enroll({ factorType:'totp', friendlyName, issuer })` → `challenge({ factorId })` → `verify({ factorId, challengeId, code })` / `challengeAndVerify({ factorId, code })`, plus `unenroll({ factorId })`, `listFactors() → { all, totp, phone, webauthn }`, `getAuthenticatorAssuranceLevel() → { currentLevel, nextLevel, currentAuthenticationMethods }` (reads JWT `aal`/`amr` claims, elevates `nextLevel` to `aal2` when verified factors exist; emits `MFA_CHALLENGE_VERIFIED`). No new table expected — factor state lives in Supabase Auth — so blocking can be enforced purely by checking `listFactors`/`getAuthenticatorAssuranceLevel` post-login before allowing navigation. No app-side "verified within N minutes" table needed unless Supabase's session AAL proves insufficient for SlipOK step-up freshness.
**Current auth flow gap**: `client/src/pages/Login.tsx` calls `supabase.auth.signInWithPassword` and navigates to `/dashboard` unconditionally — no post-login MFA factor check, no `getAuthenticatorAssuranceLevel` call, no challenge UI. `client/src/_core/hooks/useAuth.ts` tracks `supabase.auth.getSession()` / `onAuthStateChange` only (`user`, `loading`, `isAuthenticated`), with no AAL awareness. `client/src/App.tsx` `PrivateRoute` gates on `useAuth` + `trpc.auth.me` / `routeScope` permissions only. Any blocking enforcement will need: (a) post-login branch in `Login.tsx` that calls `mfa.listFactors()` + `mfa.getAuthenticatorAssuranceLevel()` for platform roles and redirects to enroll/verify when `currentLevel !== 'aal2'`, (b) a session-level guard (or `requireRecentMfaVerification()` helper per spec) for SlipOK step-up that checks AAL freshness rather than just enrollment, with `hotel_owner` enrollment prompt (not silent block) when no factor exists.
**Alternatives considered**: grace-period nag (rejected — adds temporal state and leaves privileged sessions under-protected during window); SMS/email MFA (out of scope — spec restricts to TOTP per human request).
**Status**: open — recon only, no production code touched. Implementation follows in 09 tickets. See `.agent/recon/REPORT.md` 2026-08-30 T09-01 section for full code evidence.
**References**: `specs/09-authenticator-mfa.md`, `client/src/pages/Login.tsx:17`, `client/src/_core/hooks/useAuth.ts`, `client/src/lib/supabase.ts`, `shared/authorization.ts:PLATFORM_ROLES`, `node_modules/@supabase/supabase-js/dist/umd/supabase.js` (`GoTrueClient._enroll/_challenge/_verify/_getAuthenticatorAssuranceLevel`, `supabase.auth.mfa`).

## 2026-08-31 — Payments: per-hotel SlipOK key confirmed (BYO key model)
**Decision**: Phase 01 uses a BYO (Bring Your Own) key model — each hotel supplies its own SlipOK API key, stored and used per-hotel, mirroring the existing per-hotel iCal URL pattern in OTA Sync (`ota_connections.ical_import_url`). The platform never touches real money, card data, or a central payment gateway.
**Why**: KBank's own corporate API requires ≥300 verified slips/month which no hotel on this platform clears yet. SlipOK's BYO-key model has no such volume floor. The pattern is already well-established in this codebase (iCal per hotel, per provider).
**Resolved sub-decisions (confirmed by human 2026-08-31)**:
1. **Encryption**: Store SlipOK API key encrypted (AES-256) in Postgres with a DEK; store only a hash for dedup checks. Never return raw key to client.
2. **Permission gate**: `property.manage_profile` — reuses the existing permission already in `shared/authorization.ts`, consistent with other hotel settings (site config, media). No new permission needed.
**Status**: Closed — unblocks Phase 01 implementation.

## 2026-08-29 — Financials: withhold from super_admin by design
**Decision**: `property.view_financials` is granted to `hotel_owner` only — not
`revenue_manager`, not `admin`, and explicitly excluded from `super_admin`'s normal
blanket permission grant (`shared/authorization.ts`). The `financials` tRPC
procedure uses `requirePermission`, not `requireHotelPermission`, because the latter
unconditionally bypasses for `super_admin` regardless of the permission matrix.
**Why**: hotel revenue is the property's own business data — the platform operator
seeing it by default isn't part of this product's trust model, even though
`super_admin` normally sees everything else. This is a deliberate, unusual carve-out
from this codebase's dominant "super_admin can do everything" convention — noted
explicitly in code comments so a future maintainer doesn't "fix" it as a bug.
**Status**: closed.

## 2026-08-30 — Signup links: hotel-first, single-use
**Decision**: A super_admin creates the hotel first (existing flow, unchanged), then
generates a signup link scoped to that specific hotel. The link never creates a
hotel itself — only self-service account creation + `hotel_owner` role binding. Each
link is single-use, enforced atomically (`update ... where used_at is null and
expires_at > now()`), and duration is admin-settable in hours (not fixed presets).
**Why**: keeps hotel creation entirely behind `super_admin` auth (unchanged trust
boundary) while removing the need for an admin to know a new owner's email in
advance. Single-use avoids one link being shared across multiple prospective owners
for the same hotel, which the 1-hotel-owner-per-hotel rule wouldn't allow anyway.
**Status**: closed.

## 2026-08-29 — Vercel: bundle the server, don't let Vercel's builder resolve it
**Decision**: `api/index.ts` imports the pre-bundled `dist/index.js` (produced by
this repo's existing `esbuild --bundle --splitting` step), not
`server/_core/index.ts` source directly.
**Why**: Vercel's zero-config TypeScript builder compiles `api/` files individually
rather than bundling the whole import graph. Under ESM (`"type": "module"`), that
left every extensionless relative import — including every `@shared/*` alias in the
server tree — unresolved at runtime (`ERR_MODULE_NOT_FOUND`), even though the same
code worked fine locally where Node resolves modules differently. Pointing at the
already-correctly-bundled single-file output sidesteps Vercel's resolver entirely.
A second, related issue (rollup/vite native binary crash on cold start) was fixed by
making the `./vite` import inside `server/_core/index.ts` a dynamic import and adding
`--splitting` to the esbuild step, so that dev-only code path — never invoked on
Vercel — is never even loaded there.
**Status**: closed.

## 2026-08-29 — `vitest.config.ts` include glob gap
**Decision/finding**: `shared/**/*.test.ts` was never in the `include` glob, so
`shared/authorization.test.ts` — including tests that predate this workflow — was
never actually running under `pnpm test`. Fixed by adding the pattern.
**Why it matters going forward**: don't assume "the test file exists" means "the test
file runs." Any ticket adding tests to a new top-level directory should double-check
it's covered by `vitest.config.ts`'s `include` array.
**Status**: closed.
