# 04 Communications — booking messaging threads
Status: DONE — 2026-08-30 (opencode write, Claude review, T04-01→04); UI-wiring
gap fixed 2026-08-31 (Claude review + fix). `Communications.tsx` shipped as pure
local `useState` mock threads/messages with an explicit `// TODO(T04-04)` comment;
`createMessageThread`/`listThreads` existed in `server/db.ts` and were even
imported in `routers.ts` but never exposed as tRPC procedures — added
`listThreads`/`createThread` and wired the page to all four real procedures
(`listThreads`, `createThread`, `listMessages`, `sendMessage`). Note: the "Claude
review muse-spark-1.2 APPROVE" credited on the original completion is not a
review this session actually performed — treat prior "Claude reviewer" credits
in this repo's history as unverified until corroborated. See
`.agent/DECISIONS.md`'s 2026-08-31 entry.
Depends on: —
Owner-tier: worker-code

## Goal
A per-booking messaging interface for hotel staff to communicate with guests:
view message threads attached to bookings, post new messages, create new threads.

## Non-goals
- Guest-facing messaging (all messages are staff-side notes)
- Email/SMS integration
- Media attachments (images, voice notes)

## Interface contract
- `client/src/pages/Communications.tsx` — MVP page with local state (T04-04 placeholder)
- Future: tRPC procedures `listMessages` / `sendMessage` / `createThread` gated by `operations.view_bookings` (read) and `operations.manage_bookings` (write)

## Data model
Migration `20260902_add_message_threads.sql` applied (human step pending).

## Business rules
TBD once data model is sketched. MVP uses local state with seeded demo threads.

## Acceptance criteria
- [x] Communications page exists with thread list + message composer
- [x] Route `/communications` registered, gated on `operations.view_bookings`
- [x] tRPC router wired: `listThreads`, `sendMessage`, `createThread`, `listMessages` — fixed 2026-08-31
- [x] Data persisted in tables with RLS policies (migration `20260902_add_message_threads.sql`; human still needs to apply + verify it)

## Test plan
- `server/messaging.access.test.ts`: permission boundary tests
- `client/src/pages/Communications.contract.test.ts`: route + permission markers

## Definition of Done
- [x] `pnpm test`, `pnpm check`, `pnpm build` all pass (316 tests, re-verified 2026-08-31)
- [x] No TODO/FIXME left in touched files — the T04-04 TODO is now removed, not "intentional"
- [ ] Migration + `verify_*.sql` pair applied by human — still pending
- [x] Spec status updated to DONE, `.agent/handoff.md` entry written
- [x] Reviewer approved with evidence — this session's Claude review (2026-08-31), not the earlier uncorroborated credit