# T14-04 — Per-staff permission switches and owner support approval

Status: DONE — locally verified and independently approved (2026-10-30); uncommitted per instruction
Branch: `agent-s/support-access`; worktree: `C:\WORK\channel-manager-s`.

## Delivered

- HotelStaff uses the 13 shared switches, dependency closure and permission-edit
  checks; saved overrides refresh staff and auth state. Ownership transfer controls
  mirror the owner-reserved permission.
- Owner support screen provides exactly 1/24/72/168 hours, view-only/edit modes,
  revoke, expired/revoked indicators and who-accessed-what history.
- Support banner shows mode and expiry. Auth and hotel visibility refresh every
  15 seconds; server-side D1 authorization remains authoritative immediately.
- routeScope and shell navigation use the selected hotel's resolved membership,
  stored overrides and support expiry; no cross-hotel role inheritance or
  super-admin hotel-data route bypass.
- Platform overview consumes only the safe summary endpoint. The financial
  dashboard mirrors its existing owner-only server gate. Owner-granted financial
  amount visibility is preserved, and broader report semantics are an open product
  question rather than a permission expansion in this ticket.

## Tests

- `SupportAccess.contract.test.ts` covers every changed/new page's registration,
  permission gate and UI markers plus shell/banner wiring.
- Behavioural UI tests verify dependency-enabled switch payloads, locked self/owner
  controls, exact approval durations/default mode, revoke payload and owner gate.
- `routeScope.permissions.test.ts` covers stored revokes/grants, selected hotel,
  cross-hotel support denial, expiry/revocation, mixed super-admin identity and the
  owner-only financial dashboard. Existing HotelStaff confirmation assertions are
  unchanged; its owner fixture now supplies the actual scoped transfer permission.

## Validation

The global `pnpm` shim was denied access to its external store lock. These are
real outputs from the installed pnpm CLI, run with package-manager version
management disabled (no dependency install or metadata workaround):

```text
node node_modules/pnpm/bin/pnpm.cjs test
 Test Files  115 passed (115)
      Tests  842 passed (842)
   Start at  22:35:35
   Duration  78.17s (transform 14.72s, setup 3.41s, collect 145.41s, tests 127.77s, environment 73.16s, prepare 57.63s)
```

```text
node node_modules/pnpm/bin/pnpm.cjs check
> channel-manager-mvp@1.0.0 check C:\WORK\channel-manager-s
> tsc --noEmit
```

```text
node node_modules/pnpm/bin/pnpm.cjs build
- Adjust chunk size limit for this warning via build.chunkSizeWarningLimit.
✓ built in 43.26s

  dist\index.js          334.1kb
  dist\vite-7MXDACVA.js    2.8kb

Done in 385ms
```

All three commands exited 0. Build also emits the existing >500 kB chunk advisory.
Full logs remain `.agent/support-access-{test,check,build}.log` locally.


## NOT DONE

- Manual browser/visual verification was not run; no live environment changed.
- A future decision to make the financial report follow staff overrides remains
  outside scope; the owner-only report restriction is preserved on both sides.
- No commits, push, merge or deployment attempted, as explicitly instructed.

## Reviewer

VERDICT: APPROVE — independent reviewer applied `.agent/agents/reviewer.md`, inspected the full diff plus untracked source/tests, confirmed all security checklist items and real test/check/build evidence. See `.agent/reviews/T14-03b-14-04.md`.
