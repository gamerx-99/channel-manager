# 08 Vintage Old Town: "Rattana Guesthouse"

Fits: old shophouses and wooden guesthouses in Mae Hong Son, Lamphun and the Chiang Mai old town.
The original is on account 2, so it is REGENERATED in project 8759744681060323660. The reference copy is in `design/themes/08-vintage-old-town/`.
- The original's identity was a founding-year story ("since 1962"), and we have no field for that.
- v2 keeps the vintage TRAVEL-TICKET look (boarding-pass booking box, postcard gallery) without any year or family history.

Style to recreate:
- Colours: paper cream #fff8f5, brick red #a23e18, jade teal #136967, mustard #7d5700 / #f5bd58.
- Fonts: Space Grotesk in uppercase labels for the ticket feel, with Be Vietnam Pro body. Add a classic serif for headings (e.g. Noto Serif) plus **Noto Serif Thai** and **Noto Sans Thai**.
- Shapes: ticket stubs with perforated edges, postcard frames, corner photo mounts.

| Screen | Action |
|---|---|
| Desktop landing | NEW, -d DESKTOP (prompt A) |
| Mobile landing | NEW, -d MOBILE (prompt B) |
| Booking 1–4 | NEW, -d MOBILE (prompt C, 4 runs) |

## Prompt A: desktop landing
```
Design a 1440-wide vintage travel-ticket landing page for "Rattana Guesthouse" (รัตนา เกสต์เฮาส์), Chong Kham, Mueang Mae Hong Son.
Paper cream #fff8f5 background, brick red #a23e18 primary, jade #136967 and mustard #f5bd58 accents. Noto Serif headings, Space Grotesk uppercase labels, Be Vietnam Pro body, Noto Serif Thai / Noto Sans Thai for Thai. Perforated ticket edges, postcard frames, corner mounts.
Sections:
1. Header: a text wordmark, Rooms · Gallery · Location, TH | EN, "Book now".
2. Hero: a large photo in a corner-mounted frame on the left. On the right, a booking box styled as a ticket: check-in and check-out as "stubs", guests, a brick-red "Check availability" button, and "Pay by Thai PromptPay QR".
3. Intro: a postcard with one photo and the owner's intro (at most 60 words, e.g. "A wooden shophouse on the lake road. Five rooms, original floor tiles, the morning market right outside.").
4. Rooms: 3 "ticket" cards (Teak Chamber ฿950, Market Balcony ฿1,250, Attic Haven ฿1,450), each with a photo, name EN/TH, "Up to N guests", optional bed type, optional 2-line description, "from ฿X / night", and a "Book" button.
5. Gallery: 6 postcards with handwritten-style captions and labels.
6. Location: the address and a vintage-styled map.
7. Footer: name, address, "Booking powered by hayhost".
NEVER show a year, "since", "est.", "registered", family or "third generation" text, stamps with dates, departure/arrival cities on the ticket, "berth/fare/passenger" labels that hide real fields, nearby-place lists, or "instant confirmation".
{{DATA RULES}}
```

## Prompt B: mobile landing
```
Same design and content as the Rattana Guesthouse desktop, at 390 wide. The ticket-style booking box sits under the hero. Room tickets stacked. A 2-column postcard gallery. A sticky bottom bar "from ฿950 / night · Check availability".
{{DATA RULES}}
```

## Prompt C: booking flow (4 runs)
```
Create booking step {{N}} for "Rattana Guesthouse" in the vintage travel-ticket style (cream paper, brick red #a23e18 buttons, jade and mustard accents, perforated ticket edges, Noto Serif + Space Grotesk labels + Be Vietnam Pro, Noto Serif Thai / Noto Sans Thai). The summary in step 3 looks like a ticket stub.
Rooms: Teak Chamber ฿950, Market Balcony ฿1,250, Attic Haven ฿1,450. Add-ons: Khao soi breakfast ฿100 per person per night, Scooter rental ฿250 per night.
{{BOOKING FLOW}}
{{DATA RULES}}
```
