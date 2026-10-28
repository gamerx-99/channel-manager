# 06 — Hostel Pop

```
Design a one-page hotel website (landing page) for a fun backpacker hostel in northern Thailand. Theme name: "Hostel Pop".

MOOD
Loud, young, energetic, budget-friendly. Neo-brutalist web style: thick black outlines, flat bright colours, sticker-like shapes, big bold type. It should feel like meeting new friends.

SAMPLE HOTEL (use as placeholder content)
- Name: Lazy Gecko Hostel (เลซี่ เก็คโค่ โฮสเทล)
- Intro: "Dorm beds from ฿250, private rooms for two, rooftop for sunsets. Five minutes' walk to Tha Phae Gate."
- Address: Chang Moi, Mueang Chiang Mai, Thailand

VISUAL STYLE
- Palette: electric yellow #FFD23F, hot pink #FF5D8F, sky cyan #3BCEAC, white #FFFFFF, pure black #000000 for outlines and text.
- Fonts: headings "Kanit" ExtraBold, uppercase for Latin, with tight line height; body "Kanit" Regular.
- 3px black borders on cards and buttons, hard offset shadows (6px 6px 0 black, no blur), slightly rotated sticker badges ("Best for solo!", "Rooftop!").
- Buttons: yellow with a black border and hard shadow. The pressed state shifts the button down-right.

LAYOUT SIGNATURE (make this theme recognisable)
- Hero: a yellow background with a huge hostel name across 2–3 lines and a tilted photo with a black border overlapping the text. A chunky booking box has black borders.
- Rooms: cards in a row, each with a different bright background colour, a black-bordered photo, the price displayed huge ("฿250") and "per bed / night" or "per room / night" under it.
- Gallery: a bento grid of mixed-size tiles with black borders and captions as sticker labels.
- Location: a map placeholder in a black-bordered box with a big pink pin sticker.

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
2. Mobile landing page, 390px wide, with a sticky bottom bar showing "from ฿250" and a "Check availability" button.
Thai text must render correctly. Keep text contrast at WCAG AA or better (black on bright colours). Use realistic Chiang Mai hostel photography placeholders.
```

## Follow-up prompt (same project) — booking flow
```
Using the exact same "Hostel Pop" style, design the mobile booking flow (390px) as 4 screens:
1) Select room: available room types for the chosen dates, with the price per night and the total.
2) Guest details: full name, phone, email, nationality, and the number of adults/children.
3) Summary: dates, room, total price, and the hotel's cancellation note text.
4) Payment: a PromptPay QR code, the amount, a 15:00 countdown timer, "Upload payment slip", and a "Waiting for verification" state.
```
