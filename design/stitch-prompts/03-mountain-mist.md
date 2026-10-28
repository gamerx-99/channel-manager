# 03 — Mountain Mist

```
Design a one-page hotel website (landing page) for a small mountain resort in northern Thailand. Theme name: "Mountain Mist".

MOOD
Cool morning fog over forested hills, the sea of clouds, pine trees, and the smell of rain. Immersive and cinematic, with nature first.

SAMPLE HOTEL (use as placeholder content)
- Name: Mok Doi Resort (หมอกดอย รีสอร์ท)
- Intro: "Eight wooden cabins on a ridge above Pang Mapha. Wake up above the clouds, fall asleep to the forest."
- Address: Pang Mapha, Mae Hong Son, Thailand

VISUAL STYLE
- Palette: forest green #1F3B2D, moss #4F6B4A, mist grey #DDE3E0, fog white #F3F5F4, sunrise amber #E0A458 for accents only.
- Fonts: headings "Prompt" SemiBold; body "Noto Sans Thai".
- Soft gradient overlays that fade photos into mist-white. Large radius cards (20px) with frosted-glass panels (backdrop blur) over photos.
- Buttons: amber, pill-shaped, with dark green text.

LAYOUT SIGNATURE (make this theme recognisable)
- Hero: a full-screen (100vh) landscape photo of mountains in fog. The hotel name is large and centred. A frosted-glass booking bar floats at the bottom of the hero.
- About: the text overlaps a second photo, as if it were placed on the fog.
- Rooms: horizontal swipe carousel cards (big photo top, frosted info panel bottom), arrows on desktop.
- Gallery: a full-bleed alternating layout: one wide photo, then two side-by-side, then one wide, with captions in small caps.
- Location: a map placeholder in muted green tones with a floating address card.

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
2. Mobile landing page, 390px wide, with a sticky bottom bar showing "from ฿1,500" and a "Check availability" button.
Thai text must render correctly. Keep text contrast at WCAG AA or better, even over photos. Use realistic Mae Hong Son mountain photography placeholders.
```

## Follow-up prompt (same project) — booking flow
```
Using the exact same "Mountain Mist" style, design the mobile booking flow (390px) as 4 screens:
1) Select room: available room types for the chosen dates, with the price per night and the total.
2) Guest details: full name, phone, email, nationality, and the number of adults/children.
3) Summary: dates, room, total price, and the hotel's cancellation note text.
4) Payment: a PromptPay QR code, the amount, a 15:00 countdown timer, "Upload payment slip", and a "Waiting for verification" state.
```
