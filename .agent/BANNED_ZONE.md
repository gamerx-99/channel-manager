# Banned zone

Paths and actions no ticket may touch without an explicit, separate human approval,
even if a spec seems to imply it's needed.

## Paths
- `.env` — never read its contents into a ticket, worker prompt, or commit. Real
  secrets live only in Vercel's environment variable UI and the human's local `.env`.
- `20260824_add_admin_role_and_platform_admin.sql`, `20260830_add_hotel_signup_links.sql`
  (and every future already-applied migration) — these are historical record of what
  was run against the live Supabase project. Never edit an applied migration; write a
  new one instead, even to fix a typo in a comment.
- `pnpm-lock.yaml` — only ever changes as a side effect of an approved dependency
  change, never edited by hand.
- `vercel.json` — deploy-critical. Two separate production outages this session
  traced back to this file (wrong `outputDirectory`, then a build command that
  skipped the server bundle). Any change here needs its own ticket with a build +
  deploy verification step, not a drive-by edit inside an unrelated ticket.
- `node_modules/`, `dist/` — generated, never hand-edited or committed.

## Actions
- `rm -rf`, `git reset --hard`, `git push --force`, `git rebase` on shared history —
  never, without explicit human approval in the moment, not a standing one.
- `DROP TABLE`, or any SQL that deletes data rather than adding to the schema —
  same rule.
- Rotating or regenerating the `SUPABASE_SERVICE_ROLE_KEY` or any other live credential.
- Pushing to `origin/main` — always requires the explicit approval gate described in
  `CLAUDE.md` and `MASTER_PROMPT.md`, every time, regardless of how many tickets have
  been approved since the last push.
