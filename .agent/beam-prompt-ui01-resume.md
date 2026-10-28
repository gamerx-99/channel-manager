# Beam prompt — resume UI-01 (stopped at the OpenRouter credit limit)

Use it in the same OpenCode session "UI-01 mock cleanup" (ses_e811ac686ffewbowjKbdk4zj4J) if possible. It also works in a new session.

---- PASTE BELOW THIS LINE ----

Resume ticket UI-01 in C:\WORK\channel-manager-a (branch agent-a/next). The previous run stopped at a credit limit. All the edits below are already in the working tree, UNCOMMITTED. Do not redo them and do not revert them.

Already done (verified by the orchestrator):
- Section 0 (PrivateRoute pending signup, Financials MFA message).
- A–F (removed the quick links, fake checklist, dead tabs, disabled buttons, topbar search, toast-only menu items).
- H (ChannelPerformance page, route and tests deleted).
- G (th.ts has no Supabase/RLS text).
- New tests: `client/src/pages/UI01RemovedMarkers.contract.test.ts`, `client/src/lib/i18n/i18n.ui01.test.ts`, `client/src/components/auth/PrivateRoute.pendingSignup.test.tsx`.
- `pnpm check` passes.

Remaining work. Scope is `client/src/` only. Never read `.env`. Do not touch `.sql`, `server/`, `worker/`, `shared/`, `wrangler.toml` or `vercel.json`.
1. `client/src/lib/routeScope.ts:28` still references `/dashboard/channels`. Remove that route entry. If `client/src/lib/routeScope.test.ts` asserts it, update that assertion and say why in the handoff (the page was removed by owner decision 2026-10-28).
2. Remove the now-unused i18n keys `home.moreQuickActions` and `home.moreQuickActionsToast` from both th.ts and en.ts, plus any other key whose only usage you deleted. Search with Grep for each key before deleting it.
3. In en.ts, make sure no value outside the `websiteBuilder` group still contains "Supabase", "RLS", "Row Level", "hotel_users" or "Postgres". Rewrite those values in plain hotel-owner language. Skip WebsiteBuilder entirely.
4. Prove the new tests are real:
   - Temporarily restore ONE removed marker (e.g. put back `quick-panel` in HotelDetail.tsx).
   - Run `pnpm vitest run client/src/pages/UI01RemovedMarkers.contract.test.ts` and paste the FAILING output.
   - Undo that temporary change and run it again; paste the PASS output.
   - Do the same for the i18n test by temporarily adding "Supabase" to one th.ts value.
5. Run the full `pnpm test`, `pnpm check` and `pnpm build`. Paste the real tail output.
   - Passed must be above 629.
   - The only acceptable failures are the 7 known credential-env tests (4 inviteAuthUser + 3 Supabase credential tests).
6. Commit in this order, using conventional messages that end with "(UI-01)":
   - `fix(auth): refresh hotels after pending signup and surface errors (UI-01)` (section 0 files)
   - `fix(ui): remove dead controls and fake status panels (UI-01)` (A–F)
   - `refactor(ui): remove channel analytics page (UI-01)` (H + routeScope)
   - `fix(i18n): replace developer jargon with plain language (UI-01)` (G + key cleanup)
   - `test(ui): contract tests for UI-01 removals (UI-01)`
   - If a file belongs to two sections, put it in the earlier commit.
7. Add a `.agent/handoff.md` entry covering what changed, the test counts before and after, and any assertion you changed with the reason.

Do NOT commit the untracked `supabase/` folder or the `20261027_booking_cancellation_permission.sql` and `verify_...` files; leave them untracked. Do not push or merge.
If something above turns out to be wired to a real feature, write "NOT A BUG: <file:line> — <what it does>" and skip it.
End with a short report: commit hashes, test counts, and anything you skipped.
