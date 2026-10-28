# 07 Riverside Calm: "Rim Ping Riverside"

Fits: riverside guesthouses and resorts on the Ping River (Pa Sang, Lamphun, Chiang Mai outskirts). It is the cleanest of the 8.
Style to keep:
- Colours: pale water-blue and sand surfaces, deep teal #2f6b6b primary.
- Fonts: Noto Serif (headings) with Noto Sans (body). Add **Noto Serif Thai** and **Noto Sans Thai**.
- Layout: a wavy section divider, a big quote band, and a thumbnail gallery strip.

Screens in project 8759744681060323660:

| Screen | ID | Action |
|---|---|---|
| Desktop landing | c262aa8a9dbc46ae91b3b664fb5e0669 | REFINE (prompt A) |
| Mobile landing | 2c3b6b4e697948618829e4ff095cfa67 | REFINE (prompt B) |
| Booking 1–4 | none yet | NEW mobile screens (prompt C) |

## Prompt A: desktop refine
```
Keep this exact layout, colours and typography. Only change content and images.
- "Instant confirmation • No booking fee" becomes "Pay by Thai PromptPay QR".
- Remove the GPS line, the "Setting & Access" and "Travel note" blocks with distances and parking. The location card keeps the name, the address and the map.
- Remove the footer "Contact" link.
- Replace the two room photos that contain website screenshots with real room photos.
- The quote band uses the hotel's own intro text, not a guest quote.
- Rooms: name, "Up to N guests", optional bed type, optional 2-line description, "from ฿X / night", Select.
Thai text in Noto Serif Thai / Noto Sans Thai.
{{DATA RULES}}
```

## Prompt B: mobile refine
```
Keep this layout and style. Same content changes as the desktop: no instant-confirmation claim, no GPS or distances, real room photos only. Keep the sticky "Check availability" bar. Thai text in Noto Serif Thai / Noto Sans Thai.
{{DATA RULES}}
```

## Prompt C: booking flow (4 runs, -d MOBILE)
```
Create booking step {{N}} for "Rim Ping Riverside" (ริมปิง ริเวอร์ไซด์) in its Riverside Calm style: pale water-blue and sand backgrounds, deep teal #2f6b6b buttons, Noto Serif + Noto Serif Thai headings, Noto Sans + Noto Sans Thai body, a soft wave divider under the header.
Rooms: Deluxe Waterfront King ฿1,800, Riverside Family Suite ฿2,200, Standard River Balcony ฿1,400, Upper River Panorama King ฿1,800. Add-ons: Breakfast on the deck ฿180 per person per night, Kayak rental ฿250 once.
{{BOOKING FLOW}}
{{DATA RULES}}
```
