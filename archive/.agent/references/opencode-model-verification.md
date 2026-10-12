# OpenCode-Model-Verification

Session: 2026-08-30 12:40+07
Task: Phase 03 implementation via Opencode

## Verification Steps (run in order)

1. Binary check:
   ```bash
   opencode --version  # → 1.18.25
   which -a opencode   # → /c/Users/GAMER/AppData/Roaming/npm/opencode
   ```

2. Auth check:
   ```bash
   opencode auth list
   # Look for: OpenCode Go api (1 credentials)
   ```

3. Smoke test:
   ```bash
   opencode run 'OPENCODE_SMOKE_OK'
   # Expected: "OPENCODE_SMOKE_OK" + exit 0
   ```

## Working Default Model

- `ling-3.0-flash-fin-free` (OpenCode Go API)
- Alternative if rate-limited: `openrouter/anthropic/claude-sonnet-4`

## Model Switch Pattern (Claude → Opencode Loop)

When switching from Claude to Opencode for worker tasks:

```bash
# Force specific model
opencode run 'Implement T03-01...' --model ling-3.0-flash-fin-free

# Attach multiple context files
opencode run '...' -f specs/03-housekeeping-board.md -f .agent/tickets/T03-01.md
```

## Common Errors & Fixes

| Error | Root Cause | Fix |
|-------|-----------|-----|
| "model not found" | API key wrong/different provider | `opencode auth login` with correct provider |
| Timeout or slow | Wrong model/quota exhausted | Switch to `ling-3.0-flash-fin-free` or `claude-sonnet-4` |
| No output | Auth missing or rate limit | Check `opencode auth list`, use alternative model |
| `/exit` opens dialog | Invalid OpenCode command | Use `Ctrl+C` to exit TUI |

## Session-Specific Notes

- User prefers: concise Thai responses, file:line citations, build/test proof
- Phase 03 tickets: T03-01 (recon), T03-02 (UI), T03-03 (router), T03-04 (tests)
- Expected output: `pnpm check`: 0, `pnpm test`: 254+ passed, `pnpm build`: OK
- No push until human review per Hard Rule 3