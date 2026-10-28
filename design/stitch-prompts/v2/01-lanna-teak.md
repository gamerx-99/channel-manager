# 01 Lanna Teak: "Baan Mai Sak Lamphun"

Fits: teak houses and heritage stays in Lamphun and Chiang Mai old town (the core market).
Style to keep:
- Colours: dark teak #41240d, Lanna red #aa342d, cream surfaces #fff8f5, gold accent #cea860.
- Fonts: Noto Serif (headings) with Be Vietnam Pro (body). Add **Noto Serif Thai** and **Noto Sans Thai**.
- Shapes: temple-arch tops on the hero card and the intro photo; a thin kanok divider.

Screens in project 8759744681060323660:

| Screen | ID | Action |
|---|---|---|
| Desktop | 587675665d63424f9898ece5d9884d5a | REFINE variant (prompt A) |
| Mobile | 4ba40986afbe4ad2bbbdef2c2dacf9b9 | REFINE variant (prompt B) |
| Booking 1–4 | none yet | NEW mobile screens (prompt C) |

## Prompt A: desktop refine
```
Keep this exact layout, colours, arches and fonts. Only change content as follows.
REMOVE: the badge "Est. 1934 • Lamphun Old Town" (replace with a small badge showing just the district, e.g. "Lamphun Old Town"); the "90 Years / living teak heritage" tag on the intro photo; the two stats "4 Exclusive guest rooms" and "5 min Walk to Wat Phra That"; the room feature tags (Upper Veranda, Garden view, etc.); the line under the location card about minutes to the temple.
ROOM CARDS: name, "Up to N guests", optional bed type, optional 2-line description, "from ฿X / night", Select. Replace any room photo that contains a screenshot of a website with a real room photo.
BOOKING BOX: add the line "Pay by Thai PromptPay QR" under the button.
GALLERY: add a short caption under every photo (as on the mobile version), max 8 photos.
Set all Thai text in Noto Serif Thai (headings) and Noto Sans Thai (body).
{{DATA RULES}}
```

## Prompt B: mobile refine
```
Keep this exact layout, colours, arches, sticky bottom bar and fonts. Only change content.
REMOVE: the "Est." / year badge (district name only), the room badges "MASTER SUITE" and "FAMILY RETREAT", any feature tags on room cards, and any minutes-to-landmark line in the location section.
Keep the gallery captions. Replace any room photo that shows a website screenshot.
Set Thai text in Noto Serif Thai and Noto Sans Thai.
{{DATA RULES}}
```

## Prompt C: booking flow (run 4 times, one per step, with -d MOBILE)
```
Create booking step {{N}} for "Baan Mai Sak Lamphun" in the Lanna Teak style of this project: cream #fff8f5 background, teak #41240d text, Lanna red #aa342d primary buttons, gold #cea860 details, Noto Serif + Noto Serif Thai headings, Be Vietnam Pro + Noto Sans Thai body, a small arch top on the main summary card.
Rooms: Grand Heritage Teak Suite ฿1,800, Veranda Teak Room ฿1,400, Courtyard Twin Room ฿1,200, Family Attic Studio ฿2,200. Add-ons: Northern breakfast ฿150 per person per night, Airport pickup ฿400 once.
{{BOOKING FLOW}}
{{DATA RULES}}
```
