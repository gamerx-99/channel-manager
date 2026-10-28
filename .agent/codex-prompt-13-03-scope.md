# Codex prompt — 13-03 scope answer (orchestrator, 2026-10-28)

The orchestrator verified 13-02b (b0ae005) and the uncommitted 13-03 work: scope and money tests pass (17/17), the full suite passes 638 (7 known env failures).

---- PASTE BELOW THIS LINE ----

Answer to your 13-03 scope question (OPEN_QUESTIONS 2026-10-28):

**Port every `server/db/*` repository to D1 in this ticket, as NEW D1 repositories behind your scope layer. Do NOT rewire the live callers.**
- The live site still runs on Supabase until the cutover in 13-08, and Better Auth (13-05) does not exist yet. So `server/routers*` and the Express app keep calling the existing Supabase repositories unchanged.
- For each `server/db/<x>.ts`:
  - Create `server/d1/<x>.ts` with the same exported function names and equivalent behaviour, implemented with Drizzle on D1. Every hotel-data function takes `D1CallerContext` and goes through the scope checks.
  - Add `server/d1/<x>.test.ts` (in-memory SQLite) covering the happy path plus a cross-hotel denial.
- Switching callers from Supabase to D1 is a later ticket (13-07/13-08). Record that in specs/13.
- Accepted ASSUMPTION: platform summary `plan` and `payment_status` stay null until spec 12 billing exists. Never substitute guest payment data.

Steps:
1. Commit what you have now as its own commit: `feat(d1): scoped data layer primitives and money helper (13-03a)`. This covers scope.ts, money.ts, their tests and the support-audit migration. Include the handoff entry.
2. Then port the repositories one module per commit: `feat(d1): port <module> repository (13-03)`. Include the double-booking guard as an atomic `INSERT … SELECT … WHERE NOT EXISTS` with a `changes()` check, and the rate-override overlap guard. Each needs a test that tries the overlapping insert twice and proves the second one fails.
3. Still do NOT port `channelPerformance`, or the synthetic-success fallback in `saveHotelSiteConfig`.
4. When every module is ported, run `pnpm test`, `pnpm check` and `pnpm build` and paste the counts. Then set the 13-03 Status in specs/13 to DONE, resolve the OPEN_QUESTIONS entry with this answer, and write the handoff.

Do not touch `client/src/`, the root `.sql` files or `.env`. Do not push or deploy. If one module is too large to port faithfully (e.g. OTA iCal sync), port the rest, list that module in OPEN_QUESTIONS with the reason, and stop there.
