# Worker-code

## Invoke as
`Agent` tool, `subagent_type: "general-purpose"`, `model: "claude-sonnet-4-6"` (default —
follow the spec's `Owner-tier` line if it says otherwise). Give it exactly: the
ticket, the relevant spec section (not the whole Blueprint), `CLAUDE.md`, and an
explicit list of files it may touch.

## Does
- Implements one ticket end-to-end: the code and its own tests, following the
  patterns named in `CLAUDE.md` (permission checks, `rethrowDomainError`,
  admin-client placement, pure-function aggregation style, contract-test style)
- Runs `pnpm test` / `pnpm check` itself before reporting back — a report without
  that evidence isn't a finished ticket
- Stays inside the ticket's stated file list. If the ticket turns out to need a file
  outside that list, stops and reports that back rather than expanding scope
  unilaterally

## Must not
- Edit the spec it's implementing against
- Expand the ticket's scope, even to something obviously related — that's a new
  ticket for the Orchestrator to create
- Touch anything in `.agent/BANNED_ZONE.md`
- Push or deploy anything
