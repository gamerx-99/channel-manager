# Codex prompt: guided tour and help guide for new hotel owners

Read `CLAUDE.md`, `.agent/BANNED_ZONE.md`, `.agent/DECISIONS.md` (the 2026-11-04 "Guided tour" row), `specs/ui-house-style.md` and `docs/thai-glossary.md` first.

## Where to work

- Worktree: `C:\WORK\channel-manager\.claude\worktrees\account-deletion`
- Branch: `feat/signup-integration`
- You cannot commit. Leave the work uncommitted; Claude reviews and commits it.
- Do not push, deploy or apply migrations remotely. Do not touch `client/public/_headers` or `.github/`.
- Do not edit `client/src/index.css`. Put styles in a new CSS file next to the new component.
- If `pnpm` fails with `ERR_PNPM_STORE_DIR_OPEN_OPERATION_LOCK`, call the binaries in `.\node_modules\.bin\` directly (`vitest.cmd`, `tsc.cmd`, `vite.cmd`, `wrangler.cmd`). Do not stop.
- Write the `.agent/handoff.md` entry and your report **before** the final checks, so a crash does not lose them.

## Owner decision (2026-11-04). Do not change it or add to it.

A short spotlight tour: a dark overlay with a cut-out highlighting the element to click.

1. Go to the **hotel settings** page, point at the required fields, then "ถัดไป".
2. Go to the **room settings** page, and show how to add a room or fill in its details.
3. Finish with a message that both steps are done, and a **"เริ่มใช้งาน"** button.

- **Auto-start:** the tour starts automatically after the first sign-up while either page is not yet set up.
- **Controls:** every step has **"ข้าม"** (skip). A **"ดูคู่มืออีกครั้ง"** entry restarts it at any time. Put it in the user menu or the help page.
- **No OTA step.** OTA / iCal sync stays hidden.

## Task

1. **Find the two pages.** Look at `client/src/App.tsx`: hotel settings is likely `/hotels/:id`, and room types are on the same page or one linked from it. Point the tour at the real elements; add `data-tour="..."` attributes to them. Write which pages and elements you used in the report.
2. **"Set up" must be checkable.** Write a pure function in `client/src/lib/tour/tourProgress.ts`, plain data in and plain data out, with unit tests:
   - hotel settings done = the required hotel fields are filled. Use the fields the form already marks as required; invent no new ones;
   - rooms done = at least one room type with at least one room;
   - the tour should auto-start when either is false and the user has not skipped or finished.
3. **The tour component.** Build it yourself, with no new npm dependency. Name it `client/src/components/tour/GuidedTour.tsx`, with `guidedTour.css` and a `useGuidedTour.ts` hook.
   - The overlay must not block the highlighted element; the user can click it.
   - It recalculates on resize and scroll.
   - It works at 375px: the tooltip sits below or above the target and never off screen.
   - Keyboard: Esc means skip. Focus moves into the tooltip, and the buttons are real `<button>`s.
   - It respects `prefers-reduced-motion`.
   - If a target element is missing, the step shows a centred message instead of crashing.
4. **Remembering skip and finish.** Store it per user, server-side, so it follows the user across devices.
   - Prefer an existing per-user place if there is one.
   - Otherwise add a small table (`user_onboarding`: `user_id` PK, `tour_completed_at`, `tour_skipped_at`, `updated_at`) and generate the migration with `pnpm exec drizzle-kit generate --config drizzle.d1.config.ts`. Check the journal lands in `drizzle/d1/meta`. Apply it locally only.
   - Add tRPC procedures for the signed-in user's own row only, plus a router test that a user cannot read or write another user's row.
5. **Help guide page** (`/help/getting-started`, for signed-in users), built from `.tsx` + `.ts` + `.css`:
   - each tour step explained in plain Thai, with a screenshot;
   - common problems;
   - how to ask for help: `support@hayhostth.com`, plus the existing support-access feature if relevant.
   - **Screenshots:** take them from local `wrangler dev` at 1280px. Save them under `client/public/help/`, at no more than about 150 KB each. They must show only local test data, never real customer data.
   - If you cannot take screenshots, leave a clearly marked placeholder and say so.
   - Common problems: only ones the product really has (for example, the public page is not visible until the hotel is published, or PromptPay is not set). Do not invent features.
6. **Text:** Thai first and natural, per `docs/thai-glossary.md`, plus English in the i18n files. Placeholders use `{{name}}`. The glossary test must pass.

## Tests and checks

- Unit tests for `tourProgress.ts`.
- A router test for the onboarding procedures.
- A string-contract test for the help page and the tour (route registered, `data-tour` markers present, skip button present).
- `pnpm test`, `pnpm check` and `pnpm build`: paste the real output.
- **Browser** (local `wrangler dev`):
  - sign up a new local owner;
  - confirm the tour auto-starts;
  - go through all 3 steps;
  - check that skip works and that "ดูคู่มืออีกครั้ง" restarts it;
  - at 1280px and at 375px.

  If the browser cannot be used, say so plainly. Never claim a check you did not do.

## Report

1. The files changed.
2. The pages and `data-tour` targets used.
3. The migration file, if any.
4. Test, check and build output.
5. Browser results, and anything not checked.
6. Every ASSUMPTION and every logged question.
