# 05 Boutique Noir: "The Saranrom Chiang Mai"

Fits: luxury and boutique hotels in the old city that want a dark, dramatic look. This is a niche theme.
The original is on account 2, so it is REGENERATED in project 8759744681060323660. The reference copy is in `design/themes/05-boutique-noir/`.
Style to recreate:
- Colours: near-black #131313 / #1c1b1b surfaces, warm ivory text #e5e2e1, antique gold #e7c182 / #b8955a accents.
- Fonts: Playfair Display (headings, italic accents) with Be Vietnam Pro (body). Add **Noto Serif Thai** for Thai headings and **Noto Sans Thai** for body.
- Shapes: Roman numeral section markers (I., II., III.), thin gold rules, a drop cap on the intro.

Booking screens did not exist; they are created here.

| Screen | Action |
|---|---|
| Desktop landing | NEW, -d DESKTOP (prompt A) |
| Mobile landing | NEW, -d MOBILE (prompt B) |
| Booking 1–4 | NEW, -d MOBILE (prompt C, 4 runs) |

## Prompt A: desktop landing
```
Design a 1440-wide dark luxury landing page for "The Saranrom Chiang Mai" (เดอะ สราญรมย์ เชียงใหม่), Phra Sing, Mueang Chiang Mai.
Near-black #131313 background, ivory #e5e2e1 text, antique gold #e7c182 accents and thin gold rules. Playfair Display headings with an italic accent word. Be Vietnam Pro body. Noto Serif Thai / Noto Sans Thai for Thai. Roman numeral section markers.
Sections:
I. Hero: a night photo of a colonial-era facade, the name EN/TH, a one-line intro, and a dark booking bar (check-in, check-out, guests, gold "Check availability", "Pay by Thai PromptPay QR").
II. Intro: a drop-cap paragraph of at most 60 words plus one tall photo with a caption.
III. Rooms: 3 alternating image/text rows (Heritage Teak Suite ฿4,300, Colonial Verandah Suite ฿6,200, The Royal Sanctuary ฿8,900), each with name EN/TH, "Up to N guests", optional bed type, optional 2-line description, "from ฿X / night", and a gold text button "Reserve".
IV. Gallery: a 3×2 grid of dark photos with captions and labels.
V. Location: a dark map and the address.
Footer: name, address, "Booking powered by hayhost".
DO NOT add a stats row (number of suites, founding year, "100% quietude"), a "Suite No." counter, a dining or room-service nav, "Direct reservation guaranteed" or a logo image placeholder (use a text wordmark).
{{DATA RULES}}
```

## Prompt B: mobile landing
```
Same design and content as The Saranrom desktop, at 390 wide. The header has only the wordmark, TH | EN and a menu icon; no bottom nav with Dining/Room service. Room cards stacked. A 2-column gallery. A sticky bottom bar "from ฿4,300 / night · Reserve" in gold.
{{DATA RULES}}
```

## Prompt C: booking flow (4 runs)
```
Create booking step {{N}} for "The Saranrom Chiang Mai" in Boutique Noir style (black #131313, ivory text, gold #e7c182 buttons and rules, Playfair Display + Be Vietnam Pro + Noto Serif Thai / Noto Sans Thai). The PromptPay QR sits on an ivory card so it stays scannable.
Rooms: Heritage Teak Suite ฿4,300, Colonial Verandah Suite ฿6,200, The Royal Sanctuary ฿8,900. Add-ons: In-room breakfast ฿450 per person per night, Airport transfer ฿900 once.
{{BOOKING FLOW}}
{{DATA RULES}}
```
