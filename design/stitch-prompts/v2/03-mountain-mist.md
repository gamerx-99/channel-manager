# 03 Mountain Mist: "Mok Doi Resort"

Fits: cabins and resorts in Pang Mapha, Pai and on the Doi (Mae Hong Son mountains).
Style to keep:
- Colours: misty sage and white surfaces, deep forest green, warm amber primary buttons.
- Fonts: Epilogue (headings) with Noto Sans (body). Add **Noto Sans Thai**.
- Layout: a big panoramic hero with a frosted booking bar; rounded cards.

Screens in project 8759744681060323660:

| Screen | ID | Action |
|---|---|---|
| Desktop landing | db805c504d0d4a8199b654bd0c4c47fc | REFINE (prompt A) |
| Mobile landing | 2ada94e1e5384572a764585db32e3d8e | REFINE (prompt B) |
| Booking 1 | 8817d32524084256ac8bba95911d0014 | REFINE (prompt C) |
| Booking 2 | 45018386b45042e29099d8a24567c16d | REFINE (prompt C) |
| Booking 3 | 240d9e4767d148a2b1e292583b76ef5f | REFINE (prompt C) |
| Booking 4 | 86967c1ea22743b1a1a1999e6e64cb88 | REFINE (prompt C) |

## Prompt A: desktop refine
```
Keep this layout, hero, frosted booking bar, colours and fonts. Only change content.
REMOVE: the "Morning Mist Index 98%" and "1,100m Altitude" chips; the three feature chips under the intro; the "Cabin 01/02/03" ribbon numbers if they read as counters (keep them only as small labels); the map side panel with trails, elevation and airport data (keep the address card and the map); the footer links "Privacy Policy" and "Terms of Service".
The intro photo must be a real photo, not a website mock-up.
Thai text in Noto Sans Thai.
{{DATA RULES}}
```

## Prompt B: mobile refine
```
Keep this layout and style. Remove the mist/altitude chips, feature chips, and trail/elevation data. Location is the address plus a map. Keep the sticky "Check availability" bar. Thai text in Noto Sans Thai.
{{DATA RULES}}
```

## Prompt C: booking refine (one run per screen, put the step number in)
```
Keep this screen's layout and style. Make it match step {{N}} exactly; remove anything not listed: no cancellation/refund text, no reviews, no taxes, no "instant", "SMS" or "within N minutes", and no phone or concierge. Step 2 gets the Add-ons section and the unticked offers checkbox, with guests read-only.
{{BOOKING FLOW}}
{{DATA RULES}}
```
