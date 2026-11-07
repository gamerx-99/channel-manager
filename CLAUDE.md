# CLAUDE.md — Project rules for channel-manager-mvp

This file is the permanent rulebook for working in this repo. Read it in full every
session before touching code. Details too long to keep here live in `specs/` — this
file stays short enough to read every time.

## Stack & commands
- Stack: TypeScript, Vite + React (client), Hono + tRPC on one Cloudflare Worker
  (`worker/index.ts`), D1 (SQLite via Drizzle), R2 (hotel media), Better Auth.
  Deployed with `wrangler deploy --env staging|production` (see `wrangler.toml`).
  There is no Express/Node server and no Vercel deploy any more.
- Package manager: `pnpm` (see `pnpm-lock.yaml` — never mix in `npm install`).
- `pnpm test` — Vitest. Run relevant tests during development; run the full suite
  before production deployment or a remote D1 migration.
- `pnpm check` — `tsc --noEmit`. Run for TypeScript changes before shipping.
- `pnpm build` — `vite build` + `wrangler deploy --dry-run --outdir dist-worker`
  (bundles the Worker, uploads nothing). Run before shipping server, client, or
  deploy-config changes.
- No lint script exists yet; add one only when the work calls for it.
- `pnpm dev` — `vite build` + `wrangler dev` (http://localhost:8787, local D1/R2 state
  in `.wrangler/state`). The client is built once; rerun after client changes.
- An owner instruction can authorize commit, push to `main`, D1 migration, and
  deployment together. Follow the named scope and environments; do not ask again
  between authorized steps. Read-only remote D1 checks need no approval. Report
  the deployed version ID after deployment.

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

## Protected files and actions
See `.agent/BANNED_ZONE.md`. Keep secrets out of commits, do not rewrite applied
migrations, and review deploy configuration and destructive operations carefully.

## Conventions
- Permissions: every capability gate is a named `Permission` in
  `shared/authorization.ts`, checked server-side via `requirePermission` (global) or
  `requireHotelPermission` (per-hotel — **note**: this one unconditionally bypasses
  for `super_admin` regardless of the permission matrix; use `requirePermission`
  instead when a capability must be withheld from `super_admin` on purpose;
  `property.view_financials` has its own `requireFinancialsAccess`) and mirrored
  client-side in `routeScope.ts` +
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
- Tests should cover behavior that can fail in a meaningful way. Use unit, router,
  or UI tests as appropriate; a new page does not automatically need a string-contract
  test.
- File roles: `.tsx` = UI only, `.ts` = logic (hooks + tested pure functions), `.css` = look
  (no `style={{ }}` except runtime CSS variables). Details in `specs/ui-house-style.md`.
- Thai UI copy: read `docs/thai-glossary.md` before writing or changing any Thai string. It lists the
  approved wording for each term in context and the literal translations that are banned.
  `client/src/lib/i18n/thaiGlossary.test.ts` fails on a banned term or a missing th/en key.
- Use conventional commit messages when practical. Related fixes may share a commit
  or batch; keep unrelated changes reviewable.

## Migrations
The database is D1. Schema lives in `drizzle/d1-schema.ts` + `drizzle/auth-schema.ts`;
migrations are generated into `drizzle/d1/` with
`pnpm exec drizzle-kit generate --config drizzle.d1.config.ts`. Agents may apply a
remote migration when the owner authorizes it, including in a combined ship request.
Before applying, verify the D1 database name and ID
against `wrangler.toml`, inspect the SQL, run `wrangler d1 migrations list <database>
--env staging|production --remote`, and confirm that only the intended migrations are
pending. Run the full test suite and relevant typecheck/build before applying. Apply
to staging first when both environments are requested; verify the new schema/data
and an empty pending list there before applying
to production. Verify production the same way and record the result in the handoff or
delivery summary. If unrelated migrations are pending or a check fails, stop and
resolve the discrepancy before any remote write. Read-only `wrangler d1 execute
--remote` is allowed for inspection; ad hoc remote writes need separate owner approval.
Do not mark a migration-touching ticket DONE for a target environment until its
migration is verified there. A combined owner instruction may also authorize code
deployment. The root `YYYYMMDD_*.sql` / `verify_*.sql` files are the historical
Supabase record — keep them, never edit them.

## Working rules
1. Work within this repo unless the owner asks otherwise. Never commit secrets or
   credentials. Keep `.env` and `.dev.vars` untracked.
2. Do not rewrite applied migrations or shared Git history. Destructive database
   changes, force pushes, and deleting data need explicit authorization for that action.
3. A request such as "finish, commit, push, and deploy" authorizes those steps for
   that batch; one approval covers the sequence. If the request names only some steps,
   do only those steps. Verify the target branch and environment before pushing or
   deploying, and report the result. A later, unrelated batch needs its own instruction.
4. Match verification to risk. Documentation-only changes need a diff check. Code
   changes need relevant tests and typecheck/build as applicable. Before production
   deployment, run the full test suite, typecheck, and build. If a required check
   fails, fix it or get the owner's explicit acceptance before deploying.
5. Do not weaken tests merely to make them pass. Correct genuinely wrong tests with
   an explanation. Record important assumptions in code or the delivery summary.
6. Update specs when the task changes a tracked spec; write a short handoff for a
   milestone or remote operation. Seek an independent review for security, payments,
   data loss, or similarly high-risk changes. Routine fixes may use self-review.

## Where to start
- `.agent/DECISIONS.md` — read the "Current owner decisions" register at the top first.
  Never contradict it; when the owner decides something new, update it in the same turn.
- `.agent/handoff.md` — what happened most recently
- `specs/00-OVERVIEW.md` — the full roadmap and dependency graph
- `todo.md` — the historical build log for everything before this workflow existed
