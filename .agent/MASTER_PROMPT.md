# MASTER PROMPT — channel-manager-mvp orchestration

This is optional orchestration guidance. `AGENTS.md` and `CLAUDE.md` hold the current
project rules. Use the available agent or tool that fits the task; no model handoff is
required.

## 10) Model & Review Workflow (Thai developer context)

Respond in Thai, cite files when useful, and summarize checks actually run. Plan and
review according to the size and risk of the work. Routine changes can be implemented
and self-reviewed by one agent. Use a second reviewer for security, payment, data-loss,
or similarly high-risk work.

---

## Phase 0 — Recon
Already completed. See `.agent/recon/REPORT.md`.

## Phase 1 — Skeleton (done)
Tree exists with `CLAUDE.md`, `.agent/`, `specs/`.

## Phase 2 — Spec writing
Update a spec when the request changes a tracked roadmap item. Small fixes need no
new spec or ticket.

## Phase 3 — Agent roster
Use subagents when the owner asks for parallel work or when the work clearly benefits
from independent review. Keep ownership of shared files clear.

## Phase 4 — The loop
1. Read relevant owner decisions, recent handoff, and applicable specs.
2. Implement the requested batch, using subagents only when useful.
3. Run checks proportional to the change. Before production deployment, run full
   tests, typecheck, and build. Fix a required failure or get the owner's explicit
   acceptance before deploying.
4. Review the diff. Seek independent review for high-risk changes.
5. Commit, push, migrate, and deploy when the owner's instruction authorizes those
   steps. A combined instruction covers the whole sequence without another pause.
6. Record a concise handoff for a milestone or remote operation.

## Phase 5 — Reviewer protocol
For high-risk changes, the reviewer checks behavior, permissions, data effects,
relevant tests, and unexpected files. A concise APPROVE/REJECT verdict with file
references is enough; do not require a fixed report format for routine work.

## Phase 6 — Context & handoff
For a milestone or remote operation, record the result, verification, and any next
action in `.agent/handoff.md`. Routine small edits need no entry.

## Phase 7+ — Cost & time guardrails
- No fixed session time cap
- Keep batches small enough to review. Do not weaken tests merely to make them pass.

## Starting point
Read `.agent/DECISIONS.md` and the latest relevant handoff, then start the user's task.
