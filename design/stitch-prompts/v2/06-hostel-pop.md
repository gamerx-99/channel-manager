# 06 Hostel Pop: "Lazy Gecko Hostel"

Fits: hostels and backpacker guesthouses (Tha Phae Gate, Pai). It sells dorm beds and private rooms.
Style to keep:
- Colours: yellow #ffd43b, hot pink, mint, black outlines.
- Layout: neo-brutalist, with hard drop shadows and sticker labels.
- Fonts: Epilogue (headings, heavy) with Space Grotesk (body). Add **Noto Sans Thai** (bold weights).

Dorm handling:
- Each bed is a "room" in our system, so dorm cards show "/ bed / night" and "1 guest".
- Private rooms show "/ room / night".

Screens in project 8759744681060323660:

| Screen | ID | Action |
|---|---|---|
| Desktop landing | 84264801deec4a5da18e2d5b254cecff | REFINE (prompt A) |
| Mobile landing | 2303cd37080040b2b53318c10c0e62fd | REFINE (prompt B) |
| Booking 1 | 8fcb8ccfe3d7442ea6c85ec1c570d03f | REFINE (prompt C) |
| Booking 2 | 36fc3b7c17a3473e866f70b217c5e0c5 | REFINE (prompt C) |
| Booking 3 | 06dc1134899840c7828c797e85c1d100 | REFINE (prompt C) |
| Booking 4 | 31fc605041c04a8595b4a9911990f516 | REFINE (prompt C) |

## Prompt A: desktop refine
```
Keep this exact neo-brutalist layout, colours, stickers and fonts. Only change content.
REMOVE:
- The sticker "Best hostel / Best rate".
- The "5 min to Tha Phae" sticker in the hero (keep only the district sticker "Chiang Mai").
- The three amenity chips under the quote: Rooftop hammocks, Community kitchen, Free fast wifi.
- The line about air-con, lock boxes and mattresses above the rooms.
- The list "Tha Phae Gate 5 min / Warorot 7 min / Cafe strip 3 min" in Location; keep the address card and the map.
- The footer links Privacy Policy, Terms of Service and House Rules.
- "Instant Thai QR confirmation" becomes "Pay by Thai PromptPay QR".
ROOM CARDS: dorms show "฿250 / bed / night · 1 guest". Private rooms show "฿750 / room / night · up to 2 guests". The sticker labels on room photos may stay only as the room type (Dorm / Private).
The neon sign in the gallery must not show a founding year.
Thai text in Noto Sans Thai Bold.
{{DATA RULES}}
```

## Prompt B: mobile refine
```
Keep this layout and style. Remove all grayscale on photos. Same removals as the desktop: no best-rate sticker, no amenity chips, no minutes list, no footer policy links. Dorm prices are "/ bed / night". Thai text in Noto Sans Thai Bold.
{{DATA RULES}}
```

## Prompt C: booking refine (one run per screen)
```
Keep this screen's neo-brutalist style. Make it match step {{N}} exactly. Remove any reviews or ratings, cancellation or house-rules text, "instant" or SMS promises, and phone numbers. Dorm lines read "N nights × ฿250 / bed". Step 2 has the Add-ons section (Locker rental ฿30 per night, Rooftop BBQ ticket ฿199 once) and the unticked offers checkbox; guests are read-only.
{{BOOKING FLOW}}
{{DATA RULES}}
```
