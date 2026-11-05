# Work split for 3 machines (2026-11-05)

Replaces the A/B split in `WORK_SPLIT.md` for this batch only. Source: the UX review the owner pasted on 2026-11-05.
Read `CLAUDE.md` and the register at the top of `.agent/DECISIONS.md` first.

## How the machines share work (read this before anything else)

Do **not** open one working folder from three computers. A shared (network or synced) folder breaks here because:

- `.git/index.lock` and half-written index files appear when two machines run git at once.
- `node_modules`, `.wrangler/state` (local D1) and Vitest temp files get written by all three and corrupt each other.
- Cloud-sync tools (OneDrive, Drive) upload half-saved files.

Instead, each machine has **its own clone** and **its own branch**, and the shared folder is used only for notes:

| Machine | Track | Branch | Folder |
|---|---|---|---|
| 1 (this one) | Track 1: rooms, pricing, calendar, menu | `track-1/rooms-pricing` | `C:\WORK\hayhost` |
| 2 | Track 2: back-office page polish | `track-2/backoffice-ui` | its own clone |
| 3 | Track 3: website builder, finance page | `track-3/builder-finance` | its own clone |

Setup on machines 2 and 3, from the same remote or from a copy of this folder:

```bash
git clone <repo-or-path> hayhost && cd hayhost
git checkout -b track-2/backoffice-ui   # or track-3/builder-finance
pnpm install
```

Rules:

1. Each track edits **only the files it owns** (lists below). A file not listed: ask the owner.
2. Shared files, edit only your own part and commit soon after:
   - `client/src/lib/i18n/en.ts`, `th.ts`: add or change keys only inside your own section (the object for your page).
   - `.agent/handoff.md`: append your own entry at the top; never edit another track's entry.
3. `client/src/App.tsx`, `Sidebar.tsx`, `Topbar.tsx`, `routeScope.ts`, `shared/authorization.ts`, `wrangler.toml`, `drizzle/**`: **Track 1 only**.
4. Each track rebases on `main` before it reports done: `git fetch && git rebase origin/main` (or `git merge main`). Run `pnpm test`, `pnpm check`, `pnpm build` after the rebase and paste the output in the handoff entry.
5. Nothing is pushed to `main` or deployed by an agent. The owner approves each merge, one track at a time. Suggested order: Track 2, Track 3, Track 1.
6. Thai text: show a "before → after" table in the handoff for every new or changed Thai string (rule 5 of `docs/thai-glossary.md`). Do not invent wording that is on the glossary's banned list.
7. Do not remove the `<span className="title-mark">.</span>` after page titles or the small `eyebrow` labels. They are the house style the owner approved on 2026-11-03 (`specs/ui-house-style.md`). Removing them is an owner decision, listed under "Needs the owner" below.
8. One concern per commit, conventional commit messages, no secrets.

## Already done (do not redo)

- `c00b2e8` Calendar edit controls hidden (`CALENDAR_EDITING_ENABLED = false`), link to `/dashboard/pricing`.
- `e1faa63` Calendar: a fully available day is "healthy" (green) even for a one-room hotel; "healthy" dot is green (`.dot.ok`) instead of the brand brick; duplicated month note removed; Bookings TM.30 panel no longer repeats its description as the heading.

## Track 1: rooms, pricing, calendar, menu (machine 1)

Owns: `client/src/pages/Calendar.tsx`, `calendarAvailability.ts`, `AdvancedPricing.tsx`, `client/src/components/layout/*`, `App.tsx`, `routeScope.ts`, `client/src/styles/calendar.css`, `server/d1/availability.ts`, `server/d1/bookingService.ts`, `server/routers/availabilityRouter.ts`, `server/pricing.ts`, `drizzle/**`, new `specs/` files for this work.

Tasks, in order:

1. Spec in `specs/` and an entry in `.agent/DECISIONS.md` for where "stop sell" and allotment are stored so the guest booking flow respects them. The owner decides (rate-override field vs reading the `availability` table).
2. Menu group for rooms and pricing with no link that loops back to the same page (room types need their own route; see the chat of 2026-11-05).
3. Batch write procedure (one D1 `batch()`), then the side-panel bulk editor.

Calendar copy ("click 1 IN, click 2 OUT" is guest wording) waits for the owner's Thai approval.

## Track 2: back-office page polish (machine 2)

Owns: `client/src/pages/Dashboard.tsx` (and its components under `client/src/components/dashboard/` if present), `HotelDetail.tsx` (UI only), `Bookings.tsx`, `Housekeeping.tsx`, and their tests. CSS goes in the page's own file or `client/src/styles/house-style.css` (append only, scoped class names).

Tasks (from the review; verify each against the code first, skip what is already fine):

1. **Dashboard:** group the summary cards: operations (rooms available, check-in, check-out) together, money (revenue today, revenue this month) together, so the grid has no orphan card.
2. **HotelDetail:** the starting price is shown three times; keep one large figure on the room row and remove the "N rooms · starting price" line under the room name. Replace the percentage under "occupied 0%" with a count ("1 of 1 available") or a bar with a clear track. Use a toggle switch for the public-booking on/off control. Give the two cards in the same row equal height.
3. **Bookings:** gather the TM.30 buttons (preview, export, review, open portal) near the one explanation of that process instead of two places. Status pills already exist; only check that "checked out" uses a neutral colour, not the amber used for pending.
4. **Housekeeping:** Thai wording for the three summary cards (proposals in the review: "งานทั้งหมดวันนี้", "รอดำเนินการ", "รอการมอบหมาย"; confirm with the owner's table before commit). Add an empty-state call-to-action to create a task when there are none.

## Track 3: website builder and finance page (machine 3)

Owns: `client/src/pages/WebsiteBuilder.tsx` and `client/src/pages/website-builder/**`, `client/src/pages/Financials.tsx`, `server/financials.ts` (read only unless a task needs it), and their tests.

Tasks:

1. **Website builder:** put "save draft" and "publish" in a sticky action bar (bottom of the viewport or top right) so they are reachable anywhere on the long page. Fix the "view hotel page" card: keep the preview link and the "unpublished changes" notice together instead of at opposite ends. Check 375px.
2. **Financials:** UI polish only. No invoicing, VAT or withholding-tax code in this batch: write a spec in `specs/` (invoice and receipt documents, VAT inclusive/exclusive setting, withholding tax for company guests, monthly tax export to CSV/Excel) and list the questions for the owner in `.agent/OPEN_QUESTIONS.md`. Tax rules need the owner and an accountant to confirm before any code.
3. Coordinate with `.agent/codex-prompt-draft-publish.md`: that prompt also edits the builder's save/publish buttons. Do not start both; ask the owner which one runs.

## Needs the owner (nobody codes these yet)

- Remove the full stop after page titles and the small eyebrow labels everywhere? Both are in the approved house style; a change is a site-wide decision.
- Calendar instruction wording for admins instead of guest-style IN/OUT.
- Whether to pause sign-ups (coming-soon page) until the above is deployed.
