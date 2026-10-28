# Beam: spec 16, hotel landing themes + 5-step booking flow

Folder: `C:\WORK\channel-manager-a`. Branch: `agent-a/next`. Work only in this folder.
- Read the reference files under `C:\WORK\channel-manager\design\` and never change them.
- Do NOT read `.env`.
- Do NOT touch the untracked `20261027_booking_cancellation_permission.sql`, its verify file, or `supabase/`.
- No push, merge or deploy.

## Read first
1. `CLAUDE.md` (the hard rules and Definition of Done).
2. `C:\WORK\channel-manager\.agent\spec-16-hotel-themes-draft.md`. This is the spec. Copy it to `specs/16-hotel-themes-booking-flow.md` as the first commit (`docs(spec): add spec 16 hotel themes`).
3. `client/src/pages/PublicHotel.tsx` and `client/src/pages/PublicHotel.contract.test.ts`.
4. The references: `C:\WORK\channel-manager\design\themes\02-minimal-white\` (code.html, screen.png, DESIGN.md).
   - Then `01-lanna-teak` and `04-cafe-homestay`.
   - Also `design\themes-v2\02-minimal-white\desktop\5ae89cc3670746159ad14353a34b57da.html`, the cleaned-up 02 landing.
   - Also `design\stitch-prompts\v2\00-shared-rules.md`, the DATA RULES / NEVER SHOW list.

## Tickets (one concern = one commit each, in this order)
1. **16-01 BookingFlow**: extract the wizard into `client/src/components/booking/BookingFlow.tsx` and turn its 6 steps into 5.
   - The new steps are: dates+room (merge today's steps 1 and 2; the hold happens on room click), add-ons, guest info, summary, payment.
   - Keep every tRPC call and rule as it is today.
   - Use only `--t-*` CSS variables for colour and fonts. Define default values that match today's look.
   - Check whether `confirmBookingDetails` on this branch accepts `hotel_service_id`:
     - If it does, send `hotel_service_id` + `quantity`.
     - If it does not, keep the payload and log it in `.agent/OPEN_QUESTIONS.md`.
   - Do not change server code.
2. **16-02 Theme 02 Minimal White**: add `?theme=minimal-white`, the `.theme-minimal-white` tokens, and `client/src/components/hotel-themes/MinimalWhiteLanding.tsx`.
   - Fonts: IBM Plex Sans + IBM Plex Sans Thai, loaded only when the theme mounts.
   - Show real hotel data only. Apply the NEVER SHOW list.
   - It must work on desktop and on mobile at 390 px.
3. **16-03 Themes 01 Lanna Teak and 04 Cafe Homestay**: same pattern, one commit per theme.
   - Serif Thai font: Noto Serif Thai. Sans Thai font: Noto Sans Thai.

## Rules
- Rebuild the references in React and Tailwind v4. Do NOT paste the Stitch HTML or its Tailwind CDN config.
- An unknown or missing `?theme` must render exactly today's page.
- Missing optional data (no Thai name, no gallery, no hero, no room photo) must not leave an empty box.
- Every new string gets a TH and an EN i18n key.
- Add the contract tests listed in the spec's test plan.
- If an existing test must change because the step count changed, explain why in the commit body, and do not loosen any other assertion.

## Done means (paste real output)
- `pnpm test` (only the 7 known env-only failures allowed), `pnpm check` and `pnpm build` must pass.
- A `.agent/handoff.md` entry per ticket.
- Stop after 16-03 and report: commits, test counts, and anything logged to OPEN_QUESTIONS.
