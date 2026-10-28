# 01 — Lanna Teak

```
Design a one-page hotel website (landing page) for a small family-run hotel in northern Thailand. Theme name: "Lanna Teak".

MOOD
Warm, handcrafted, traditional Lanna. It should feel like stepping into an old teak house: dark wood, woven textures, warm lamp light. Elegant but humble, not luxury-cold.

SAMPLE HOTEL (use as placeholder content)
- Name: Baan Mai Sak Lamphun (บ้านไม้สัก ลำพูน)
- Intro: "A 90-year-old teak house turned into four quiet rooms, five minutes' walk from Wat Phra That Hariphunchai."
- Address: Nai Mueang, Lamphun, Thailand

VISUAL STYLE
- Palette: teak brown #5B3A21, warm cream #F4ECDD, lacquer red #9E2B25, gold leaf #C9A45C, ink #2A211B.
- Fonts: headings "Noto Serif Thai" (Latin fallback "Cormorant Garamond"); body "Sarabun".
- Decorative details: thin Lanna-pattern line dividers (kanok motif), subtle paper or woven texture on cream backgrounds, photos with soft rounded-top arch frames like temple windows.
- Buttons: solid lacquer red, cream text, small radius (4px).

LAYOUT SIGNATURE (make this theme recognisable)
- Hero: full-width photo of the house exterior. The hotel name sits in a cream box with an arch top, centred over the lower third of the photo, with the date picker directly under it.
- About: two columns. Left is an arch-framed photo; right is the intro text with a gold divider.
- Rooms: vertical list. Each room is a horizontal card: photo on the left, with name, "up to N guests", "from ฿1,200 / night" and a "Select" button on the right.
- Gallery: a masonry grid of up to 8 photos with captions shown on hover (desktop) or under the photo (mobile).
- Location: an address card over a muted sepia map placeholder.

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
2. Mobile landing page, 390px wide, with a sticky bottom bar showing "from ฿1,200" and a "Check availability" button.
Thai text must render correctly. Keep text contrast at WCAG AA or better. Use realistic northern-Thailand photography placeholders.
```

## Follow-up prompt (same project) — booking flow
```
Using the exact same "Lanna Teak" style, design the mobile booking flow (390px) as 4 screens:
1) Select room: available room types for the chosen dates, with the price per night and the total.
2) Guest details: full name, phone, email, nationality, and the number of adults/children.
3) Summary: dates, room, total price, and the hotel's cancellation note text.
4) Payment: a PromptPay QR code, the amount, a 15:00 countdown timer, "Upload payment slip", and a "Waiting for verification" state.
```
