# Website builder restructure, phase 2 — report

## Status

Partial. The logic extraction, rules tests, stylesheet, and source-contract updates are in place and verified. The requested UI extraction into one component per builder section is **not complete**: the existing builder JSX still lives in `WebsiteBuilder.tsx`, which is 483 lines. This is not a completed ticket.

## Files and line counts

- `client/src/pages/WebsiteBuilder.tsx`: 717 lines before; 483 after. It uses the hook and still contains the existing UI markup.
- `client/src/components/website-builder/useWebsiteBuilder.ts`: 113 lines; query/mutation setup, state, derived config/media values, permissions, draft syncing, upload/delete/hero/focal point/save handlers.
- `client/src/components/website-builder/websiteBuilderRules.ts`: 35 lines; `SiteConfig`, `defaultConfig` and `isValidHexColor` with their existing behavior.
- `client/src/components/website-builder/websiteBuilderRules.test.ts`: 20 lines; covers the current defaults and six-digit hex validation.
- `client/src/components/website-builder/website-builder.css`: 4 lines; builder classes for accent swatches, focal markers, preview accent colors and object positions.
- `client/src/pages/WebsiteBuilder.contract.test.ts`: 136 lines; source search now includes the page and builder folder. No assertions were removed or weakened.
- `client/src/pages/HotelDetail.contract.test.ts`: 55 lines; source read for the hotel query initializer now points to the hook. Its assertion is unchanged.
- `.agent/handoff.md`: appended one phase 2 entry.

The worktree already had unrelated user/Claude changes before this task, including `.agent/DECISIONS.md`, `.claude/launch.json`, `CLAUDE.md`, `client/src/index.css`, `client/src/components/public-hotel/public-hotel.css`, and `specs/ui-house-style.md`. I did not edit the two CSS files assigned to Claude.

## Inline styles

The original JSX had seven inline style attributes (four object-literal forms plus three conditional object forms). Static styling was moved to CSS classes. Runtime color, contrast color, focal coordinates, and photo object position remain as inline CSS custom properties because their values come from current builder state.

## Test changes and reasons

- `WebsiteBuilder.contract.test.ts`: its source string now concatenates the page with files in `components/website-builder/`. The existing tRPC, permission, validation, marker, translation, and public preview assertions remain intact after logic/UI markers moved.
- `HotelDetail.contract.test.ts`: its builder source read now points to `useWebsiteBuilder.ts`, where URL query initialization moved. The exact assertion is unchanged.
- Added `websiteBuilderRules.test.ts` to cover the pre-existing default config and hex color helper behavior.
- `WebsiteBuilder.test.tsx` was not changed.

Tour selector search found no builder-specific `data-tour` target in `client/src/components/tour/`. Existing `data-*`, ids, classes, aria attributes, translation keys, route and default export were retained in the page JSX.

## Verification output

Full tests, with `TEMP` and `TMP` redirected to the workspace `.tmp` after a direct run hit Windows Temp `EPERM`:

```text
Test Files  196 passed (196)
     Tests  1321 passed (1321)
   Start at  15:35:52
   Duration  250.94s (transform 79.99s, setup 13.40s, collect 636.07s, tests 426.89s, environment 292.19s, prepare 109.49s)
```

Type check:

```text
.\node_modules\.bin\tsc.cmd --noEmit
(exit code 0; no output)
```

Vite build:

```text
✓ 3537 modules transformed.
rendering chunks...
computing gzip size...
../dist/public/index.html                          20.23 kB │ gzip:   4.40 kB
../dist/public/assets/index-qh0o033j.css          240.82 kB │ gzip:  43.87 kB
../dist/public/assets/vendor-react-D_pAEV2C.js     17.51 kB │ gzip:   6.66 kB
../dist/public/assets/vendor-query-YG8if8Ey.js     84.96 kB │ gzip:  23.67 kB
../dist/public/assets/vendor-ui-DZo5lbeh.js       421.09 kB │ gzip: 113.71 kB
../dist/public/assets/index-C89nrcAA.js         1,271.43 kB │ gzip: 336.01 kB
(!) Some chunks are larger than 500 kB after minification.
✓ built in 1m 13s
(exit code 0)
```

## Uncertainty / remaining work

The brief says the UI should be split into one component per section and the page should be thin. That structural step remains, so this report does not claim completion. The given brief described four inline style objects; source inspection found seven style attributes because three used conditional object expressions. All remaining style attributes now set runtime CSS variables.

The project asks for a reviewer approval for work above trivial size; no independent reviewer was run in this session.
