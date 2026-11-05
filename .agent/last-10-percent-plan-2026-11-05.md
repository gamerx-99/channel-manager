# Plan for the last 10 percent (written 2026-11-05)

Where we are: the product is live. Guests can book and pay, the back office can check bookings and slips, staff roles work, the finance figures were corrected today (version `8745cd3e`), and Parts 1, 2, 3, 10 are deployed (`a2aa6497`). This plan lists what is left before it can be called finished for the first hotels, in the order that protects the live site first.

Principles (from `.agent/DECISIONS.md`, 2026-11-05): hayhost is a hotel website and direct-booking service with a simple back office, not a channel manager. Four tests for every item: (1) a guest can book through the hotel's page; (2) the back office can check every booking and payment; (3) the accounts are correct; (4) staff work is controlled and smooth. Detail is added only when a real hotel asks. Each hotel decides its own policies; hayhost sets no default.

How to read an item: **Test** = which of the four it serves. **Owner** = who can do it (H = a human only, C = Codex with a full prompt in chat, M = Claude when asked). **Size** S under half a day, M about a day, L several days. **Done when** is checked by a person, not by a test alone. "To verify" means I read it in the code or the notes but never tried it live.

---

## Phase A: release gate (do first, nothing new on top until these are done)

| # | Item | Test | Owner | Size | Done when |
|---|---|---|---|---|---|
| A1 | Hide the rooms-available number box and the Save button in the dashboard quick actions; keep only stop sale / resume. Guests only enforce a closed night (value 0); a cap such as 2 of 5 is not enforced, so the box would be a control that does nothing. | 1 | C or M | S | The dashboard block has no number input; stop sale and resume send 0 and the full room count; a test proves it. |
| A2 | Push and deploy the pending work: Part 5 (closed nights for guests), the re-enabled stop-sale buttons, the Account page already live. No migration. Production `availability` has 0 rows (audit 2026-11-05), so enforcement changes nothing until a hotel closes a night. | 1 | H approves, M runs | S | Version number recorded in `.agent/handoff.md`; `/` and the API answer 200. |
| A3 | **Live pass, signed in, at 1280px and 375px**, one account per role (owner, front desk, housekeeping, revenue manager): Dashboard, Bookings, Calendar, Financials (month picker and CSV opened in Excel), Account page, menu group "ห้องพักและราคา", Website Builder, Housekeeping, Hotel page. Write what is wrong as a list with screenshots. | all | H | M | A one-page list of defects with a severity each; nothing marked "not looked at". |
| A4 | Try the closed-night path end to end on a test hotel: close one night in the Calendar, open the public page for a stay containing it (not offered), try to book it directly (refused), book it as staff (notice and confirm, booking created, status log shows the override), reopen the night. | 1, 4 | H | S | All five steps behave as written; if not, an item is added here. |
| A5 | Thai wording: the owner confirms every before/after table accumulated in `.agent/handoff.md` today (menu group, account page, builder, housekeeping, copy sweep). | all | H | S | A reply per table: ok or the wording to use. |
| A6 | Tidy the record: update the stale "Pause until Tuesday" entry (Part 2 is finished), add entries for deploys `a2aa6497` and the next one, delete the duplicate Part 3 branch of the Claude session. | - | M | S | `handoff.md` matches reality. |
| A7 | Rollback readiness: write the exact rollback line and the previous version number beside every deploy entry (already the habit); confirm the D1 time-travel / backup setting on the Cloudflare account and note the restore steps. | 3 | H | S | A short "how to go back" paragraph exists and the backup setting is confirmed. |

---

## Phase B: close the four tests

### Test 1: a guest can book through the hotel's page

| # | Item | Owner | Size | Notes and done-when |
|---|---|---|---|---|
| B1 | **Room type details** (description, bed type, size, amenities typed by the hotel; empty by default). Part 4a, branch `part-4a/room-type-details`, migration `20261105000000_room_type_details.sql` not applied. | C done, H applies | M | Order matters: a human applies the migration to production first, then the code is merged and deployed. Done when a hotel fills the fields and the guest step shows them; a room with no data looks unchanged. |
| B2 | **Photos per room type** (Part 4b). Photos are per hotel today, so a guest cannot see the room they choose. Needs a link between a photo and a room type (a nullable column and a migration) and the website builder picker. | C | L | After B1. Touches the media tables and the builder, so it owns those files alone while it runs. Done when each room type can show up to a few photos on the booking step. |
| B3 | **Cancellation policy as the hotel's own text.** hayhost provides the place to write it and shows it to guests; no default text. If a hotel has none, the public page tells guests to ask the property and shows its contact; the owner sees a warning popup until a policy is set; "รับทราบ" records who acknowledged it and when. Decided 2026-11-03, not built. | C | M | Needs a table or columns (migration). Done when the three states (set, not set, acknowledged) behave as written. |
| B4 | Server refuses a check-in before today in Thai time on the public booking write (the Part 10 session proposed it; today only the page prevents it). | C | S | Test with a clock at 00:30 Thai time. |
| B5 | **What the guest gets after booking**: confirmation on screen with a reference, and a way to find the booking again. To verify: whether an email or LINE message is sent today. | M reads first | S to find, M to build | Decide the channel with the owner before building. |
| B6 | Public page basics for sharing: page title, description and a share image per hotel; opens fast on a phone. | C | S | Check the hotel page at 375px on a slow connection setting. |
| B7 | Custom domain for a customer (open since 2026-10-30; done by hand for the first customers). | H | - | Write the manual steps once so each customer takes minutes. |

### Test 2: the back office can check every booking and payment

| # | Item | Owner | Size | Notes and done-when |
|---|---|---|---|---|
| B8 | **Booking detail page** (Part 6): one page per booking with guests, services, payment status and method, slip, and the status history (who, when, why). | C | L | Route `/hotels/:id/bookings/:bookingId`. Done when staff can answer "was this paid, by whom, who changed it" from one screen. |
| B9 | **Edit and move a booking**: change dates, move to another room, fix a guest name, with the same overlap, minimum-stay and closed-night checks as creating one; every change goes in the status log. | C | L | After B8 and after Part 5 is merged (same booking write). |
| B10 | Per-booking **total, paid, balance** in the bookings table. | C | M | Needs the booking list query; run after B8 to avoid two agents in `booking.ts`. |
| B11 | Staff action log the owner can read (who did what), not only the status log. To verify: the hotel admin audit log exists on the staff page; check what it records for bookings and payments. | M reads | S | Decide whether it is enough. |
| B12 | Bookings search and filters by guest name, date and status, and "needs action" first (slips waiting, arrivals today). To verify what exists beyond the status filter. | C | M | Done when the front desk finds a booking in two clicks. |

### Test 3: the accounts are correct

| # | Item | Owner | Size | Notes and done-when |
|---|---|---|---|---|
| B13 | **Decide what "revenue" means**: by check-in date (what the page shows now) or cash by payment date. The second needs a `paid_at` on every booking and a migration. | H decides | S | Record the answer in `DECISIONS.md`; the labels on the cards must say which one it is. |
| B14 | **Payments ledger**: every payment with date, method (cash, transfer, PromptPay, slip), amount, booking and who recorded it; daily cash summary for the front desk. | C | L | Depends on B13. Done when the daily total matches what the cashier counts. |
| B15 | **Refunds**: the statuses exist (refund pending, refunded) but money going back is not recorded anywhere. Record amount, date and method; show in the ledger; exclude from revenue (already excluded). | C | M | After B14. |
| B16 | **Receipts and tax documents** (`specs/15-invoicing-and-tax.md`, draft). Waits for the owner and an accountant to answer the nine questions in `.agent/OPEN_QUESTIONS.md`. No code before that. | H then C | L | A first receipt for one booking as a PDF is the smallest useful step. |
| B17 | Check the reports against a real month: pick one hotel's month, add the figures by hand, compare with the Financials page and the CSV. | H | S | Any difference is a bug and goes on this list. |
| B18 | **Plans and billing**: free for up to 3 rooms, Pro for more (decided 2026-11-02/04), the 15-day trial, coupons, platform CRM. Per the register, plan limits are not enforced in code. | C | L | Do after the four tests; first customers are billed by hand. Enforcement must follow the hotel, not the account (the Account page already shows the plan per hotel). |

### Test 4: staff work is controlled and smooth

| # | Item | Owner | Size | Notes and done-when |
|---|---|---|---|---|
| B19 | **Rooms one by one and maintenance** (Part 7): add, rename and delete a single room and set it to maintenance. The sales code already skips maintenance rooms, but nothing can set the state today. | C | M | After B1 (same hotel page and router). |
| B20 | **Housekeeping fits the stay**: the assignee is tied to a staff account (it is free text in the database today, to verify in the form), and a room can show "needs cleaning after check-out" as a tool the hotel can use, not a default. | C | M | No automatic task creation unless the hotel turns it on. |
| B21 | **Role review**: write the matrix of what the owner, revenue manager, front desk and housekeeping can see and do, then test each cell with a real account. Part 3 fixed one gap (front desk and the Calendar); look for others (for example the front desk and the bookings export, or housekeeping and room status). | M reads, H tests | M | The matrix is checked into `specs/` and every "no" is a test. |
| B22 | **Staff invite and sign-in path** tried end to end with a new email address: invite, accept, first sign-in, wrong role, remove. | H | S | Any dead end is a bug. |
| B23 | Front desk day flow: arrivals today, check-in with passport data for TM.30, take payment, check-out, departures today. Time the flow on a phone. | H | S | A single list of what is slow or confusing. |

---

## Phase C: hardening and operation

| # | Item | Owner | Size | Notes |
|---|---|---|---|---|
| C1 | **Content Security Policy**: it has run report-only since 2026-11-03. Read the violations, fix, then enforce. | M | S | Do after a few days of real traffic. |
| C2 | **Monitoring**: a way to know the site is down or erroring before a hotel tells us (Worker error rate, the 15-minute cron, a simple uptime check of `/` and the API). | H | S | Write who is told and how. |
| C3 | Backups and restore drill for D1 and the photo bucket: restore a copy into a test database once. | H | M | The first real hotel should not be the first restore. |
| C4 | Secrets and leftovers: the old Worker `heyhostth` has no route and may hold secrets; remove after moving what is needed. Check no Supabase or Vercel setting remains. | H | S | |
| C5 | Rate limits and abuse: public booking is limited to 20 requests per minute per key; check sign-up, login and password reset limits, and the SlipOK key use. | M reads | S | |
| C6 | **Legal and privacy**: the legal pages are drafts; the lawyer's open points (provider name and address, court). Data retention for guest passport data (TM.30) and deletion on closure (spec 19). | H | M | Must be settled before a hotel with many foreign guests joins. |
| C7 | Data protection basics: who can export guest data, how long it is kept, what a support grant can see. | M reads | S | Spec 14 and 19 already cover most; check the code matches. |
| C8 | Passkey sign-in (wanted) and the paused 2FA rework. | C | L | Behind a flag; after the four tests. |
| C9 | Release routine: one checklist for every deploy (migrations listed, build, push, deploy, version noted, live check, rollback line), so it stops depending on one chat. | M writes | S | Put it in `docs/` and link from `CLAUDE.md`. |

---

## Phase D: polish

| # | Item | Notes |
|---|---|---|
| D1 | Mobile pass at 375px on every back-office page (the earlier audit was never finished); fix sideways scroll and tap targets. | After A3 lists the real defects. |
| D2 | Accessibility: switches need a name for the setting (the public-booking switch is named by its action), focus order in dialogs, colour contrast of the new pills. | One pass with a checklist. |
| D3 | Empty and error states: a hotel with no rooms, no bookings, a failed load. Each page has a message and a next step. | |
| D4 | Re-check the guided tour after the menu change (its targets moved) and after the Account page. | |
| D5 | Thai wording rules kept alive: the developer-text and glossary tests run in CI; add new banned words as they appear. | Already in place. |
| D6 | Remove dead code and keys: unused dictionary keys (`sidebar.roomOperations`, `sidebar.advancedPricing`, `hotelDetail.availableCount`), the `CALENDAR_EDITING_ENABLED` flag once nothing needs it, the dashboard's unused `payment_status` field. | Small commits, each with a full test run. |
| D7 | Performance: the main client bundle is over 500 kB (build warning). Split the back-office and the public page. | Measure first. |
| D8 | Tests: the payment QR test times out when the whole suite runs on a busy machine; make it stable. The full suite takes about two minutes; keep it under three. | |
| D9 | `getHotelBillingState` reads every hotel to find a trial clock; make it ask for one hotel. | Only matters with many hotels. |
| D10 | The code still calls itself `channelManager` (router names, package name). Leave it until a calm week; rename in one mechanical commit. | Low value, real risk. |

---

## Definition of finished for the first hotels

Five walkthroughs, each done by a person on the live site (or a staging copy) with a real phone, each ending in "yes":

1. **Guest books and pays**: the page loads fast on a phone, the guest sees the room details and photos, the cancellation text, the real price, picks dates (a closed night is not offered), pays by PromptPay, uploads the slip, gets a confirmation with a reference.
2. **Back office verifies**: the owner sees the booking and the slip, approves it, the booking is confirmed, and the booking page shows who did what and when.
3. **Front desk runs the day**: sees arrivals and free rooms, checks a guest in with TM.30 data, takes a walk-in with payment, checks a guest out; the dashboard numbers follow.
4. **Accounts agree**: the month's revenue on the Financials page and in the CSV equals a hand count for one real hotel; paid, pending and outstanding add up; a refund is recorded.
5. **Staff and access**: a new staff member is invited, signs in, sees only what the role allows, and is removed; support access works only with the owner's grant.

---

## Order of work and who does what

1. **Now (this week):** A1 to A7. Everything else waits for A3's defect list.
2. **Next:** B1 (needs the migration applied by a human), B4, B13 (a decision), B8. These touch different files and can run in parallel with Codex prompts.
3. **Then:** B2, B3, B9, B10, B19, B14 (after B13), B21 to B23 by a human.
4. **After the four walkthroughs pass:** Phase C, then Phase D, then B18 (plans and billing), B16 (receipts) when the accountant has answered.

File ownership while Parts run in parallel (so two agents never edit the same file): the booking write (`server/d1/booking.ts`, `bookingService.ts`) belongs to one Part at a time (B9, then B10); the hotel page and router (`HotelDetail.tsx`, `hotelRouter.ts`) to one Part at a time (B1, then B19, then B20); the media tables and the builder to B2 alone; finance files (`financials.ts`, `Financials.tsx`, `dashboardRouter.ts`) to B14 and B15 in turn; `en.ts`, `th.ts` and `handoff.md` are append-only per Part. Migrations are written by agents and applied only by a human, before the code that needs them is deployed.

## Decisions waiting for the owner

1. Revenue by check-in date or cash by payment date (B13).
2. The Thai wording tables (A5).
3. Which guest confirmation channel: email, LINE, or on-screen only (B5).
4. Cancellation policy fields the hotel can fill (B3): free text only, or text plus a few optional numbers (for example the last day for a free change). hayhost writes no default either way.
5. When to start billing enforcement (B18).
