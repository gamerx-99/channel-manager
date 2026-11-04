# Guided tour implementation report (2026-11-04)

## Changed files

- `client/src/lib/tour/tourProgress.ts` and unit test.
- `client/src/components/tour/GuidedTour.tsx`, `useGuidedTour.ts`, `guidedTour.css`.
- `client/src/pages/GettingStarted.tsx`, `gettingStarted.css`, and tour contract test.
- `client/src/App.tsx`, `HotelDetail.tsx`, `ProfileMenu.tsx`, `Topbar.tsx`, `AppShell.tsx`, bilingual dictionaries.
- `server/routers/authRouter.ts`, `server/onboarding.access.test.ts`, `server/d1SchemaParity.test.ts`, `drizzle/d1-schema.ts`.
- `drizzle/d1/20261104000000_user_onboarding.sql` and D1 journal.
- `.agent/OPEN_QUESTIONS.md`, `.agent/handoff.md`, `.agent/guided-tour-report.md`. The owner decision file was left unchanged.

## Pages and targets

- Hotel detail/settings: `/hotels/:id`; spotlight target `data-tour="hotel-settings"` is the existing **Edit hotel** button. On tour start, the existing Edit hotel action opens the form and highlights `data-tour="hotel-settings-fields"`, which wraps the required hotel name, address, and owner contact fields.
- Room setup: same `/hotels/:id` route; `data-tour="room-settings"` marks the room type panel containing the **Add room type** action. The create flow uses a quantity field to create room records under the room type.
- Help: signed-in `/help/getting-started`, linked from the account menu.

## Migration

- `drizzle/d1/20261104000000_user_onboarding.sql` adds the per-user tour state table. Journal metadata was authored in `drizzle/d1/meta/_journal.json` because Drizzle generation failed.
- Drizzle CLI generation could not run: pnpm store lock returned `ERR_PNPM_STORE_DIR_OPEN_OPERATION_LOCK`; direct `drizzle-kit.CMD` then failed with `uv_os_get_passwd returned ENOMEM`. Migration SQL and journal were authored to match the schema, then applied to local D1 only.

## Checks

- Focused tests: final run 4 files, 7 tests passed (tour progress, tour contract, onboarding router, Thai glossary). An earlier six-file focused run also passed 13 tests, including profile menu and schema parity.
- Full Vitest suite: **194 files passed; 1,311 tests passed** (148.82s).
- TypeScript: final `tsc --noEmit` exited 0.
- Vite: final `vite build` exited 0; warning: main JS bundle is 1,263.64 kB and exceeds the 500 kB advisory threshold.
- Worker: final `wrangler deploy --dry-run --outdir dist-worker` exited 0; bundled 3,790.62 KiB (gzip 708.41 KiB).
- Migration: `wrangler d1 migrations apply hayhost-dev --local` succeeded; 2 SQL commands, migration status ✅. No remote apply.
- The pnpm command failed with the store lock; direct binaries were used. Vitest needed `TEMP`/`TMP` redirected to `.tmp`. Drizzle generation failed with `uv_os_get_passwd returned ENOMEM`, so its matching SQL and journal entry were authored manually.
- An initial full test run exposed two transient route-order failures while the help route was being moved and a schema parity expectation failure. After fixing route order and including the new D1-only table in the schema parity list, the final full run passed.

## Browser

`wrangler dev` started locally at 127.0.0.1:8787 after redirecting Wrangler config/temp writes into `.tmp`. Browser inventory was empty and CUA reported “browser access host is unavailable”. Sign-up, auto-start, all steps, skip/restart, and 1280px/375px rendering were not checked. No screenshots were captured; the guide clearly labels both screenshot areas as placeholders.

## Assumptions and questions

- ASSUMPTION: setup is measured against the selected hotel; required fields match the current hotel edit form; the room type quantity operation creates room records; help guidance reflects current publish behavior. These are recorded in `.agent/OPEN_QUESTIONS.md`.
- Logged questions: no new unresolved product question. Browser and screenshot limitations are recorded above.
