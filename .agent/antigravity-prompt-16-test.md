# Antigravity: test spec 16 (hotel themes + 5-step booking flow) against real data

You are a TESTER for this task. Do not change code, commit, push or deploy. Report only.

## What changed (branch `agent-a/next`, head 8505b99)
- The public booking wizard is now a shared component, `client/src/components/booking/BookingFlow.tsx`, with 5 steps:
  1. Dates + room. Clicking a room starts a 15-minute hold.
  2. Add-ons.
  3. Guest info.
  4. Summary.
  5. PromptPay payment.
- 3 new landing themes, chosen by URL: `/<slug>?theme=minimal-white`, `?theme=lanna-teak`, `?theme=cafe-homestay`. Without `?theme` (or with an unknown one) the old page must look exactly as before.
- Spec: `specs/16-hotel-themes-booking-flow.md`. Notes: `.agent/handoff.md` (top entry).
- It was only checked with mock data, because local dev would not start on the author's machine. Your job is the real-data check.

## Setup
1. Get the code from the bundle the owner gives you (`agent-a-next-spec16.bundle`) into a NEW, empty folder. Do not reuse another agent's folder.
   ```
   git clone -b agent-a/next agent-a-next-spec16.bundle hayhost-spec16-test
   cd hayhost-spec16-test
   pnpm install
   ```
2. Use this machine's existing `.env`; copy it in only if the owner tells you where it is.
   - Never print, paste or commit its contents.
   - Never put secrets in your report.
3. `pnpm dev`, then open `http://localhost:3000/<slug>`.

## Safety rules (live Supabase)
- Use ONLY the test hotel slug the owner gives you. If you don't have one, stop and ask. Never book on a real hotel.
- Holds create real `held` bookings. They expire by themselves after 15 minutes. Write down every booking reference you create.
- Do NOT upload a payment slip and do NOT pay. Stop at the PromptPay QR screen. Slip checks use the SlipOK quota.
- Do not edit the test hotel's data unless a step below says so, and put it back afterwards.

## Test checklist (mark each PASS / FAIL, with a screenshot for FAILs)
A. Default page (no `?theme`)
  1. It looks and works like before. The booking box says "Step N of 5".
B. For EACH theme (minimal-white, lanna-teak, cafe-homestay), on desktop (≥1280px) and mobile (375px):
  2. Real data appears: hotel name, address, intro text (hero copy), the hero photo, the gallery (up to 8, with captions) and every room type with "from ฿X / night".
  3. There is no horizontal scroll on mobile. Nothing overlaps. The sticky bottom bar on mobile shows only the price and "Check availability".
  4. TH | EN switch: all theme text changes language. Thai text uses the Thai font (it is not a system fallback; compare with the screenshot style).
  5. None of these appear anywhere: a founding year, "since", reviews/stars, amenity icons, a concierge or phone number, cancellation text, "instant confirmation", bank wire.
  6. The map shows the hotel's address.
  7. The "Book now" button on a room card scrolls to the booking section, and that room is highlighted in step 1.
C. Booking flow on ONE theme plus the default page:
  8. Step 1: changing the dates or the adults/children count refreshes the room list. "Only N left" and the min-stay note look right.
  9. Clicking a room moves to step 2, and the hold countdown starts at about 15:00.
  10. Step 2: each add-on shows its unit (per night / per person per night / once), and the line totals are right. With no add-ons the button says "Skip".
  11. Step 3: an empty name is rejected. Email is optional.
  12. Step 4: the summary total equals the room total plus the add-ons. Compare with the hotel's prices and do the arithmetic yourself; write both numbers down. The night count reads correctly (for example "2 nights", not "2 2 nights").
  13. Back buttons work on each step without losing the entered data.
  14. Step 5: the PromptPay QR appears, with the right amount. STOP here.
D. Edge cases (only if the owner allows editing the test hotel; put it back afterwards)
  15. A hotel with no photos and no intro shows no empty boxes and no broken layout.
  16. The site config `accent_color` changes the theme's button colour.

## Report (write to `spec16-test-report.md` in your test folder and paste it back to the owner)
- The table of results (1–16), PASS/FAIL, plus the browser and OS used.
- For each FAIL: the steps to reproduce, expected vs actual, and a screenshot.
- The booking references you created.
- No code changes, no commits, no secrets.
