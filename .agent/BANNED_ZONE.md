# Banned zone

Protected paths and actions. Unless an exception is stated below, changing or running
them needs explicit, separate owner approval, even if a spec implies it is needed.

## Paths
- `.env`, `.dev.vars` — never read their contents into a ticket, worker prompt, or
  commit. Real secrets live only in `wrangler secret` (per Worker environment) and the
  human's local files.
- `20260824_add_admin_role_and_platform_admin.sql`, `20260830_add_hotel_signup_links.sql`
  (and every other root `*.sql`) — historical record of what was run against the
  retired Supabase project. The same applies to every `drizzle/d1/*.sql` migration
  already applied to staging or production. Never edit an applied migration; write a
  new one instead, even to fix a typo in a comment.
- `pnpm-lock.yaml` — update through `pnpm` when dependencies change; never edit by hand.
- `wrangler.toml` — deploy-critical. Agents may edit it when the requested work needs
  a binding, database, route, or cron change. Check each target environment, review
  the diff, and run `pnpm build` before shipping.
- `node_modules/`, `dist/`, `dist-worker/`, `.wrangler/` — generated, never
  hand-edited or committed.

## Actions
- `rm -rf`, `git reset --hard`, `git push --force`, `git rebase` on shared history —
  never, without explicit human approval in the moment, not a standing one.
- `DROP TABLE`, or any SQL that deletes data rather than adding to the schema —
  same rule.
- Rotating or regenerating the `SUPABASE_SERVICE_ROLE_KEY` or any other live credential.
- `wrangler deploy` (without `--dry-run`), `wrangler secret put`, and remote D1
  migrations require owner authorization for the intended work and environment. One
  combined instruction can authorize commit, push to `main`, migration, and deploy;
  do not ask again between those steps. Follow the checks in `AGENTS.md` / `CLAUDE.md`.
  Read-only `wrangler d1 execute --remote` is allowed for inspection; ad hoc remote
  data or schema writes require separate owner approval.
- Pushing to `origin/main` is allowed when the owner asks to push this batch. Confirm
  the target branch and checks first. A request to push does not authorize deployment
  unless deployment is also named.
