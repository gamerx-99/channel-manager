# Codex #1: 13-06b security fix, then 13-06c

Folder: `C:\WORK\channel-manager-c`. Branch: `agent-c/d1-schema`.
- No push, merge or deploy. Do not read `.env`.

13-06a (db406e6) and 13-06b (9915c6a) are reviewed. The iCal guard, redirects, size/time limits, Cron isolation, the `wrangler.toml` diff, and the key/prefix checks are all good.

There is one must-fix before anything else.

## 1. Fix (13-06b): stored XSS through uploaded media on our own origin
`validateHotelMediaUpload` accepts any `image/*`, including `image/svg+xml`.
- It takes the extension from the client filename.
- `/media/:hotelId/:file` serves the object from the app origin with the stored Content-Type.

An SVG with `<script>`, opened directly at `/media/...`, runs on our domain. Any user who can manage a hotel profile can plant one and target staff or super admins. The Supabase version served files from another origin; R2 serves them from ours.

Make all of these changes, one commit (`fix(media): ...`):
- **Allowlist** only `image/jpeg`, `image/png`, `image/webp`, `image/gif` and `image/avif`. Reject everything else with 400, SVG included.
- **Check the magic bytes** of the decoded data and require them to match the declared type. Reject on mismatch.
  - JPEG `FF D8 FF`; PNG `89 50 4E 47 0D 0A 1A 0A`; GIF `GIF87a`/`GIF89a`; WebP `RIFF....WEBP`; AVIF `ftyp` at offset 4 with brand `avif`/`avis`.
- **Derive the extension from the verified type**, never from the client filename: jpg / png / webp / gif / avif.
  - Update `validateHotelMediaObjectKey`'s filename regex to allow only those 5 extensions.
- **Serve with a fixed Content-Type** derived from the key's extension, not the stored metadata.
  - Add `Content-Security-Policy: default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox` and `Cross-Origin-Resource-Policy: same-site`.
  - Keep `X-Content-Type-Options: nosniff`.
  - Any key whose extension is not in the allowlist → 404.
- **Order of operations on delete**: delete the DB row first (scoped to the hotel), then the R2 object. If the R2 delete fails, log it safely and still return success, so no row is left pointing at a missing object.
  - ASSUMPTION: an orphaned R2 object is harmless, while a row pointing at a missing object is a broken image. Write this as a code comment.
- **Tests**:
  - SVG is rejected.
  - `text/html` declared as `image/png` with HTML bytes is rejected.
  - PNG bytes declared as `image/jpeg` are rejected.
  - A filename `x.html` still produces a `.png` key.
  - Serving a key with `.svg` or `.html` returns 404.
  - The serve response carries the CSP, nosniff and CORP headers.
  - Delete removes the row even if the R2 delete throws.

Also mirror the allowlist on the client (`WebsiteBuilder.tsx`: `accept="image/jpeg,image/png,image/webp,image/gif,image/avif"`, plus the same type check before upload). That is a separate commit (`fix(website-builder): ...`), because it also protects the live Supabase app today.

## 2. Then 13-06c: SlipOK AES-GCM via WebCrypto + TM.30 template as an asset
- Find the current SlipOK key encryption and decryption (Node `crypto`) and add a Workers-safe version using `crypto.subtle` AES-GCM.
  - The encrypted format must stay byte-compatible: rows encrypted by the live app must decrypt in the Worker.
  - Prove it with a test that encrypts with the old Node code and decrypts with the new code, and the reverse.
  - The key comes from a Worker secret binding. Never log it.
- TM.30: load the template without `node:fs`, either through a bundled import (`?raw`/`?arraybuffer` or a generated TS module) or the ASSETS binding.
  - Output must stay identical: a test compares the old Node output with the new output for the same input.
- One commit per concern. Do not change the live Node paths, which stay until cutover.

## Done
- Paste real `pnpm test` output (only the 7 known env-only failures allowed), `pnpm check` and `pnpm build`.
- Commits listed, plus a handoff entry per ticket.
- Stop after 13-06c.
