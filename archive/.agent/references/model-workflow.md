# Model Switching & Review Workflow (Thai Developer Session)

## Session Signal Patterns

### Language Preference
Respond in **Thai language** with:
- File:line citations
- Test output proofs  
- Minimal explanations before/after fixes

### Review-Before-Write Loop
1. **Claude (Orchestrator)**: Plan + write spec/ticket
2. **Claude (Reviewer)**: Validate with real evidence (pnpm test/check/build)
3. **User approval**: Thai confirmation like "OKรีวิวแล้วให้ Deepseek..."
4. **OpenCode**: Write code (model varies)
5. **Claude**: Review output
6. **Repeat** until phase complete

### Phase Skipping
When current phase is **BLOCKED** by dependency:
- Example: Phase 05 Booking Engine blocked by Phase 01 Payments
- **Skip to next unblocked phase** (Phase 06 Website Builder)
- Document skip reason in `.agent/handoff.md`

### Model Notes
- Default: `muse-spark-1.2-contributor-free` (Claude via opencode-free)
- Write phase: `opencode-go/deepseek-v4-pro` or similar
- Review: `muse-spark-1.2-contributor-free` or sonnet/opus when available

## Reference Sessions
- Session 2026-08-30 11:50-14:30: Phases 09, 02, 03, 04 (MFA → Pricing → Housekeeping → Communications)
- Session 2026-08-30 14:30+: Phase 05 blocked, proceeded to 06/08