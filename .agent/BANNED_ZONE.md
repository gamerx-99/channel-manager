# Banned zone

Paths and actions no ticket may touch without an explicit, separate human approval,
even if a spec seems to imply it's needed.

## Paths
- `.env`, `.dev.vars` — never read their contents into a ticket, worker prompt, or
  commit. Real secrets live only in `wrangler secret` (per Worker environment) and the
  human's local files.
- `20260824_add_admin_role_and_platform_admin.sql`, `20260830_add_hotel_signup_links.sql`
  (and every other root `*.sql`) — historical record of what was run against the
  retired Supabase project. The same applies to every `drizzle/d1/*.sql` migration
  already applied to staging or production. Never edit an applied migration; write a
  new one instead, even to fix a typo in a comment.
- `pnpm-lock.yaml` — only ever changes as a side effect of an approved dependency
  change, never edited by hand.
- `wrangler.toml` — deploy-critical: bindings (D1, R2, assets, rate limits), database
  ids and cron triggers for each environment (bindings are not inherited, so every
  environment repeats them). Any change here needs its own ticket with a
  `pnpm build` (wrangler `--dry-run`) verification step, not a drive-by edit inside an
  unrelated ticket. (`vercel.json` was deleted with the Express/Vercel pipeline.)
- `node_modules/`, `dist/`, `dist-worker/`, `.wrangler/` — generated, never
  hand-edited or committed.

## Actions
- `rm -rf`, `git reset --hard`, `git push --force`, `git rebase` on shared history —
  never, without explicit human approval in the moment, not a standing one.
- `DROP TABLE`, or any SQL that deletes data rather than adding to the schema —
  same rule.
- Rotating or regenerating the `SUPABASE_SERVICE_ROLE_KEY` or any other live credential.
- `wrangler deploy` (without `--dry-run`), `wrangler d1 migrations apply --remote`,
  `wrangler d1 execute --remote`, `wrangler secret put` — human-only.
- Pushing to `origin/main` — always requires the explicit approval gate described in
  `CLAUDE.md` and `MASTER_PROMPT.md`, every time, regardless of how many tickets have
  been approved since the last push.
