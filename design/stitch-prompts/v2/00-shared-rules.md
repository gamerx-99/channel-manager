# hayhost themes v2: shared rules (included in every theme prompt)

Stitch project: `8759744681060323660` ("Lanna Teak Hotel Landing", account 1).
- Themes 01, 02, 03, 06 and 07 already have screens there. Edit them as REFINE variants.
- Themes 04, 05 and 08 live on account 2. Regenerate them into the same project so all 8 sit in one place.

Each theme file has the exact prompts. Paste the "DATA RULES" and "BOOKING FLOW" blocks below into every prompt where the theme file says `{{DATA RULES}}` / `{{BOOKING FLOW}}`.

How to run (orchestrator, after owner approval; each run uses Stitch generation quota):
```bash
# edit an existing screen, keep the layout (themes 01 02 03 06 07)
Get-Content prompt.txt -Raw | stitch generate variants -p 8759744681060323660 --screen <SCREEN_ID> --count 1 --creative-range REFINE --aspects TEXT_CONTENT,IMAGES
# new screen (themes 04 05 08, and missing booking screens)
Get-Content prompt.txt -Raw | stitch generate screen -p 8759744681060323660 -d MOBILE
```
Add `--dry-run` first to check the payload.

---

## DATA RULES (paste as-is)

```
DATA RULES — this page is a template filled from a hotel's own data. Show ONLY these fields:
- Hotel name, in Thai and English. The EN name is the main one; the Thai name may be empty, so the layout must still work without it.
- One intro paragraph of at most 60 words, written by the owner. Any "near the temple / 5 min from X" detail belongs inside this paragraph, never in a separate stat or list.
- Address, as one line in EN and optionally TH.
- Photos: one hero plus up to 8 gallery photos. Each gallery photo has a short caption and a label: exterior, room, common area, food or view.
- Room types (1 to 4). Each has a name, max guests, "from ฿X / night", and one photo.
  OPTIONAL per room: a description of at most 2 lines and a bed type (e.g. "1 King bed"). The card must look complete when both are missing.
- Booking box: check-in, check-out, adults, children, a "Check availability" button, and a small line "Pay by Thai PromptPay QR".
- Location: the address plus a simple map block. No GPS numbers. No list of nearby places with minutes.
- Header: hotel name, links Rooms · Gallery · Location, a TH | EN switch, and a "Book now" button.
- Footer: hotel name, address, and the text "Booking powered by hayhost". No other links.

NEVER SHOW (the hotel did not provide it, or it is a promise we cannot keep):
- Founding year, "since/est.", "X years", family history, stamps or badges with years.
- Stats rows (number of rooms, altitude, %, "quietude guaranteed").
- Reviews, ratings, stars, "best hostel", awards, guest quotes.
- Amenity tags or icons (wifi, pool, bikes, hammocks, breakfast included, kitchen), room size in m²/SQM, and room feature bullet lists.
- Phone numbers, LINE, WhatsApp, concierge, "call us", email of the owner.
- Cancellation or refund policy, taxes, service charges, levies, house rules, check-in times.
- "Instant confirmation", "verified within N minutes", SMS, door codes.
- "Bank transfer / wire" (we only take PromptPay QR).
- Weather or mist widgets, live-rate badges, room counters like "01–03 of 06".
- Grayscale or duotone filters on photos. Photos must show true colour.
- Broken logo placeholders. Use the hotel name as a text wordmark.
- Any mobile bottom navigation bar, hidden or visible, with items other than Rooms, Gallery, Location and Book. Never "Amenities", "Concierge", "Dining" or "Room service".

LANGUAGE AND FONTS: every heading may have a Thai line. Pair the theme's Latin fonts with a Thai font that has Thai glyphs (Noto Serif Thai for serif themes, Noto Sans Thai or IBM Plex Sans Thai for sans themes). Never let Thai text fall back to a system font.
CURRENCY: Thai baht, written "฿1,800". Prices are per room per night, except dorm beds, which are "/ bed / night".
```

## BOOKING FLOW (paste as-is; same 4 mobile screens for every theme, styled per theme)

```
BOOKING FLOW — 4 mobile screens (390 wide), styled in this theme's colours and fonts. Step indicator "Step N of 4".
1. Select room
   - Top bar: dates and guests with an "Edit" link.
   - Room cards: photo, name, max guests, price per night, and the total for the stay.
   - A badge "Only 1 left" or "Only 2 left" appears only when 1–2 rooms remain.
   - If a minimum stay applies, show "Minimum stay N nights for these dates".
   - Sticky bottom bar: selected room, stay total, "Continue".
   - Small note: "We hold your room for 15 minutes while you finish booking."
2. Guest details
   - A hold countdown (e.g. "Room held for 14:32").
   - A summary chip: room, dates, nights.
   - Guests shown read-only (e.g. "2 adults, 1 child").
   - Fields: full name*, phone*, nationality*, email (optional), special requests (optional).
   - "Add-ons" section: the hotel's own services. Each row shows name, price and unit ("per night", "per person per night" or "once"), plus a quantity stepper. The running total updates.
   - One optional, unticked checkbox: "Send me offers from <hotel name>".
   - Button "Review booking".
3. Summary
   - Hotel name and address.
   - Room, check-in and check-out dates, nights, guests, guest name.
   - Rate breakdown: one line per night (nightly prices can differ), one line per add-on, and the total.
   - The line "Total amount payable to the hotel".
   - Buttons "Proceed to payment" and "Edit details".
   - NO taxes, levies, cancellation policy or check-in times.
4. Payment
   - Hold countdown, booking reference, total.
   - A large PromptPay QR (placeholder), with the account name = hotel name.
   - "Upload payment slip" with a file chip.
   - After upload, status "Waiting for the hotel to confirm your payment". No time promise, no SMS, no door code.
   - Footer "Booking powered by hayhost".
```
