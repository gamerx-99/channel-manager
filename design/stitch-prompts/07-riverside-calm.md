# 07 — Riverside Calm

```
Design a one-page hotel website (landing page) for a peaceful riverside hotel in northern Thailand. Theme name: "Riverside Calm".

MOOD
Slow water, reflections, bamboo rafts, and afternoon breeze. Fresh and relaxing, spa-like. Soft blues and greens, gentle curves like water.

SAMPLE HOTEL (use as placeholder content)
- Name: Rim Ping Riverside (ริมปิง ริเวอร์ไซด์)
- Intro: "Seven rooms with balconies right on the Ping River. Breakfast on the deck, kayaks at sunset."
- Address: Pa Sang, Lamphun, Thailand

VISUAL STYLE
- Palette: river teal #2F6F73, soft aqua #A8D5D1, sand #EFE6D8, white #FCFCFA, deep blue-grey #23343B for text.
- Fonts: headings "Pridi" (a soft Thai serif) Medium; body "Noto Sans Thai".
- Wavy SVG section dividers, rounded corners (16px), and photos with a subtle water-reflection fade at the bottom. Light teal tints on section backgrounds.
- Buttons: river teal, rounded 12px, with white text.

LAYOUT SIGNATURE (make this theme recognisable)
- Hero: a wide river photo filling 80% of the viewport height. The hotel name sits top-left in white serif. A white rounded booking card overlaps the bottom edge of the hero and the next section.
- About: text centred in a sand-coloured band between two wave dividers.
- Rooms: a 2-column layout with a large photo and a text block beneath it, separated by thin teal lines. "River view" style captions appear as soft tags.
- Gallery: a carousel with a large main photo and a thumbnail strip below; the caption fades in on the main photo.
- Location: a map placeholder with the river highlighted in teal and an address card beside it.

DATA RULES (this site is generated automatically from a channel manager; use ONLY these blocks)
- Hotel name, intro paragraph (2–3 sentences), address (district, province).
- Up to 8 photos. Each photo has a short caption and a category: exterior, room, view, common area, food.
- 1–4 room types. Each has a name, max guests, "from ฿X / night" and one photo.
- Booking widget: check-in/check-out dates, adults, children, and a "Check availability" button. Payment is by Thai PromptPay QR.
- Location: address and a map placeholder.
- Header: hotel name (text logo), section links (Rooms, Gallery, Location), a TH | EN language switch, and a "Book now" button.
- Footer: hotel name, address, small text "Booking powered by hayhost".
DO NOT include reviews, star ratings, testimonials, amenity icon lists, blog, restaurant menu, newsletter signup, social media feeds, owner phone/email/LINE, or OTA price comparisons. We have no data for these.

SCREENS
1. Desktop landing page, 1440px wide.
2. Mobile landing page, 390px wide, with a sticky bottom bar showing "from ฿1,400" and a "Check availability" button.
Thai text must render correctly. Keep text contrast at WCAG AA or better. Use realistic Thai riverside photography placeholders.
```

## Follow-up prompt (same project) — booking flow
```
Using the exact same "Riverside Calm" style, design the mobile booking flow (390px) as 4 screens:
1) Select room: available room types for the chosen dates, with the price per night and the total.
2) Guest details: full name, phone, email, nationality, and the number of adults/children.
3) Summary: dates, room, total price, and the hotel's cancellation note text.
4) Payment: a PromptPay QR code, the amount, a 15:00 countdown timer, "Upload payment slip", and a "Waiting for verification" state.
```
