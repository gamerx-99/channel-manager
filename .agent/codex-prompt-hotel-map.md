# Codex brief: map on every hotel website (lat/long or pick on a map)

Read `CLAUDE.md`, `.agent/BANNED_ZONE.md`, `docs/thai-glossary.md` and `specs/ui-house-style.md` (file roles at the end) first. Run this **after** the photo-captions ticket; build on top of it.

## Where to work

- Folder `C:\WORK\channel-manager`, branch `main`. No worktree, no new branch. Do not commit, push or deploy. Never apply a migration to a remote database.
- Use the `.\node_modules\.bin\*.cmd` tools if `pnpm` hits the store lock; set `TEMP`/`TMP` to `.tmp` if Vitest hits `EPERM`.

## What the owner asked (2026-11-04, verbatim)

> ให้เพิ่มแผนที่เข้าหน้าเว็ปทุกเว็ป โดยให้ใส่ La กับ Long หรือเลือกเองจากแผนที่

## Decisions already made (do not change)

- **Map provider: OpenStreetMap tiles with Leaflet** (`leaflet` + `react-leaflet`, add with `pnpm add`, exact current stable versions). No API key, no cost. Show the required OSM attribution.
- **Guests also get a "นำทางด้วย Google Maps" link**: `https://www.google.com/maps/dir/?api=1&destination=<lat>,<lng>` (opens in a new tab, `rel="noopener noreferrer"`). No Google API, no key.
- The location is a fact about the hotel, so it is stored on the **hotel** (new nullable `latitude` / `longitude` columns on `hotels`, REAL), not in the website draft. It shows on the guest site right after saving, like the address does today.

## Task

1. **Schema:** add the two nullable columns in `drizzle/d1-schema.ts`; generate with `pnpm exec drizzle-kit generate --config drizzle.d1.config.ts`; rename SQL + snapshot to `YYYYMMDDHHMMSS_name.sql` / `..._snapshot.json` later than the newest file in `drizzle/d1/`; update the journal tag; regenerate to confirm "No schema changes". Never hand-write SQL.
2. **Server:** extend the existing hotel update procedure (the one behind "แก้ไขข้อมูลโรงแรม" in `HotelDetail.tsx`) with optional `latitude` (−90..90) and `longitude` (−180..180), both or neither. Same permission check as today. Return them from the hotel query and from the public hotel query.
3. **Owner UI** (in the "แก้ไขข้อมูลโรงแรม" dialog, under the address):
   - two number fields "ละติจูด" and "ลองจิจูด" (owners can paste from Google Maps; also accept one pasted "lat, lng" string in the first field and split it);
   - a small Leaflet map: click or drag the pin to set the point; typing in the fields moves the pin;
   - default view when empty: Mae Hong Son town (19.30, 97.97), zoom 13; a "ล้างตำแหน่ง" button clears both.
   - The dialog is a Radix modal used by the guided tour; keep its existing `onInteractOutside` behaviour and check the map's clicks do not close it.
4. **Guest site:** when the hotel has a location, show a map with the pin plus the Google Maps link in the location section — the plain page (`PublicHotel.tsx`) and all three theme landings in `client/src/components/hotel-themes/`. Respect `visibleSections.location` (hidden when the owner turned it off). No location → no map, nothing broken. Map not interactive-scroll-trapping on phones (disable scroll-wheel zoom; one-finger page scroll must still work).
5. **Lazy-load Leaflet** (dynamic import) so it is not in the main bundle for pages without a map.
6. **CSP:** `client/public/_headers` has `Content-Security-Policy-Report-Only` with `img-src`. Add `https://tile.openstreetmap.org` (and the `a/b/c` subdomains if you use them) to `img-src`. Change nothing else in that file.
7. **File roles:** logic (parse/validate coordinates) in a pure `.ts` with unit tests; styles in CSS files; no new `style={{ }}`.
8. **Thai copy:** natural and short; th + en keys.

## Part B (same ticket, same migration): contact links

Owner (2026-11-04, verbatim): "ช่องใส่ข้อมูลติดต่อ 1. เบอร์โทรโรงแรม 2. เฟสบุ๊คแฟนเฟจ 3. อินสตาแกรม 4. X — มีช่องติ๊กถูกหน้ากรอบ ให้ลูกค้าเอาลิงค์มาใส่เอง ถ้าติ๊กถูกก็แสดงหน้าเวปเอาไว้ตรงข้างล่างสุดต่อจากที่อยู่"

1. Four contact fields on the hotel, each with its own "show on website" checkbox in front of it: hotel phone, Facebook page link, Instagram link, X link. Store on `hotels` (nullable text + boolean show flag each), in the same migration as the map columns. Check first whether the hotel already has a phone/contact column; reuse it if it means the same thing, and explain.
2. Owner UI: in the "แก้ไขข้อมูลโรงแรม" dialog, a "ช่องทางติดต่อ" group under the location.
3. Validation (pure `.ts`, unit tested): phone = digits, spaces, `+`, `-` only; links must be `https://` and the host must match the network (`facebook.com`/`fb.com`/`m.facebook.com`, `instagram.com`, `x.com`/`twitter.com`). A checked box with an empty field is rejected with a Thai message.
4. Guest site: only checked and filled items show, at the very bottom of the page, **after the address** (footer area), on the plain page and all three themes. Phone is a `tel:` link; social links open in a new tab with `rel="noopener noreferrer"`. Use simple icons from `lucide-react` if they exist (Phone, Facebook, Instagram); for X use a text label "X" if there is no icon. Nothing checked → nothing shown.
5. Server: same permission and error pattern as the hotel update; validation runs on the server too.

## Tests

- Unit tests: coordinate validation and the "lat, lng" paste parser.
- Mocked-router test: out-of-range or half-filled coordinates rejected; a user without the edit permission cannot set them.
- Theme/public tests: map section and Google link appear with a location, and are absent without one or when `location` is hidden. Never loosen an existing assertion.
- Run full test, check and build; paste real output.

## Report (write it to the report file)

Files changed, migration file name, bundle note (is Leaflet in a separate chunk?), test changes with reasons, real output, open questions. Never claim a check you did not run.
