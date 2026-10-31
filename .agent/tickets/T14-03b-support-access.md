# T14-03b — D1 permission controls and owner-approved support access

Status: DONE — locally verified and independently approved (2026-10-30); uncommitted per instruction
Branch: `agent-s/support-access`; worktree: `C:\WORK\channel-manager-s`.

## Delivered

- Five protected `access` procedures: permission updates, grant, revoke, owner audit,
  platform summary. Permission checks precede repository calls and domain errors
  preserve their codes.
- Existing D1 membership overrides, scope authorization, grants and audit tables
  reused. Exact 1/24/72/168h durations; view/edit; account-bound support keys.
- Owner-reserved support control and ownership-transfer permissions are excluded
  from support keys and staff overrides. Staff cannot edit themselves, owner/platform
  accounts, outranking colleagues or capabilities outside their own authority.
  Invite, role-reset, removal and transfer paths obey those same bounds.
- Active support permissions are projected at request time for client mirroring;
  D1 checks persist on every hotel action. Stale edit projections cannot mutate a
  booking after revocation. View-only grants cannot mark notifications read.
- Hotel/OTA aggregates use active hotel scopes; revoked booking-view permissions
  remove bookings from hotel/dashboard projections. Super admins cannot use
  hotel-data scopes or global notification bodies/mutations. Platform summary is
  the five allowed fields, with null billing values.
- Support reads, writes and permission denials are audited, including denials before
  repositories run. Canonical hotel fields and per-procedure resource allowlists
  prevent unknown raw request fields from corrupting audit trails or recording
  guest bodies. Audit storage failures fail closed.

## Security evidence

`server/d1/supportAccess.test.ts` exercises real SQLite-backed D1 repositories and
real tRPC calls (not authorization stubs). It covers no-key denial, all four exact
expiries, rejected durations, view/edit separation, no manage_staff/owner controls,
revocation, exact expiry, cross-hotel denial, owner-only lifecycle/audit, mixed-role
super-admin denial, overlapping keys, refreshed context, permission persistence,
pre-repository audit, aggregate filtering, audit failure, role/invite/removal
escalation, stale-key payment mutation and forged audit aliases. Mocked boundary
checks are in `server/supportAccess.access.test.ts`.

The three added aggregate bypass tests failed before the OTA/global-notification
fixes (`.agent/support-access-regressions.log`). They pass after the fixes.

## Existing test corrections (Hard Rule 6)

The task explicitly forbids super-admin hotel data. Old mocked tests expected that
bypass in room types, housekeeping, messaging, rate overrides, media, shared
permission checks and routeScope. They now assert FORBIDDEN plus no repository
call; the original not-found assertions still use authorized owner fixtures. The
notification test now proves global platform calls expose no hotel bodies and
cannot change flags. The toggle-coverage test excludes the new owner-reserved,
non-switch controls. No assertion was weakened to accept an implementation failure.

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

- Live environment/browser verification was not performed. No deploy is authorized.
- No commits, push, merge or deployment attempted, as explicitly instructed.
- Other parts of the 14-03 parent and 14-05 are outside this ticket.

## Reviewer

VERDICT: APPROVE — independent reviewer applied `.agent/agents/reviewer.md`, inspected the full diff plus untracked source/tests, confirmed all security checklist items and real test/check/build evidence. See `.agent/reviews/T14-03b-14-04.md`.
