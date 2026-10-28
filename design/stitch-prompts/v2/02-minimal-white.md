# 02 Minimal White: "Haus Nimman"

Fits: modern small hotels and apartments around Nimman and the city. It is neutral, so it suits any hotel. This is the reference for the shared booking flow.
Style to keep:
- Colours: white and stone surfaces, charcoal text, muted olive primary #4f5d48.
- Font: IBM Plex Sans. Add **IBM Plex Sans Thai**.
- Layout: hairline dividers, generous whitespace, numbered labels ("Room 01").

Screens in project 8759744681060323660:

| Screen | ID | Action |
|---|---|---|
| Desktop landing | 18d35a6f1d794898a0742b7a9111e711 | REFINE (prompt A). DONE 2026-10-28, new screen `5ae89cc3670746159ad14353a34b57da`, saved in `design/themes-v2/02-minimal-white/desktop/`. One leftover: a hidden mobile bottom nav with "Amenities" and "Concierge", now covered by the shared rules. |
| Mobile landing | 6033d84afcd74638b7fef25f686b5b83 | REFINE (prompt B) |
| Booking 1 Select room | d4f4c36939a2446ba2cb306f3190ba74 | REFINE (prompt C1) |
| Booking 2 Guest details | 4a97dfb7d6f44660949b687017579689 | REFINE (prompt C2) |
| Booking 3 Summary | c297ac2f13914566aaa13a3d3398bbf6 | REFINE (prompt C3) |
| Booking 4 Payment | 2ecefd1c10a6461eb1e95cb09859592f | REFINE (prompt C4) |

## Prompt A: desktop landing refine
```
Keep this exact layout, typography and colours. Only change content.
REMOVE: "PromptPay QR & Direct Wire accepted" → "Pay by Thai PromptPay QR"; the counter "01 — 03 of 06" above rooms; the "Walking distance" block in Location (fold one short sentence into the intro instead); the "Suite 01 / Morning Light" photo label.
GALLERY: max 8 photos with captions. Replace the first photo, which is a website screenshot, with an exterior photo.
Thai text in IBM Plex Sans Thai.
{{DATA RULES}}
```

## Prompt B: mobile landing refine
```
Keep this exact layout and typography. Only change content and images.
REMOVE the grayscale filter from ALL photos; show them in natural colour. Remove "03 AVAILABLE" and the "01 / ARCHITECTURE" photo label. Location: the address plus a map only; remove the km/minutes line.
Thai text in IBM Plex Sans Thai.
{{DATA RULES}}
```

## Prompt C1–C4: booking refine (one per screen)
```
Keep this screen's layout and style. Make it match step {{N}} below exactly; remove anything not listed.
C1 Select room: remove the amenity bullet lists, SQM, the "Live Rates" label and the "Reservation terms" box. Keep the photo, name, max guests, optional bed type, price per night and stay total. Keep "1 of 2 left" only as "Only 1 left".
C2 Guest details: remove "Plan: Slow Tea Incl.", the house-rules checkbox and the "Taxes & Fees Included" line. Make the adults/children steppers read-only text. Make email optional. Add the Add-ons section and the unticked offers checkbox. Put the Thai labels on the same line as the English ones, so they do not wrap under them.
C3 Summary: remove "Courtyard view • 32 m²", check-in/out times, the "Taxes & service charges" and "Local hospitality levy" rows, the whole cancellation box, "Verified instantly" and the quote. Add one line per night and per add-on.
C4 Payment: remove "verifies transfers within 5 minutes", "door code via SMS/Email" and the "Concierge Desk" link. The account name under the QR is the hotel name only. Fix the room line so it matches the summary (Standard King, 3 nights).
{{BOOKING FLOW}}
{{DATA RULES}}
```
