# AGENTS.md — Project rules for channel-manager-mvp

This file is the permanent rulebook for working in this repo. Read it in full every
session before touching code. Details too long to keep here live in `specs/` — this
file stays short enough to read every time.

## Stack & commands
- Stack: TypeScript, Vite + React (client), Hono + tRPC on one Cloudflare Worker
  (`worker/index.ts`), D1 (SQLite via Drizzle), R2 (hotel media), Better Auth.
  Deployed with `wrangler deploy --env staging|production` (see `wrangler.toml`).
  There is no Express/Node server and no Vercel deploy any more.
- Package manager: `pnpm` (see `pnpm-lock.yaml` — never mix in `npm install`).
- `pnpm test` — Vitest, must pass before any ticket closes.
- `pnpm check` — `tsc --noEmit`, must pass before any ticket closes.
- `pnpm build` — `vite build` + `wrangler deploy --dry-run --outdir dist-worker`
  (bundles the Worker, uploads nothing), must pass before any ticket that touches
  server/client/deploy config closes.
- No lint script exists yet (`package.json` has no `"lint"` entry). Do not invent
  one mid-ticket — if a phase needs it, that's its own ticket first.
- `pnpm dev` — `vite build` + `wrangler dev` (http://localhost:8787, local D1/R2 state
  in `.wrangler/state`). The client is built once; rerun after client changes.
- `wrangler` is only ever run with `--dry-run` by agents; real deploys are a human step
  (Hard rule 3).

## Folder structure
```
client/src/           React app (pages/, components/, lib/)
worker/                Worker entry: index.ts (fetch + cron), app.ts (Hono routes: tRPC,
                         Better Auth, R2 media, OTA iCal export)
server/                tRPC (routers.ts + routers/), domain logic
server/_core/          tRPC setup (trpc.ts), request context (context.ts), system router
server/d1/             Scoped D1 repositories; server/db/scope.ts holds the access checks
shared/                Code shared by client and server (authorization.ts is load-bearing)
drizzle/               D1 schema (d1-schema.ts, auth-schema.ts) and D1 migrations (d1/)
*.sql (repo root)       Historical Supabase migrations + verify_*.sql — record only,
                         see "Migrations" below
.agent/                 Orchestration scaffold (this workflow) — see MASTER_PROMPT.md
specs/                  Executable specs for the roadmap in todo.md's "Roadmap" section
```

## Do not touch without asking
See `.agent/BANNED_ZONE.md` for the enforced list. Highlights: `.env` (never commit
real secrets), already-applied migrations (root `*.sql` and applied `drizzle/d1/*.sql` —
write a new migration instead of editing these), `wrangler.toml` (deploy-critical:
bindings, D1 ids and crons per environment — changes need extra care).

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
- Hotel data goes through the scoped D1 repositories in `server/d1/`, which check the
  caller with `server/db/scope.ts` (`authorizeHotelAction`). Use the system caller
  (`createD1SystemCallerContext`) only for unauthenticated system paths such as the
  OTA iCal export and the cron.
- New pure aggregation logic (reports, summaries) should be a standalone,
  unit-testable function taking plain data in and plain data out — follow
  `server/financials.ts`.
- Tests: server-side logic gets a plain Vitest unit test; router procedures that
  enforce a permission boundary get a mocked-router test (see
  `server/financials.access.test.ts`); new pages get a string-contract test (see
  `client/src/pages/Financials.contract.test.ts`) asserting the route is registered,
  the permission gate is present, and key UI markers exist.
- Git: commits are conventional (`feat(scope): ...`, `fix(scope): ...`). One ticket
  = one concern per commit, per the Hard Rules below — this repo's history before
  this workflow existed doesn't always follow that; new work should.

## Migrations
The database is D1. Schema lives in `drizzle/d1-schema.ts` + `drizzle/auth-schema.ts`;
migrations are generated into `drizzle/d1/` with
`pnpm exec drizzle-kit generate --config drizzle.d1.config.ts`. Agents never apply them
to a remote database: the human runs `wrangler d1 migrations apply <database> --env
staging|production --remote`. Never mark a migration-touching ticket DONE until the
human confirms it was applied. The root `YYYYMMDD_*.sql` / `verify_*.sql` files are the
historical Supabase record — keep them, never edit them.

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
