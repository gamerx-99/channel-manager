# Owner requests — running list

The owner types requests as they see them. Claude logs each one here the moment it arrives,
groups them into the current batch, and reports once per batch (one deploy question).

## Batch 2026-11-04 (b)

| # | Request (owner's words, short) | Status |
|---|---|---|
| 1 | Font Mitr instead of Mali | done, committed 5ef792c |
| 2 | Hotel detail: remove "โรงแรม / id", duplicate edit menu, stray "L" | done, b9d35f8 |
| 3 | Sidebar: add "บริการเสริม" | done, ce8d140 |
| 4 | Photos: captions, 6 shown + 1 cover, caption instead of file name | Codex working |
| 5 | Map on every hotel site: lat/long or pick on map | queued after #4 |
| 7 | DONE 53f8023 (note: that commit also picked up 5 unused photo-caption i18n keys Codex had added; harmless). Landing images look poor: the drawn house in the hero and the gradient placeholders on the 3 theme cards. Replace with real images (theme cards = real screenshots of each theme with photos; hero = Little Bro real photo, see waiting list) | to do after #4. Source: `design/stitch-fnish/` (owner, 2026-11-04: "รูป+เว็บสำเร็จ มีตั้งเยอะ"). Plan: pull the photos from the Stitch designs (01 Lanna Teak, 02 Minimal White, 04 Café Homestay), load them into a local demo hotel per theme, screenshot our REAL themes for the 3 cards; hero = best photo (e.g. Lanna roof at dusk). Do not present Stitch mockups as our themes. |
| 8 | "รูปแบบทำไว้เยอะ แต่เอาขึ้นเว็บแค่ 3 อัน": 8 Stitch theme designs exist in `design/themes/` (01–08), only 3 are built (Lanna Teak, Minimal White, Café Homestay). Build the other 5 (03 Mountain Mist, 05 Boutique Noir, 06 Hostel Pop, 07 Riverside Calm, 08 Vintage Old Town) as real themes, then show them on the landing. Landing shows only built themes until then. | queued (Codex, after #5/#6) |
| 6 | Contact fields (phone, Facebook page, Instagram, X), each with a show checkbox; shown at the bottom after the address | queued with #5 (same dialog, same migration) |

## Waiting / not started

- Logo placement (owner: "ยังไม่ต้องเริ่ม ขอดูหลายๆจุดก่อน")
- Little Bro screenshots on the landing page (needs the published Little Bro link)
- Passkey (parked on `wip/passkey`)
- Website builder UI split (restructure phase 2, second half)
