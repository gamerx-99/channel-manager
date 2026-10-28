# Codex #2 (gserver) — 13-05 Better Auth on D1

Where it runs: gserver (Linux), folder `~/hayhost/repo`, branch `agent-d/auth`.
- The branch was cloned from a git bundle of `agent-c/d1-schema` at 70057df. No GitHub push was needed.
- Node 24 and pnpm 10.4.1 live in `~/hayhost/runtime`. Run `source ~/hayhost/env.sh` before working.
- Verified on 2026-10-28: `pnpm check` is clean; `pnpm test` gives 640 passed and the 7 known env failures.

How the owner starts it on gserver:
```bash
cd ~/hayhost/repo && source ~/hayhost/env.sh && codex
```
Then paste everything below the line.

---- PASTE BELOW THIS LINE ----

Ticket 13-05: Better Auth on D1 (spec `specs/13-cloudflare-migration.md`, section 13-05 and the "13-05 identity boundary" notes).

Environment: you are on a shared Linux server. Work ONLY inside ~/hayhost/repo on branch agent-d/auth.
- Run `source ~/hayhost/env.sh` first.
- Run heavy commands (pnpm install, pnpm test, pnpm build) under `systemd-run --user --scope -p CPUQuota=150% -p MemoryMax=3G ...`.
- Do NOT touch anything outside ~/hayhost. Do NOT restart, stop or inspect other services (smartconnect, saas-test, openclaw, postgres, tailscale).
- There is no `.env` here. Never create real secrets; use test values in tests only.
- Do not push, deploy or add a git remote.

Another agent is porting `server/d1/*` repositories (13-03) on a different branch. To avoid merge conflicts:
- Do NOT edit `drizzle/d1-schema.ts`, `drizzle/d1/meta/*` or existing `drizzle/d1/*.sql`, and do NOT run drizzle-kit generate.
- Put the Better Auth tables (user, session, account, verification, two-factor) in a NEW file `drizzle/auth-schema.ts`.
- Write their DDL as a hand-written `drizzle/pending/13-05-better-auth.sql`. The orchestrator will fold it into the migration chain at merge time.
- Do not edit `server/d1/*` or `client/src/`.

Build (server side only; the client swap is 13-07):
1. A Better Auth instance on D1 via the Drizzle adapter, with email + password, mounted on the Worker/Hono app under `/api/auth/*` (see the existing `worker/` scaffold from 13-01).
2. TOTP 2FA plugin: enrol, verify and recovery codes. Also a server helper for step-up: "require a TOTP verification within the last N minutes". It replaces today's Supabase `requireRecentMfa`/AAL2 checks; mirror their semantics and names where practical.
3. A tRPC context builder that turns a Better Auth session into the `D1CallerContext` used by `server/db/scope.ts` (userId and roles from the app's membership/roles data).
4. Invites and hotel-owner signup links:
   - Port the semantics of the current Supabase flows: admin invite, `hotel_signup_links` token → owner account → hotel membership.
   - Keep the pending-token-after-email-confirmation behaviour (14-03a).
5. Password reset and invite email go through a small `EmailSender` interface. The default implementation is Resend (spec 13 Q1 ASSUMPTION), plus a test double. No real API key anywhere.
6. ASSUMPTION (spec 13 Q2, owner leaning): existing users will reset their password at cutover. Do NOT build bcrypt hash import. Record this in OPEN_QUESTIONS.
7. Tests: in-memory SQLite or Better Auth's test utilities, each failing before your change:
   - Sign-up, sign-in and sign-out.
   - Wrong password is rejected.
   - TOTP enrol + verify.
   - Step-up: rejected without a recent TOTP, accepted within the window, rejected after the window.
   - The session maps to the correct D1CallerContext.
   - The signup-link token can be used once only, and an expired token is rejected.
   - The invite creates a membership only for the invited hotel.
   - Super admin sessions still get no hotel-internal data through the scope layer.

Definition of done:
- Paste the `pnpm test` counts (passed must rise above 640; only the 7 known credential-env failures are allowed), plus `pnpm check` and `pnpm build`.
- Conventional commits, each ending with "(13-05)".
- A `.agent/handoff.md` entry, and set the 13-05 Status line in specs/13.
- If the spec and this prompt conflict, stop and write the question in `.agent/OPEN_QUESTIONS.md`.
