# 04 Café Homestay: "Nap & Latte Homestay"

Fits: small homestays in Pai and Mae Hong Son with a café downstairs (a large segment).
The original is on account 2, so this theme is REGENERATED as new screens in project 8759744681060323660. The reference copy is in `design/themes/04-cafe-homestay/`.
Style to recreate:
- Colours: cream #fff8f0, espresso brown #321f12, latte #7a573d, peach #fdcead, matcha #92a981 / #d2eabe.
- Fonts: Epilogue (headings) with Be Vietnam Pro (body). Add **Noto Sans Thai** (rounded weight).
- Shapes: pill buttons, soft rounded cards, polaroid-style gallery frames with washi-tape strips, small cup and leaf icons.

| Screen | Action |
|---|---|
| Desktop landing | NEW, -d DESKTOP (prompt A) |
| Mobile landing | NEW, -d MOBILE (prompt B) |
| Booking 1–4 | NEW, -d MOBILE (prompt C, 4 runs) |

## Prompt A: desktop landing
```
Design a 1440-wide landing page for "Nap & Latte Homestay" (แนป แอนด์ ลาเต้ โฮมสเตย์), Wiang Tai, Pai, Mae Hong Son.
Mood: cosy café-homestay, warm and playful but calm. Cream #fff8f0 background, espresso #321f12 text and primary buttons, latte #7a573d secondary, peach #fdcead and matcha #d2eabe accent pills. Epilogue headings, Be Vietnam Pro body, Noto Sans Thai for Thai text. Pill buttons, rounded 24px cards.
Sections in order:
1. Header: wordmark, Rooms · Gallery · Location, TH | EN, "Book now".
2. Hero: name in EN and TH, intro "Three pastel rooms upstairs, slow coffee downstairs. Ten minutes from Pai Walking Street by bicycle." Next to it, a stacked collage of 3 polaroid photos with captions.
3. Booking box: check-in, check-out, guests, "Check availability", and "Pay by Thai PromptPay QR".
4. Rooms: 3 cards, Matcha Cloud Room ฿890, Peach Sunrise Balcony ฿1,150, Sky Latte Loft ฿1,350. Each card has a photo, name EN/TH, "Up to N guests", optional bed type, an optional 2-line description, "from ฿X / night" and "Select room".
5. Gallery: 6–8 polaroid frames with washi tape, each with a caption and a label (exterior / room / common area / food / view).
6. Location: the address card and a soft illustrated map. No list of nearby places.
7. Footer: name, address, "Booking powered by hayhost".
DO NOT add amenity chips such as "Morning mist", "Single origin drip" or "Complimentary bikes", and no "instant confirmation" or SMS text.
{{DATA RULES}}
```

## Prompt B: mobile landing
```
Same design system and content as the Nap & Latte desktop page, as a 390-wide mobile page. Header with wordmark and TH | EN. Hero photo collage, then name and intro. A compact booking box. Room cards stacked. A 2-column polaroid gallery with captions. Location card. Footer. A sticky bottom bar "from ฿890 / night · Check availability".
{{DATA RULES}}
```

## Prompt C: booking flow (4 runs, -d MOBILE)
```
Create booking step {{N}} for "Nap & Latte Homestay" in its café-homestay style (cream #fff8f0, espresso #321f12 buttons, peach and matcha pills, Epilogue + Be Vietnam Pro + Noto Sans Thai, pill buttons, rounded cards).
Rooms: Matcha Cloud Room ฿890, Peach Sunrise Balcony ฿1,150, Sky Latte Loft ฿1,350. Add-ons: Breakfast set ฿120 per person per night, Bicycle rental ฿80 per night.
{{BOOKING FLOW}}
{{DATA RULES}}
```
