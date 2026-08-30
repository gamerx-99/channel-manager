# AGENTS.md — Project rules for channel-manager-mvp

This file is the permanent rulebook for working in this repo. Read it in full every
session before touching code. Details too long to keep here live in `specs/` — this
file stays short enough to read every time.

## Stack & commands
- Stack: TypeScript, Vite + React (client), Express + tRPC (server), Supabase
  (Postgres + Auth), deployed on Vercel (serverless function via `api/index.ts`).
- Package manager: `pnpm` (see `pnpm-lock.yaml` — never mix in `npm install`).
- `pnpm test` — Vitest, must pass before any ticket closes.
- `pnpm check` — `tsc --noEmit`, must pass before any ticket closes.
- `pnpm build` — `vite build` + esbuild server bundle, must pass before any ticket
  that touches server/deploy config closes.
- No lint script exists yet (`package.json` has no `"lint"` entry). Do not invent
  one mid-ticket — if a phase needs it, that's its own ticket first.
- `pnpm dev` — local dev server (`tsx watch`). Known issue: has failed to bind in
  this sandboxed environment before (see `.agent/OPEN_QUESTIONS.md`) — verify against
  the live Vercel deploy if local dev won't start.

## Folder structure
```
client/src/           React app (pages/, components/, lib/)
server/                Express + tRPC (routers.ts is the single tRPC router)
server/_core/          Express bootstrap, oauth, storage proxy, trpc setup
shared/                Code shared by client and server (authorization.ts is load-bearing)
api/index.ts            Vercel serverless entry — imports the pre-bundled dist/index.js
*.sql (repo root)       Numbered migrations (YYYYMMDD_description.sql) + matching
                         verify_YYYYMMDD_description.sql — see "Migrations" below
.agent/                 Orchestration scaffold (this workflow) — see MASTER_PROMPT.md
specs/                  Executable specs for the roadmap in todo.md's "Roadmap" section
```

## Do not touch without asking
See `.agent/BANNED_ZONE.md` for the enforced list. Highlights: `.env` (never commit
real secrets), already-applied migrations (`20260824_*.sql`, `20260830_*.sql` — write
a new migration instead of editing these), `vercel.json` (deploy-critical, changes
here need extra care — see the git history for why: two separate production outages
this session traced back to Vercel config).

## Conventions
- Permissions: every capability gate is a named `Permission` in
  `shared/authorization.ts`, checked server-side via `requirePermission` (global) or
  `requireHotelPermission` (per-hotel — **note**: this one unconditionally bypasses
  for `super_admin` regardless of the permission matrix; use `requirePermission`
  instead when a capability must be withheld from `super_admin` on purpose, as
  `property.view_financials` is) and mirrored client-side in `routeScope.ts` +
  `can()` in `App.tsx`. Never gate on role name directly in application code — gate
  on permission.
- New tRPC procedures follow the existing pattern in `server/routers.ts`: a
  permission check first, then `try { ... } catch (error) { return
  rethrowDomainError(error); }`.
- New admin-client (service-role) operations belong in `server/supabase.ts`, next to
  the existing `auth.admin.*` helpers — never use the service-role client for
  request-scoped hotel data (see the comment on `createSupabaseAdminClient`).
- New pure aggregation logic (reports, summaries) should be a standalone,
  unit-testable function taking plain data in and plain data out — follow
  `server/channelPerformance.ts` / `server/financials.ts`.
- Tests: server-side logic gets a plain Vitest unit test; router procedures that
  enforce a permission boundary get a mocked-router test (see
  `server/financials.access.test.ts`); new pages get a string-contract test (see
  `client/src/pages/Financials.contract.test.ts`) asserting the route is registered,
  the permission gate is present, and key UI markers exist.
- Git: commits are conventional (`feat(scope): ...`, `fix(scope): ...`). One ticket
  = one concern per commit, per the Hard Rules below — this repo's history before
  this workflow existed doesn't always follow that; new work should.

## Migrations
This environment has no live `DATABASE_URL`/`SUPABASE_POOLER_DB_URL` (placeholders in
`.env` — see `.agent/OPEN_QUESTIONS.md`), so migrations cannot be applied
programmatically. Every migration ships as a pair:
`YYYYMMDD_description.sql` (the migration) + `verify_YYYYMMDD_description.sql`
(read-only checks, every row should read PASS). The human applies both by hand in the
Supabase SQL editor. Never mark a migration-touching ticket DONE until the human
confirms the verify script passed against the live project.

## Hard rules (non-negotiable, copied from `.agent/MASTER_PROMPT.md` so no sub-agent
misses them even if it never reads the master prompt)
1. Never delete or modify anything outside this repo, and never touch
   `.agent/BANNED_ZONE.md`'s list without asking first.
2. Never run destructive commands (`rm -rf`, `git reset --hard`, `git push --force`,
   `DROP TABLE`, rewriting git history) without explicit human approval first — no
   exceptions, regardless of how confident the ticket seems.
3. **Pushing to `main` and deploying are always an explicit-approval step**, every
   single time, even mid-autonomous-loop. This overrides the master prompt's "don't
   stop to ask" framing — that framing applies to implementation decisions, never to
   push/deploy.
4. Never commit secrets/tokens/API keys. `.env` stays untracked; `.env.example`
   documents variable names only.
5. Never claim a ticket is done without pasting real `pnpm test`/`pnpm check`
   output as evidence.
6. Never edit a test to make it pass. If a test is genuinely wrong, fix it and say
   why in the ticket — don't quietly loosen an assertion.
7. Never invent a requirement the spec doesn't state. Log it in
   `.agent/OPEN_QUESTIONS.md` and pick the safest default, marked `ASSUMPTION:` in
   the code comment.
8. One ticket = one concern = one commit.
9. Write a `.agent/handoff.md` entry at the end of every ticket, before moving on.

## Definition of Done (every ticket)
- [ ] `pnpm test` passes — output pasted in the ticket
- [ ] `pnpm check` passes — output pasted in the ticket
- [ ] `pnpm build` passes if server/client/deploy config changed
- [ ] No stray `TODO`/`FIXME` left in touched files
- [ ] Spec status updated (`specs/<file>.md`'s `Status:` line) and
      `.agent/handoff.md` has a new entry
- [ ] Reviewer approved (see `.agent/agents/reviewer.md`) with evidence, for any
      ticket above trivial size

## Where to start
- `.agent/handoff.md` — what happened most recently
- `specs/00-OVERVIEW.md` — the full roadmap and dependency graph
- `todo.md` — the historical build log for everything before this workflow existed
