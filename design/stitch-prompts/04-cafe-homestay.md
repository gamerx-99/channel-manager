# 04 — Café Homestay

```
Design a one-page hotel website (landing page) for a cute homestay with a small café in northern Thailand. Theme name: "Café Homestay".

MOOD
Friendly, playful, Instagram-worthy. Pastel colours, rounded shapes, little hand-drawn doodles. It should feel like a cosy café where you can also sleep.

SAMPLE HOTEL (use as placeholder content)
- Name: Nap & Latte Homestay (แนป แอนด์ ลาเต้ โฮมสเตย์)
- Intro: "Three pastel rooms upstairs, slow coffee downstairs. Ten minutes from Pai Walking Street by bicycle."
- Address: Wiang Tai, Pai, Mae Hong Son, Thailand

VISUAL STYLE
- Palette: milk cream #FFF8EF, peach #F7C8A8, matcha #B7CFA4, baby blue #BFD9EA, cocoa #4A3426 for text.
- Fonts: headings "Mali" Bold (rounded, friendly, Thai-capable); body "K2D".
- Big rounded corners (28px), soft drop shadows, small hand-drawn doodles (coffee cup, cloud, leaf) as section ornaments. Photos in blob or polaroid frames tilted ±3°.
- Buttons: chunky pill buttons in cocoa with cream text, plus a little bounce hover state.

LAYOUT SIGNATURE (make this theme recognisable)
- Hero: a pastel peach background with a collage of 3 polaroid photos (exterior, room, coffee), the hotel name in large rounded type, and a rounded white booking card below it.
- Rooms: a 2-column grid of pastel-coloured cards. Each card has its own background colour (peach, matcha, baby blue). The photo sits in a rounded frame with name, guests and price under it.
- Gallery: a polaroid wall with handwritten-style captions under each photo.
- Location: a cute illustrated map pin with the address on a rounded card.

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
2. Mobile landing page, 390px wide, with a sticky bottom bar showing "from ฿890" and a "Check availability" button.
Thai text must render correctly. Keep text contrast at WCAG AA or better (cocoa text on pastel backgrounds). Use realistic Pai homestay and café photography placeholders.
```

## Follow-up prompt (same project) — booking flow
```
Using the exact same "Café Homestay" style, design the mobile booking flow (390px) as 4 screens:
1) Select room: available room types for the chosen dates, with the price per night and the total.
2) Guest details: full name, phone, email, nationality, and the number of adults/children.
3) Summary: dates, room, total price, and the hotel's cancellation note text.
4) Payment: a PromptPay QR code, the amount, a 15:00 countdown timer, "Upload payment slip", and a "Waiting for verification" state.
```
