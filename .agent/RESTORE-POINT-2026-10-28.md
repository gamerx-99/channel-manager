# Restore point: 2026-10-28

This file records exactly what was pushed on 2026-10-28 and how to get back to this state.
Nothing here was merged into `main`, and nothing was deployed.

## What is where

| Branch | Commit at this point | What it holds | Tests at this point |
|---|---|---|---|
| `main` | 052298d | unchanged, equals `origin/main` | not re-run |
| `agent-a/next` | 8505b99 | Supabase app: UI cleanup (UI-01), spec 16 (5-step booking flow, 3 hotel themes) | 655 passed, 7 env-only failures; check and build OK |
| `agent-c/d1-schema` | 9915c6a | Cloudflare migration (spec 13): D1 schema and services, booking, iCal sync, R2 media, Cron | 738 passed, 7 env-only failures; check and build OK |
| `agent-b/website-builder-public-hotel` | c2e20fd | older merge point of the website-builder work | not re-run |
| `snapshot/orchestrator-2026-10-28` | see tag | the agent prompts, specs drafts, notes and design references that were never committed | n/a |

`agent-a/next` and `agent-c/d1-schema` are separate lines of work. They are not merged with each other.

Tags (annotated), one per branch: `restore/2026-10-28/<branch-name-with-dashes>`.

## Go back to this point

From the repository (needs access to the private repo):
```bash
git fetch origin --tags
git switch -c recover-agent-a restore/2026-10-28/agent-a-next
git switch -c recover-agent-c restore/2026-10-28/agent-c-d1-schema
git switch -c recover-snapshot restore/2026-10-28/snapshot-orchestrator
```
A tag never moves. Later commits on a branch do not change what the tag points to.

From the offline copy (no network):
```bash
git clone C:/WORK/bundles/all-2026-10-28.bundle recovered
cd recovered && git branch -a
```

## What is NOT in the pushed repo (kept out on purpose)
- `design/stitch-fnish/`: 59 MB of original zip exports. Their extracted content is in `design/themes/`.
- Two lines of `.agent/orchestrator-notes.md` were redacted in the pushed copy: the owner's email address and the shared test server's addresses.
- In the Beam worktree, three files are untracked and were not committed: `20261027_booking_cancellation_permission.sql`, its verify file, and `supabase/`. They belong to no approved ticket and were never applied anywhere.
- No `.env`, no keys, no tokens. A scan of all 285 existing commits found no `.env` and no `service_role` key, only the public `anon` key hard-coded in three source files (removal planned in ticket 13-07).

The unredacted notes and the zip exports are in the local file `C:/WORK/bundles/untracked-2026-10-28.zip` on the owner's machine.
