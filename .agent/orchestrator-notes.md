# Orchestrator notes (for Claude in a new chat)

Written 2026-10-27 at the end of a long session that compacted several times. Read this
first, then verify against git before trusting it. Not committed (untracked on purpose).

## Who / what
- Owner: Tanutcha (<owner email>). Writes Thai; answer in Thai. Use they/them.
- Product: hayhost, channel-manager SaaS for small and mid-size hotels in Chiang Mai, Mae Hong Son and Lamphun.
  Speed to first revenue matters most. Live site is www.hayhostth.com (Vercel + Supabase).
- Your role now: **orchestrator**. You write prompts, and the owner pastes them into other agents.
  Then you verify their commits in git (diff, test counts) before issuing the next prompt.
  Do not trust their reports blindly: Beam's 14-03a report hid that it added zero tests.

## Agents and where they work (never let two share a folder)
| Agent | Folder | Branch | Scope |
|---|---|---|---|
| Beam (Reflection Beam 1.0 via OpenCode, free tier, hits 429) | `C:\WORK\channel-manager-a` | `agent-a/next` | Currently finishing 14-03a fixes; afterwards **web UI only** (`client/src/`) |
| Codex | `C:\WORK\channel-manager-c` (worktree created this session) | `agent-c/d1-schema` (from a10153c) | Cloudflare migration, starting with 13-02 D1 Drizzle schema |
| Codex #2 on gserver (shared Linux test server; address omitted from this copy) | `~/hayhost/repo` (runtime in `~/hayhost/runtime`, `source ~/hayhost/env.sh`) | `agent-d/auth` (from a git bundle of agent-c at 70057df) | 13-05 Better Auth. Prompt: `.agent/codex2-prompt-13-05-auth.md`. Shared server: never touch smartconnect/saas-test/openclaw. Bring the work back via `git bundle` and merge into agent-c later. |
| Main checkout | `C:\WORK\channel-manager` | `agent-b/website-builder-public-hotel` | Untracked `design/logo-current/` SVGs (logo extract) |

Beam is a 23B-active MoE model. Give it precise prompts with file:line pointers, an explicit
"NOT A BUG" escape hatch, and a required rise in the passing-test count. Never let it read `.env`.

## Decisions the owner made
- **Move fully to Cloudflare** (spec 13: Workers + Hono + tRPC fetch adapter, D1 via Drizzle, R2, Better Auth with TOTP).
  The Supabase project will be **deleted** after cutover.
  - Advise **Pause for ~30 days** before deleting, and take a full backup first.
  - Re-issue OTA iCal export URLs.
  - Passwords: re-import the bcrypt hashes or make every user reset; a reset is simpler while there are few users.
- **Ticket 14-02 (Postgres RLS per-person permissions) is CANCELLED.** D1 has no RLS.
  The data model moves into 13-02; enforcement moves into 13-03 (the hotel-scoped data layer plus a tenancy test suite).
- **Permissions:** the owner flips switches per staff member (13 toggles in `shared/permissions.ts`).
  - The "financials" and "staff" toggles are owner-grant-only.
  - Non-owners can delegate only what they hold, and nobody can edit their own permissions.
- **Super admin** is platform-dashboard only: hotel name, plan, payment status, room count, sync status. No hotel-internal data.
- **Support role** sees nothing until the owner grants a time-limited key: 1, 24, 72 or 168 h, view-only or edit, never manage_staff. Every access is logged.
- **SlipOK** moves to a central platform account (ticket 14-05): a key pool that fails over only on quota or auth errors, a receiver-account check, our own duplicate-ref check, and a quota per plan.
  - The owner wanted to run 2 accounts at first. I refused to help evade SlipOK's multi-account detection.
- **Pricing:** tiered monthly by room count. 199 THB for 1–3 rooms is decided. The working ladder 199/390/690/990 for 1–3/4–10/11–20/21–40 rooms is unconfirmed; the owner is asking hotel owners. Discount codes come later.
- **Business registration:** I advised starting as an individual with a ทะเบียนพาณิชย์ (trade name "hayhost") and setting up a company later.
  - Offered to edit T&C clause 1.1, the lawyer-note checklist, and clause 10.4 (transfer to a future company). The owner has not answered yet.

## Commit state (verify with `git log`)
`agent-a/next` (not pushed; pushing to main or deploying ALWAYS needs fresh explicit approval):
- 13-01 Worker scaffold: d4cb63b, 2c3226f, 175944a. Staging is at https://hayhost-staging.lannatc.workers.dev; smoke test OK, real login not yet tested by the owner.
- 6248982 `fix(calendar)` (not ours).
- 14-00: d9da81d. `20261027_rls_write_hardening.sql` plus verify. **The owner must still run it in Supabase**, migration then verify: all 7 rows PASS, and check the list of super_admin/admin accounts. It is still worth running because the live site uses Supabase until cutover.
- 14-01: b3a4a59 (core permissions, support role). 58f1543 adds specs/14 and the handoff entry.
- 14-03a by Beam: f37b02a … a10153c (8 commits).

## UI-01: VERIFIED 2026-10-28
- Commits f2b091d..69cac8a on agent-a/next.
- Orchestrator re-ran everything: 632 passed (7 known env failures), check clean, build OK.
- No removed markers remain; no Supabase/RLS text left in the i18n.
- Deleted ChannelPerformance tests and the routeScope assertion are legitimate (the page was removed).
- Beam is idle. Its next UI work (14-04, spec 15 UI) waits for server endpoints.

## Spec 16 theme input: Stitch exports (2026-10-28)
- `design/from-stitch/1.txt` is theme 01 Lanna Teak.
  - Lines 1–632 are the desktop HTML; lines 633–1164 are the mobile HTML.
  - It is static Tailwind v3 (CDN plus an inline config), Material Symbols, and lh3.googleusercontent images.
- Notes for the Beam port:
  - The app uses Tailwind v4 (`@tailwindcss/vite`). Convert the inline config to scoped theme tokens, because Stitch's `primary`, `secondary` and `surface` names would clash with the app's tokens.
  - Merge the desktop and mobile files into one responsive component.
  - Never hotlink the Google images.
  - Be Vietnam Pro and Noto Serif have no Thai glyphs. Add Thai fonts, e.g. Noto Serif Thai and Noto Sans Thai.
  - Drop the invented data: EST year, "90 Years", "5 min walk", room badges and feature tags, and the stats.
  - Add PromptPay to the desktop booking box, and add captions to the desktop gallery.
- Theme 02 Minimal White, full set (2026-10-28): `design/from-stitch/02-minimal-white/`.
  - Contents: the desktop and mobile landing pages, booking steps 1–4 (code.html + screen.png each), and `minimal_white/DESIGN.md` (the design tokens).
  - The 4-step booking flow matches our real flow: hold → guest details → summary → PromptPay QR + slip upload with a hold timer.
  - Drop from the landing page:
    - The grayscale photo filter on mobile.
    - "Direct Wire accepted".
    - "01–03 of 06".
  - Drop from the booking steps:
    - Room amenity bullets, SQM, "Plan: Slow Tea".
    - Reservation terms and the cancellation policy. Never show a policy the hotel did not set.
    - "Taxes included (฿0)" and "Local hospitality levy Waived".
    - "Verified instantly" and "within 5 minutes".
    - "Door code via SMS/Email".
    - The Concierge Desk phone.
    - The house-rules checkbox.
  - Changes to the booking steps:
    - Step 2 guest counts are read-only, because they were already chosen.
    - Add the hotel_services add-on picker to step 2. It sends `hotel_service_id` per the 13-04a fix.
    - Step 2 nationality is useful because guests need it for TM.30.
- ALL 8 themes extracted (2026-10-28) into `design/themes/01-lanna-teak … 08-vintage-old-town/`, each with code.html, screen.png and DESIGN.md.
  - The originals are the zips in `design/stitch-fnish/`.
  - `design/from-stitch/` holds earlier duplicates of 01 and 02.
- Booking-flow screens exist for 02, 03, 04 and 06.
  - Plan: build ONE shared booking-flow component and theme it with each DESIGN.md's tokens. Do not build 8 separate flows.
- Common strip list for every theme:
  - Invented history, years, stats and stamps.
  - "Instant confirmation" and SMS promises.
  - Cancellation, tax and levy text.
  - Concierge and phone contacts.
  - Amenity tags (wifi, hammocks, bikes), room SQM, invented nearby-distance lists, weather/altitude widgets and GPS lines.
  - The grayscale filter.
  - The broken "img" logo placeholder in 05 and 08.
- Per-theme notes:
  - 06 Hostel Pop sells per bed. That works if each bed is entered as a room under a dorm room type. Show "/ bed" when the room type is a dorm; that needs a small flag, so decide in spec 16.
  - 08 Vintage depends on a founding-year story. Without a year field it becomes a generic warm theme.
  - 05 Noir is the luxury niche (dark).
- Suggested first wave: 02 (neutral, and the base for the booking flow), 01 (Lanna, the core market) and 04 (Pai/MHS homestays). The other 5 come after.
- Stitch MCP installed 2026-10-28.
  - Official endpoint: `stitch.googleapis.com/mcp`.
  - Scope is local user config, not `.mcp.json`. `claude mcp list` shows it Connected.
  - The first key leaked in a screenshot. The owner deleted it, and the owner entered the new key; I never handled it.
  - The tools appear in a NEW chat.
- Next step in the new chat: ask the owner whether "detailed prompt per theme" means Stitch re-design prompts or Beam implementation prompts.
  - With the MCP, Stitch edits can be applied directly per theme, using the strip lists above.
- Stitch CLI: `@google/stitch` v0.12.0 is installed globally and logged in on the owner's account. Use the CLI, not MCP.
  - Project `8759744681060323660` holds themes 01, 02, 03, 06 and 07 (22 screens).
  - Themes 04, 05 and 08 are on the owner's second account.
- v2 prompts written in `design/stitch-prompts/v2/`: 00-shared-rules plus 01–08. They hold screen IDs, REFINE vs NEW, and exact prompts.
  - That is 48 generations in total (6 per theme).
  - Pilot run, 2026-10-28: 02 desktop REFINE, new screen `5ae89cc3670746159ad14353a34b57da`. All requested removals worked and the photos are true colour.
  - Leftover from the pilot: a hidden mobile bottom nav with "Amenities" and "Concierge". The shared rules now cover it.
  - How to run: `stitch generate variants ... '--aspects=TEXT_CONTENT,IMAGES'`. Quote the aspects in PowerShell.
  - OWNER DECISION 2026-10-28: Stitch output is a REFERENCE only. Do not run the remaining 47 generations.
    - The product is ONE landing page per hotel.
    - Beam builds the themes in React from `design/themes/*` (plus the strip lists above).
    - The booking flow is ONE standard flow for every theme. It only picks up the theme's colours and fonts.
    - Owner-defined order (2026-10-28):
      1. Choose dates and room (calendar). The room hold starts here.
      2. Add-ons (a separate step).
      3. Guest info.
      4. Summary.
      5. Payment (PromptPay QR + slip).
    - CORRECTION (checked PublicHotel.tsx): today's wizard already has 6 steps in this order: 1 dates+guests, 2 room list (hold on click), 3 add-ons, 4 guest info (calls confirmBookingDetails), 5 summary, 6 PromptPay.
      - So the change is: merge 1+2 into one "calendar + room" step (5 steps total), restyle it per theme, and send add-ons as `hotel_service_id`.
      - The flow logic is not rewritten. Spec: `.agent/spec-16-hotel-themes-draft.md`.
  - How to download: `stitch download screen <id> -p <proj> --format html|png --json` into `design/themes-v2/<theme>/`.
  - Room description and bed type are written as OPTIONAL in the prompts (the cards must look complete without them). This keeps both answers open.
- Still open for the owner: should rooms get a description field and a bed-type field?

## 13-03 (Codex #1, agent-c/d1-schema): REVIEWED 2026-10-28, at a0dcd9a
- I re-ran it myself:
  - Tests: 669 passed, with only the 7 env failures.
  - `pnpm check` is clean and `pnpm build` passes.
- Ported: availability, auth compat, hotel, housekeeping, messaging, notification, payment, staff, and siteConfig/media.
- Money is now decimal TEXT plus bigint satang helpers in `server/db/money.ts`. This differs from my "integer satang" prompt, but it is exact. Three rebuild migrations add CHECKs that reject malformed text.
- Bug found: `server/d1/hotel.ts:197` sorts `basePrice` as text, so "1000.00" comes before "500.00".
- booking.ts was moved to 13-04a, because it needs the RPCs that 13-04 ports anyway.
- Next prompt: `.agent/codex-prompt-13-03-close-13-04a.md`. It fixes the sort, closes 13-03, then does 13-04a.
- 13-03 closed in commits c0a480c, 4b57429 and eb1925a, with 670 passed. The sort fix is OK.
- My prompt said booking.ts has 9 exports; it actually has 10. I answered: port all 10. `getStayDates` is pure, so keep it a pure helper.
- 13-04a (040e449, 09fb06c) REVIEWED 2026-10-28.
  - Tests: I ran 682 passed, with only the 7 env failures. Booking tests pass 12/12.
  - The atomic guard is OK: one INSERT…SELECT NOT EXISTS, with the dependent rows gated by `changes() = 1` in the same batch.
  - Found (it already exists on live Supabase too): public `confirmBookingDetails` trusts the add-on prices the client sends.
  - Review fixes a3aa447 (add-ons priced from hotel_services by id) and 7d3a3a4 (11-status allowlist) VERIFIED 2026-10-28: 685 passed / 7 env-only failures, check OK, build OK.
  - cc40ad2 paused 13-04b. Spec 15's no-revive rule conflicts with the SQL revive. Answered in `.agent/codex-prompt-13-04b-cancel-policy.md`:
    - Sync-cancelled bookings (reason `ota_ical_removed_from_feed`) may revive.
    - Staff-cancelled bookings, or cancelled ones with no log row, are skipped into `skipped_uids`.
  - 13-04b 4148a3c VERIFIED 2026-10-28: 696 passed / 7 env-only, check OK, build OK. The cancel rule is implemented as answered; export tokens are 64 hex, matching Supabase. Minor and not blocking: a sync log is skipped when the feed fingerprint is a duplicate, even if bookings changed.
  - 13-06a db406e6 + 13-06b 9915c6a VERIFIED 2026-10-28: 738 passed / 7 env-only, check OK, build OK. The wrangler diff only adds cron triggers for staging and production.
    - MUST-FIX found: R2 media accepts SVG and any image/*, takes the extension from the client filename, and serves from our own origin. That is stored XSS.
    - Fix plus 13-06c are in `.agent/codex-prompt-13-06b-fix-13-06c.md`.
  - Spec 16-01..16-03 done by the orchestrator in channel-manager-a (Beam hit its limit). Commits ee5df38..8505b99. 655 passed / 7 env-only, check OK, build OK. It fixes add-on pricing and status validation, then does 13-04b iCal, including the rule that iCal must never revive a booking staff cancelled.
  - Live Supabase still has the add-on price flaw. Decide whether to hotfix it, or whether it waits for the cutover.
- Later: consider squashing the D1 migration chain before the first staging apply. Do it after Codex #2's 13-05 merge.

## 14-03a fixes: VERIFIED 2026-10-28
- Commits cf0c223..50b8263.
- 629 passed (+10). The 7 failures are environment-only: credential and network tests, plus inviteAuthUser, which needs admin creds.
- `pnpm check` is clean.
- Small follow-ups (hotels invalidate after the pending signup, i18n of the MFA message) were added as section 0 of UI-01.

## 14-03a review findings (original)
1. **Owner signup is broken when email confirmation is on.** `completeHotelOwnerSignup` now requires ctx.user, but `HotelOwnerSignup.tsx` has a no-session path. Fix: store the token in localStorage `hayhost.pendingSignupToken` and complete the signup after the first login.
2. **`savePromptPayId` now requires MFA**, but `Financials.tsx` has no step-up prompt. Fix: use `useMfaStepUp` as `SlipOkSettings.tsx` does.
3. **NotificationBell:** hide the mark-as-read button when there is no hotelId.
4. **Zero new tests:** 619 passed before and after. Required: new failing-before tests for every item, and the passed count must rise above 619.

## Prompt queue
- **Codex:** 13-02 is running. Next: 13-03 (scoped data layer that resolves permissions with `resolveMembershipPermissions`; super admin has no hotel-data path), then 13-04 (port the 32 SQL functions), 13-05 (Better Auth + TOTP), 13-06 (R2 media), 13-07 (client auth swap), 13-08 (data migration and cutover), 13-09 (decommission).
  - Then 14-03b (permission-toggle and support-key endpoints, super-admin dashboard), 14-05 (central SlipOK).
  - **Do not port `channelPerformance`** (server/routers/dashboardRouter.ts) in 13-03/13-04. The owner removed Channel analytics on 2026-10-28. The procedure has no requirePermission, and for super admin it aggregates hotel-internal data from every hotel. The UI removal is in Beam's UI-01 prompt (`.agent/beam-prompt-ui-mock-cleanup.md`).
  - Codex left untracked `20261027_booking_cancellation_permission.sql` and its verify file in channel-manager-a: **do not run them**. Delete them once 13-02 covers them, and ask before deleting.
- **Beam:** finish the 14-03a fixes above. Then UI work in `client/src/` only, with these rules:
  - No new direct supabase-js calls.
  - No `.sql`, `worker/`, `server/db/`, `wrangler.toml` or `vercel.json`.
  - A string-contract test for every changed page.
  - Including 14-04 (per-staff toggle UI, the owner's support-approval screen and banner) once 14-03b's endpoints exist.
- When both finish, ask the owner before merging branches. The likely conflict is only `.agent/handoff.md`.

## Owner request 2026-10-28: booking management (not yet specced)
The Bookings page needs:
- A guest detail view.
- Add-on services at check-in, with payment.
- Edit guest data with a required note.
- Cancel a booking with a required note. Cancelling must free the calendar.

What exists today:
- Permissions `operations.manage_guests` and `operations.cancel_bookings` and the `bookings_cancel` toggle.
- The `booking_services` table.
- The `cancelled` status. iCal sync already releases cancelled rooms.

What is missing:
- No server procedures for any of the four features. `transitionBookingStatus` only allows checked_in and checked_out.
- No UI.

It is full-stack work, so it should be spec 15 and built on the Cloudflare stack after 13-04 (Codex server, Beam UI).
Decisions still open are listed in the chat of 2026-10-28.

## Website Builder vs public page mismatch (2026-10-28)
The UI fixes are in Beam UI-01 section I. Server-side issues:
- `saveHotelSiteConfig` (server/db/siteConfig.ts:59) returns a synthetic success record if the `hotel_site_config` table is missing. The save looks OK but nothing is stored. **Do not port that fallback to D1** (tell Codex).
- The public page reads the config anonymously, which needs `20261027_hotel_site_config_public_read.sql` applied on live Supabase. If it is not applied, the public page silently shows the default copy and colour. The owner must run its verify script.
- 2026-10-28 screenshots confirm the public page ignores ALL saved config. The builder has accent #1d6b56, Story off and Rooms off. The public page shows the default terracotta, Story on and Rooms on, and it also shows no hero image although the builder shows one.
  - Code on origin/main already reads the config (872234a is in main), so the cause is the database: the public-read migration is most likely not applied.
  - The missing hero image is still unexplained. `hotel_media_public_select` requires `public_enabled`, so check the hotel's `public_enabled` and whether any later migration replaced that policy.

## Roadmap decision: CRM / discounts (2026-10-28, owner agreed)
- No full CRM now.
- Phase 0: an opt-in marketing-consent checkbox on the public booking form, unchecked by default, stored with the timestamp. This is for PDPA. It ships with spec 15 / the booking UI.
- Phase 1, after the Cloudflare cutover and the first paying customers: discount codes.
  - Code types: % or fixed amount, valid date range, min nights, usage limit, room-type scope.
  - A "book direct save X%" badge on the public site.
  - Each booking stores the full price, the discount and the paid amount (for financials and tax).
  - The PromptPay QR and the slip check use the discounted amount.
  - The settings screen warns that OTA rate parity is the hotel's responsibility.
- Phase 2, on demand: a guest list derived from bookings (repeat count) and a CSV export of consented guests only.
- Phase 3: LINE/email campaigns as a higher-tier plan, only if hotels will pay.

## Referral idea (2026-10-28, owner likes it, not yet confirmed)
"Invite a friend, both get 1 month free."
- Grant the credit only after the referred hotel makes its first real payment. This blocks self-referral with fake hotels.
- Cap the credits (e.g. at most 12 free months per year).
- Recommended now: run it manually while the owner issues signup links by hand. Log the referrer and credit by hand.
- Build it into billing later (spec 12): a referral code per hotel, `referred_by` at signup, and an account-credit ledger.

## Agents / resellers (2026-10-28, owner direction)
- No salaried sales staff. Independent agents earn commission only.
- **Rule decided by the owner:** the agent earns commission for every month the hotel actually pays. No payment means no commission. The purpose is to make agents keep looking after their hotels instead of selling and leaving.
  - Rate and duration are still open. Suggested: a lower % if it is lifetime (15–20%), or 20–30% capped at 12–24 months.
  - Also suggested: commission continues only while the agent is active (still supports those hotels). Refunds are clawed back.
- **Codex 13-02:** add a hotel acquisition-source field now: `source` = direct | referral | agent, plus `referred_by_hotel_id` and `agent_id`. Cheap, and it serves both referral and agent commission later.
- Commission tracking stays manual (sheet) until there are more than 3 agents or billing (spec 12) exists.
- Later agent role permissions: only their own hotels' name, plan, payment status and their commission. No hotel-internal data.
- Needs an agent agreement (add to the lawyer list):
  - The agent is an independent contractor and cannot promise anything beyond the T&C.
  - Confidentiality and PDPA.
  - Withholding tax on commissions: confirm with an accountant.

## Known open security gaps (not yet fixed)
- `transfer_hotel_admin` can target an admin row (Supabase-only; obsolete after the migration).
- `createPublicBooking` is mounted despite a comment saying it is not.
- `verifySlip` has no receiver-account check, and dedupe works only when a ref is present (both handled in 14-05).
- After 13-01, `routeScope` on the client still checks a role union. Per-person grants need hotel-scoped checks (14-04).

## Other artifacts
- T&C draft for the lawyer: https://claude.ai/artifact/F1cR3tMdvcbam1bDBuLNYR (Docs doc 7175c42b-d622-4b32-b737-0965ea25178a, rev 16).
  - Clauses 3.2, 3.5, 5.4, 6.1 and 7.5 were updated for the decisions above, and the API-key section was removed.
  - Open comment on clause 10.6 (which court). Clause 1.1 still assumes a company.
- Logo SVGs are in `C:\WORK\channel-manager\design\logo-current\` (uncommitted).
  - Mark: a 29×29 rounded rect, rx 8, fill #954831.
  - Wordmark: DM Sans, "hay" bold #1b1c1c and "host" #954831.

## Owner to-do
1. Run 14-00 SQL and send the verify output.
2. Test login on staging.
3. Confirm the price tiers.
4. Ask SlipOK about platform plans.
5. Send the T&C to the lawyer and decide the court in 10.6.
6. Decide individual vs company registration for the T&C.
7. Rotate the Supabase service-role key before real customers arrive (`.env` holds the real key; free-tier models are in use).

