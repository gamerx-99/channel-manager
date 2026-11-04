# Codex prompt: draft and publish for the website builder

Read `CLAUDE.md`, `.agent/BANNED_ZONE.md`, `.agent/DECISIONS.md` (the 2026-11-04 "Website changes need เผยแพร่" row), `specs/ui-house-style.md` and `docs/thai-glossary.md` first.

## Where to work

- Worktree: `C:\WORK\channel-manager\.claude\worktrees\account-deletion`
- Branch: `feat/signup-integration`
- You cannot commit. Leave the work uncommitted; Claude reviews and commits it.
- Do not push, deploy or apply migrations remotely. Do not touch `client/public/_headers`, `.github/` or `client/src/index.css`.
- If `pnpm` fails with `ERR_PNPM_STORE_DIR_OPEN_OPERATION_LOCK`, call the binaries in `.\node_modules\.bin\` directly. Do not stop.
- Write the `.agent/handoff.md` entry and your report **before** the final checks.
- **Migrations.** Generate with drizzle-kit. Then rename the SQL file and its `meta/` snapshot to this repo's dated pattern (`YYYYMMDDHHMMSS_name.sql` and `YYYYMMDDHHMMSS_name_snapshot.json`), use a timestamp later than `20261104010000`, and update the journal `tag` to match. drizzle-kit picks the latest snapshot by file name, so a `0016_snapshot.json` would break the next migration. Never hand-write the SQL. If drizzle-kit fails on the pnpm lock, run `.\node_modules\.bin\drizzle-kit.cmd generate --config drizzle.d1.config.ts`. After renaming, run generate once more; it must say `No schema changes`.

## Owner decision (2026-11-04). Do not change it or add to it.

- **Buttons:** the website builder (`client/src/pages/WebsiteBuilder.tsx`) gets **"บันทึกร่าง"** (save draft) and **"เผยแพร่"** (publish), with the note **"การเปลี่ยนแปลงจะแสดงแก่ผู้เข้าชมหลังเผยแพร่"**.
- **Guests see only the published version.**
- **Open booking pages:** a guest who already has the booking page open keeps the page they loaded until they finish. Changes apply to new visits. No random delays and no surprise reloads.

## Current state (Claude checked)

- `saveHotelSiteConfig` writes `hotel_site_config` directly, so every save is live at once. There are two mutations in `WebsiteBuilder.tsx`: `saveConfigMut` and `saveThemeMut`.
- Media changes are live at once too: upload, delete, set hero, image position.

## Task

1. **Data.** Add a draft next to the live config. For example, a nullable `draft_json` text column on `hotel_site_config`, plus `draft_updated_at` and `published_at`. Generate the migration (`pnpm exec drizzle-kit generate --config drizzle.d1.config.ts`), check the journal lands in `drizzle/d1/meta`, and apply it locally only.
   - **"บันทึกร่าง"** validates with the same rules as today, then writes only the draft.
   - **"เผยแพร่"** copies the draft into the live columns in one statement or batch, clears the draft, and sets `published_at`.
   - The public procedures keep reading **only the live columns**. Add a test proving that a saved draft does not change what the public procedure returns.
   - Permission: the same check `saveHotelSiteConfig` uses today. Follow the existing pattern (permission first, then `try/catch` with `rethrowDomainError`).
2. **Builder UI.**
   - The builder shows and edits the draft when one exists; otherwise it shows the live config.
   - It shows a clear status: "มีการเปลี่ยนแปลงที่ยังไม่เผยแพร่", or the published date.
   - Add a **"ยกเลิกร่าง"** button that discards the draft and goes back to the live version, after a confirm dialog. This is needed so the owner is never stuck. Mark it ASSUMPTION and log it.
   - The theme picker also saves to the draft.
   - The "ดูหน้าเว็บที่พัก" preview: if a preview of the draft is easy and safe (owner only, never public), add it. Otherwise log it as a question.
3. **Media.** Decide carefully and say what you chose.
   - The safest default that fits the decision: the hero choice and image position become part of the draft, so they show only after publishing.
   - Uploads stay immediate. A new upload is not shown publicly until it is used, so it changes nothing.
   - Deleting an image the live page uses must be blocked, or must ask for confirmation, so the live page never breaks.
   - Mark each choice ASSUMPTION and log it.
4. **Guests with the page open.** On the public page (`client/src/components/public-hotel/usePublicHotelPage.ts` and related files):
   - the hotel and site-config queries must not refetch on window focus, reconnect or an interval while the page is open. Use `refetchOnWindowFocus: false`, `refetchOnReconnect: false` and a long `staleTime`;
   - availability and prices may refresh as they do today;
   - the booking wizard state must never reset because of a config change.
   - Add a test for the query options.
5. **Text:** Thai first and natural, plus English in the i18n files. Placeholders use `{{name}}`. The glossary test must pass.

## Tests and checks

- Router tests:
  - save-draft and publish permissions (an owner is allowed; another hotel's owner is FORBIDDEN);
  - the public output does not change until publish.
- A string-contract test for the builder buttons and the note text.
- `pnpm test`, `pnpm check` and `pnpm build`: paste the real output.
- **Browser** (local `wrangler dev`, a local owner):
  1. change the hero text;
  2. save the draft;
  3. check that the public page still shows the old text;
  4. publish;
  5. check that a new visit shows the new text.

  Also open the public page in a second tab, publish, and check that the open tab does not change by itself. Check at 1280px and 375px. Never claim a check you did not do.

## Report

1. The files changed.
2. The migration file name.
3. The media choices you made.
4. Test, check and build output.
5. Browser results, and anything not checked.
6. Every ASSUMPTION and every logged question.
