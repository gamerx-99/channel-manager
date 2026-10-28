# 02 — Minimal White

```
Design a one-page hotel website (landing page) for a small modern hotel in northern Thailand. Theme name: "Minimal White".

MOOD
Quiet, airy, Scandinavian-Japanese minimalism. Lots of white space, few colours, and big photography doing the work. Calm and confident.

SAMPLE HOTEL (use as placeholder content)
- Name: Haus Nimman (เฮาส์ นิมมาน)
- Intro: "Six white rooms on a quiet soi off Nimmanhaemin. Concrete, linen, morning light, nothing extra."
- Address: Suthep, Mueang Chiang Mai, Thailand

VISUAL STYLE
- Palette: white #FFFFFF, off-white #F6F6F4, graphite #1E1E1E, mid grey #8A8A86, a single accent of sage #7C8B74 used ONLY for buttons and links.
- Fonts: headings "IBM Plex Sans Thai" in light weight with wide letter-spacing on Latin uppercase labels; body "IBM Plex Sans Thai" regular.
- No decorative graphics at all. Thin 1px grey hairlines, square corners (0px radius), generous 120px section spacing on desktop.
- Buttons: graphite outline buttons; the primary button is solid sage.

LAYOUT SIGNATURE (make this theme recognisable)
- Hero: a split screen. The left 40% is white with the hotel name in large light type, the intro, and a compact horizontal date picker. The right 60% is one tall photo, edge to edge.
- Rooms: a 3-column grid of square photos. Room name and "from ฿1,800" sit as plain text under each photo, with no card boxes.
- Gallery: a horizontal scroll strip of large photos with small grey captions underneath, numbered 01–08.
- Location: plain text address on the left, grayscale map placeholder on the right.

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
2. Mobile landing page, 390px wide, with a sticky bottom bar showing "from ฿1,800" and a "Check availability" button.
Thai text must render correctly. Keep text contrast at WCAG AA or better. Use realistic Chiang Mai photography placeholders.
```

## Follow-up prompt (same project) — booking flow
```
Using the exact same "Minimal White" style, design the mobile booking flow (390px) as 4 screens:
1) Select room: available room types for the chosen dates, with the price per night and the total.
2) Guest details: full name, phone, email, nationality, and the number of adults/children.
3) Summary: dates, room, total price, and the hotel's cancellation note text.
4) Payment: a PromptPay QR code, the amount, a 15:00 countdown timer, "Upload payment slip", and a "Waiting for verification" state.
```
