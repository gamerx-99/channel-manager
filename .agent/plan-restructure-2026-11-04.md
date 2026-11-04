# Plan: tidy the hayhost code (UI / logic / style apart)

Status: **plan only, not started**. The owner approves each phase before it starts.

Rules for every phase:

- **No visual change.** Take screenshots before and after at 1280px and 375px, in TH and EN, and compare them.
- **No behaviour change.** Run `pnpm test`, `pnpm check` and `pnpm build` before every commit.
- **Small steps.** One component or file group per commit. Each commit leaves the app working.
- **File roles:**
  - `.tsx`: UI only, with no data fetching and no business rules.
  - `.ts`: logic (hooks, pure functions with unit tests).
  - `.css`: look, with no `style={{ }}` except values that truly vary at runtime (for example the owner's accent colour set as a CSS variable).

## Phase 0: one place for the code

1. Fast-forward `main` to `feat/signup-integration`. Done locally after the full test run. **Pushing `main` needs the owner's explicit OK.**
2. Clone the repo onto `main` at `C:\WORK\Hayhost` (code only). Then:
   - copy `.dev.vars` by hand if the owner wants local login;
   - run `pnpm install`.
3. Documents stay in `C:\WORK\channel-manager`: `design/`, `docs/sales/`, and the untracked `.agent/*` prompts and reports.
4. Tell all agents (Codex, Agy, Beam, Linux) that code lives in `C:\WORK\Hayhost`. Remove the old worktree once the move is confirmed.
5. Deploy from `C:\WORK\Hayhost` only.

## Phase 1: public hotel page (largest, changes most)

Today:

| File | Lines | Inline styles |
|---|---|---|
| `PublicHotel.tsx` | 135 | 2 |
| `public-hotel/PublicBookingSection.tsx` | 428 | 67 |
| `public-hotel/usePublicHotelPage.ts` | 245 | – (already holds the data loading) |
| `index.css` (all public styles are mixed into it) | 843 | – |

Steps:

1. **Style.**
   - Move every `style={{ }}` in `PublicBookingSection.tsx` into a new `public-hotel/public-booking.css`.
   - Keep only the accent colour, as `--accent` set once on the section.
2. **UI.** Split `PublicBookingSection.tsx` into one component per booking step, plus a thin wrapper that picks the current step:
   - `BookingStepDates.tsx`
   - `BookingStepRooms.tsx`
   - `BookingStepServices.tsx`
   - `BookingStepGuest.tsx`
   - `BookingStepPayment.tsx`
   - `BookingConfirmed.tsx`
3. **Logic.**
   - Move the booking-wizard state and handlers out of `usePublicHotelPage.ts` into `useBookingWizard.ts`.
   - Move price and validity rules into pure functions in `bookingRules.ts`, with unit tests.
   - `usePublicHotelPage.ts` keeps only the loading of hotel data.
4. **Page CSS.** Move the `.public-*` rules out of `index.css` into `public-hotel/public-hotel.css`. Write them readably, one rule per line.
5. **Tests.** Contract tests read source files for markers. When a marker moves to a new file, point the test at the new file in the same commit. Never drop an assertion.

## Phase 2: website builder (696 lines)

Same pattern:

- `website-builder/` folder with section components: theme picker, photos with focal point, text and colour, sections, preview;
- `useWebsiteBuilder.ts` for state and mutations;
- `website-builder.css` for its styles.

## Phase 3: split `index.css`

> **Load order is fragile.** Found in the review of `d972a58` on 2026-11-04.
> - `main.tsx` imports `App` (and with it `PublicHotel`, `themes.css`, `public-booking.css` and `public-hotel.css`) **before** `index.css`.
> - The mobile overrides for `.public-*` still live in the `@media (max-width:760px)` blocks of `index.css`. They win only because `index.css` loads later.
> - Two changes would break the public page on phones (about 24 rules):
>   - making `PublicHotel` lazy;
>   - importing `index.css` first.
> - **First task of phase 3:** move those `.public-*` media parts to the end of `public-hotel.css`, with the same breakpoint, so the file stands on its own. Then check 375px on the plain theme.
> - Known invisible difference: `.button{border:1px solid transparent}` now overrides `.public-button{border-color:#f0e6d6}`. It is the same colour as the background, so nothing shows.

Split by area into `styles/`:

- `base.css`
- `layout.css` (sidebar, topbar)
- `house-style.css` (panel, form-grid, status-pill, data-table)
- `landing.css`
- `auth.css`
- `calendar.css`

Import them from `index.css` in the same order, so the cascade stays identical.

## Phase 4: write the rule down

- Add the file-role rule to `specs/ui-house-style.md` and one line to `CLAUDE.md`, so every agent follows it.

## Who does what

- Codex runs each step from a short brief.
- Claude reviews, compares the screenshots, runs the tests and commits.
- The owner approves each phase and the push to `main`.

## Not in this plan

Any new feature or visual redesign. This is structure only.
