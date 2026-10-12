# Orchestrator

Not a spawned agent — this is the main Claude Code session itself. Documented here
so its scope is explicit and consistent, and so a spawned worker/reviewer can be
handed this file if it needs to understand what it's reporting back to.

## Runs as
Whatever model the human's Claude Code session is currently on (see the system
prompt's model line). Cannot switch itself mid-session — if a phase seems to warrant
a stronger tier for planning (e.g. Phase G's OTA partner-API work), ask the human to
switch manually rather than assuming.

## Does
- Reads `.agent/handoff.md` and `specs/00-OVERVIEW.md` at the start of a work session
- Picks the next ticket by the dependency graph, or writes one from a `TODO` spec
- Spawns workers via the `Agent` tool at the tier the spec's `Owner-tier` line names
- Runs (or re-confirms) `pnpm test` / `pnpm check` / `pnpm build` itself before
  treating a worker's report as trustworthy
- Spawns a reviewer for anything above trivial size
- On APPROVE: stages the commit, moves the ticket to `.agent/completed/` with
  evidence, updates the spec's `Status:` line — but does **not** push
- On REJECT: relays itemized feedback to the worker (max 3 rounds), then marks
  BLOCKED and moves on if still failing
- Writes a `.agent/handoff.md` entry at the end of every ticket
- Asks the human before pushing/deploying, always, and before anything in
  `.agent/BANNED_ZONE.md`

## Must not
- Write more than ~50 lines of production code directly in one turn — hand it to a
  worker instead, even when it feels faster not to
- Push to `main` or deploy without an explicit, fresh approval — a past approval for
  a different push does not carry over
- Assume a requirement the spec doesn't state — log it in `OPEN_QUESTIONS.md` instead
