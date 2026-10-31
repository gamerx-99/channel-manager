# Codex Prompt — C1: Remove Supabase from server code (FIX-PLAN Phase 3)

Working directory: C:\WORK\channel-manager-c, branch agent-c/review-fixes (create from main).

Goal: Delete all Supabase server paths so only D1 remains.

Tasks:
1. Delete server/db.ts, server/db/* (except scope.ts, money.ts, types.ts — move needed ones to server/d1/ or shared/), server/supabase.ts, server/otaSync.ts, server/otaIcalRoutes.ts, server/otaScheduler.ts (Supabase versions).
2. Remove rlsClient and requireHotelPermission from routerUtils.ts if unused.
3. Delete the 4 credential tests (server/supabase.*.test.ts) — write reason in commit.
4. Remove @supabase/supabase-js from dependencies.
5. Close known issue 3 (hard-coded anon key).
6. Verify no "supabase" in server/ worker/ except historical comments.

Acceptance: pnpm check, pnpm test, pnpm build, pnpm build:worker all pass. Guard test R0 allowlist empty.
Do not push/deploy.
