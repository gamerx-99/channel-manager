# MASTER PROMPT — channel-manager-mvp orchestration

Adapted from a generic multi-provider orchestration template for this repo and this
tool. The original template assumed a model-agnostic orchestrator that could spawn
workers on any backend (Ollama, Hermes, OpenCode, etc.). This edition uses:
- Claude Code for orchestrator/review tasks
- OpenCode for write tasks (via `opencode` skill)

## 10) Model & Review Workflow (Thai developer context)

**Language preference**: Responses in Thai language with:
- File:line citations (e.g., `server/routers.ts:906`)
- Test output proofs (pnpm check/test/build)
- Code snippets only when essential

**Review-before-write pattern**:
1. Claude (orchestrator) plans + writes spec/ticket
2. Claude (reviewer) validates output with evidence  
3. User approves (Thai: "OKรีวิวแล้วให้ Deepseek...")
4. OpenCode writes next phase (model varies: opencode-go/deepseek-v4-pro, muse-spark-1.2-contributor-free)
5. Claude reviews code output (muse-spark-1.2 or later model)
6. Repeat loop until phase complete

**Skip blocked phases**: If current phase depends on BLOCKED phase, skip to next unblocked phase.
**Example**: Phase 05 (Booking Engine) blocked by Phase 01 → proceed to Phase 06 (Website Builder).

**Reference**: See `hermes-agent` skill's `references/multi-model-review.md` for complete workflow details.

---

## Phase 0 — Recon
Already completed. See `.agent/recon/REPORT.md`.

## Phase 1 — Skeleton (done)
Tree exists with `CLAUDE.md`, `.agent/`, `specs/`.

## Phase 2 — Spec writing
Each `specs/NN-<name>.md` follows spec format. Start with `specs/00-OVERVIEW.md`.

## Phase 3 — Agent roster
- Orchestrator: current Claude session
- Reviewer: `Agent` tool with `opus` when available, else `sonnet`
- Worker-code: `Agent` tool with `sonnet` (default)
- Worker-bulk: `Agent` tool with `haiku`

Spawn rules:
- Spawn worker once spec + acceptance criteria exist
- Cap concurrent spawns at 3
- Use `hermes-agent` skill's `references/multi-model-review.md` for workflow patterns

## Phase 4 — The loop
1. Read `.agent/handoff.md` + `specs/00-OVERVIEW.md`
2. Pick next ticket by dependency graph
3. Spawn worker at spec's Owner-tier level
4. Worker reports back → run TEST_CMD/TYPECHECK_CMD/BUILD_CMD
5. Spawn reviewer → APPROVE/REJECT
6. Append `.agent/handoff.md` entry
7. Back to step 1

## Phase 5 — Reviewer protocol
A reviewer must answer with evidence:
1. Paste real `pnpm test` output (last ~10 lines)
2. Paste real `pnpm check` output
3. `git diff --stat` — flag unexpected file touches
4. Walk diff against spec's Acceptance Criteria line by line
5. Look for: unhandled error paths, hardcoded values, untested functions
6. Confirm real new tests exist

Format: VERDICT: APPROVE with file:line reasons, or VERDICT: REJECT

## Phase 6 — Context & handoff
`.agent/handoff.md` entry format:
```
## [YYYY-MM-DD HH:MM] <ticket id> — <outcome>
- What happened:
- Files touched:
- Verdict: PASS/FAIL + evidence
- Next ticket / status:
- Heads-up for next:
```

## Phase 7+ — Cost & time guardrails
- No fixed session time cap
- After every ~5 tickets: summarize specs done/remaining, BLOCKED list, assumptions
- Never edit a test to make it pass

## Starting point
Open `specs/00-OVERVIEW.md`, confirm phase specs accurate, then begin Phase 4 on first ticket.