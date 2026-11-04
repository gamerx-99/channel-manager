# Codex brief: split the website builder page (restructure plan, phase 2)

Read `CLAUDE.md`, `.agent/BANNED_ZONE.md` and `.agent/plan-restructure-2026-11-04.md` first.

## Where to work

- Folder: `C:\WORK\channel-manager` (main folder), branch `main`. **Do not create a worktree or a branch.**
- Do not push, deploy, or run any `wrangler` command that is not `--dry-run`. Do not commit (Claude commits).
- Claude is editing `client/src/index.css` and `client/src/components/public-hotel/public-hotel.css` at the same time. **Do not touch those two files.**
- Use `.\node_modules\.bin\vitest.cmd run`, `.\node_modules\.bin\tsc.cmd --noEmit` and `.\node_modules\.bin\vite.cmd build` if `pnpm` hits the store lock.

## Task (structure only, no visual or behaviour change)

`client/src/pages/WebsiteBuilder.tsx` is 669 lines: data loading, mutations, draft/publish, image upload, theme picker, text and colour fields, section toggles and preview all in one component, with 4 inline `style={{ }}`.

Split it with the same pattern as the public hotel page (`client/src/components/public-hotel/`):

1. **Logic → `client/src/components/website-builder/useWebsiteBuilder.ts`.** All state, queries, mutations (save draft, publish, upload, delete image), derived values and handlers. Pure helpers such as `defaultConfig` and `isValidHexColor` go in `websiteBuilderRules.ts` with a small unit test (`websiteBuilderRules.test.ts`) for what they actually do today. Do not add new rules or limits.
2. **UI → one component per section** in `client/src/components/website-builder/`, for example: theme picker, photos (hero + gallery, focal point), text and colour, visible sections, draft/publish bar, preview. Choose the split by the sections that exist in the current JSX; do not invent sections. Components take props only; no tRPC calls inside them.
3. **`WebsiteBuilder.tsx`** stays in `client/src/pages/` as a thin page: permission/loading states, calls the hook, lays out the section components. Keep the default export and the route unchanged.
4. **Style → `client/src/components/website-builder/website-builder.css`.** Move the inline `style={{ }}` there, except a value that truly varies at runtime (pass it as a CSS variable). Do not move rules out of `index.css`.
5. Keep every `data-*`, `id`, `className`, `aria-*` and translation key the same, because the guided tour (`client/src/components/tour/`) and tests target them. Search the tour for selectors that point into the builder and confirm they still match.

## Tests

- `client/src/pages/WebsiteBuilder.contract.test.ts` reads source files for markers. When a marker moves to a new file, point the test at the new file (or read all files in the folder). **Never delete or loosen an assertion**, and list each test change with the reason.
- `client/src/pages/WebsiteBuilder.test.tsx` must still pass unchanged if at all possible.
- Run the full `pnpm test`, `pnpm check` and `pnpm build` (or the `.cmd` equivalents) and paste the real output.

## Report (write it to the report file)

1. Files created/changed with line counts (before/after for `WebsiteBuilder.tsx`).
2. What each new file holds.
3. Inline styles moved, and any left with the reason.
4. Each test change with the reason.
5. Real test, check and build output.
6. Anything you were unsure about. Never claim a check you did not run.
