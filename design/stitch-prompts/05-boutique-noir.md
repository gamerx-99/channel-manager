# 05 — Boutique Noir

```
Design a one-page hotel website (landing page) for an upscale boutique hotel in northern Thailand. Theme name: "Boutique Noir".

MOOD
Dark, intimate, high-end editorial, like a luxury fashion magazine. Deep charcoal, warm gold details, dramatic photo lighting. Quiet luxury, not flashy.

SAMPLE HOTEL (use as placeholder content)
- Name: The Saranrom Chiang Mai (เดอะ สราญรมย์ เชียงใหม่)
- Intro: "Twelve suites behind a colonial-era facade inside the old city walls. Private, unhurried, deliberately small."
- Address: Phra Sing, Mueang Chiang Mai, Thailand

VISUAL STYLE
- Palette: charcoal #141414, deep espresso #231C17, warm gold #B8955A, champagne #E9DFCF for text, muted stone #8C8279.
- Fonts: headings "Taviraj" Light (an elegant Thai serif) with Latin "Playfair Display"; body "Bai Jamjuree" Light.
- Thin gold 1px lines, large serif numerals as section markers (I, II, III), and generous negative space. Photos are high contrast and slightly desaturated.
- Buttons: transparent with a gold 1px border and champagne uppercase text with wide tracking. Hover fills with gold.

LAYOUT SIGNATURE (make this theme recognisable)
- Hero: a dark full-width photo with a slow-zoom feel. The hotel name sits bottom-left in large thin serif. The booking bar is a slim gold-bordered strip along the bottom edge.
- About: an editorial layout with an oversized drop-cap first letter, beside a tall portrait photo.
- Rooms: one room per full-width "chapter". A large photo alternates left/right, with the room name in serif, "up to N guests", "from ฿4,500 / night" and a gold "Reserve" button.
- Gallery: a dark grid where hovering a photo shows its caption in gold serif.
- Location: a dark-styled map placeholder with a gold pin and the address in champagne text.

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
2. Mobile landing page, 390px wide, with a sticky bottom bar showing "from ฿4,500" and a "Check availability" button.
Thai text must render correctly. Keep text contrast at WCAG AA or better on the dark background. Use realistic boutique-hotel photography placeholders.
```

## Follow-up prompt (same project) — booking flow
```
Using the exact same "Boutique Noir" style, design the mobile booking flow (390px) as 4 screens:
1) Select room: available room types for the chosen dates, with the price per night and the total.
2) Guest details: full name, phone, email, nationality, and the number of adults/children.
3) Summary: dates, room, total price, and the hotel's cancellation note text.
4) Payment: a PromptPay QR code, the amount, a 15:00 countdown timer, "Upload payment slip", and a "Waiting for verification" state.
```
