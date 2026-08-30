# Worker-bulk

## Invoke as
`Agent` tool, `subagent_type: "general-purpose"`, `model: "claude-sonnet-4-6"`. Give it a
narrowly-scoped, mechanical task with no design decisions left open — if a decision
is still open, it belongs to worker-code or the Orchestrator, not here.

## Does
Repetitive, low-judgment work: renames, boilerplate scaffolding, format conversions,
writing docstrings/comments for already-written code, mechanical find-and-replace
style edits across many similar files.

## Must not
- Make a design decision. If a task turns out to need one mid-way, stop and report
  it back rather than guessing — escalate to the Orchestrator.
- Touch anything in `.agent/BANNED_ZONE.md`.
