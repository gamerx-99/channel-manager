# Codex brief: hotel photos — captions, up to 6 shown + 1 cover

Read `CLAUDE.md`, `.agent/BANNED_ZONE.md`, `docs/thai-glossary.md` and `specs/ui-house-style.md` (file roles at the end) first.

## Where to work

- Folder `C:\WORK\channel-manager`, branch `main`. **No worktree, no new branch.** Do not commit, push or deploy. Never apply a migration to a remote database.
- Use `.\node_modules\.bin\vitest.cmd run`, `.\node_modules\.bin\tsc.cmd --noEmit`, `.\node_modules\.bin\vite.cmd build` if `pnpm` hits the store lock. If Vitest hits Windows Temp `EPERM`, set `TEMP`/`TMP` to `.tmp` in the repo as you did last time.

## What the owner asked (2026-11-04, verbatim)

> รูปที่พักตอนนี้มันเพิ่มได้แต่รูปเดียว ให้เพิ่มคำอธิบายของรูปในหน้าเพิ่มรูป และ ให้เลือกแสดงรูป 6 รูป บนหน้าเว็ป โดยคำอธิบายใต้รูปจะมาโผล่ตรงหน้าเว็ปแทนชื่อไฟล์ สรุปแล้วโรงแรมจะสามารถใช้รูปเพื่อแสดงหน้าเว็ป 7 รูป รูปที่พัก 6 กับปก 1

So:

1. **Adding photos:** the owner can add more than one photo (today it feels like only one: check the file input and the upload flow; allow selecting several files at once, each still checked with the existing type/size rules).
2. **Caption per photo** in the website builder's photo section: a text field under each photo, saved to `hotel_media.caption` (the column already exists). Today the upload seems to store the file name as the caption: find where, and stop showing the file name to guests. A new upload starts with an empty caption.
3. **Choose which photos are shown:** the owner marks up to **6** photos as "show on website" (property photos), plus **1** cover (the existing hero). Total on the guest site = 7. If the owner tries to pick a 7th property photo, block it with a clear Thai message.
4. **Guest site:** shows the cover and the chosen (max 6) property photos, each with its caption under it. If a photo has no caption, show nothing under it (never the file name). Apply this to the plain public page (`PublicHotel.tsx`) **and** all three theme landings in `client/src/components/hotel-themes/` (`MinimalWhiteLanding`, `LannaTeakLanding`, `CafeHomestayLanding`). Look at how each one uses `media` today (some reuse media as room-card images) and keep the layout; only change which photos appear and what text appears.

## Rules

- **Draft/publish:** the builder has "บันทึกร่าง" / "เผยแพร่" (`server/d1/siteConfig.ts`, `draftJson` carries `heroMediaId` and `mediaPositions`). Captions and the shown selection are website content, so follow the same pattern: they go into the draft and reach guests only on publish. Read how `mediaPositions` works and do the same for captions and selection.
- **Schema:** if you need a new column (for example a "shown" flag or order), change `drizzle/d1-schema.ts` and generate the migration with `pnpm exec drizzle-kit generate --config drizzle.d1.config.ts`. Then rename the SQL file and its snapshot to `YYYYMMDDHHMMSS_name.sql` / `..._snapshot.json` (later than the latest file in `drizzle/d1/`) and update the journal tag. **Never hand-write SQL.** Run generate again and confirm "No schema changes". Prefer reusing existing columns (`is_published`, `display_order`, `caption`) if they fit without changing what they mean today; explain the choice.
- **Server:** every new or changed procedure checks `requireHotelPermission(..., 'property.manage_profile')` (same as the existing media procedures; check them) and uses `try { } catch (error) { return rethrowDomainError(error); }`. The limit of 6 is enforced **on the server**, not only in the UI. Put it in one shared constant (for example in `shared/`) used by both.
- **Caption length:** ASSUMPTION (not stated by the owner): max 120 characters, trimmed. Log it in `.agent/OPEN_QUESTIONS.md`.
- **How many photos can be uploaded in total** was not stated. Keep whatever limit exists today; log the question in `.agent/OPEN_QUESTIONS.md`.
- **File roles:** new logic in `client/src/components/website-builder/useWebsiteBuilder.ts` / `websiteBuilderRules.ts`; new styles in `website-builder.css`; no new `style={{ }}`.
- **Thai copy:** natural, short, follows the glossary. Add th + en keys. Suggested: label "คำอธิบายรูป", toggle "แสดงบนเว็บไซต์", counter "แสดงอยู่ {n}/6 รูป", limit message "เลือกแสดงได้สูงสุด 6 รูป เอารูปอื่นออกก่อน".

## Tests

- Unit test for the limit rule and caption trimming.
- Mocked-router test: a 7th shown photo is rejected; a user without `property.manage_profile` cannot set captions or selection.
- Update the theme landing tests so they assert caption text appears and a file name does not. Never delete or loosen an existing assertion; list every test change with the reason.
- Run full test, check and build; paste real output.

## Report (write it to the report file)

1. Files changed and what each change does.
2. Schema choice and the migration file name (or "no migration").
3. Where the file name was being shown, and how that is fixed.
4. Test changes with reasons.
5. Real test, check and build output.
6. Open questions logged. Never claim a check you did not run.
