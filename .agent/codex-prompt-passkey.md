# Codex prompt: Passkey sign-in

Read `CLAUDE.md` and `.agent/BANNED_ZONE.md` first.

## Where to work

- Worktree: `C:\WORK\channel-manager (the main folder; do not use any worktree)`. Read `.agent/DECISIONS.md` first: 2FA (TOTP) is paused behind `VITE_FEATURE_MFA` (off). Passkey is wanted now (owner, 2026-11-04). The passkey section on the security page must show even while the 2FA section is hidden.
- Write your `.agent/handoff.md` entry and report **before** the final checks.
- Branch: `main`
- Read and edit only inside this worktree.
- Do not touch any of these:
  - `client/public/_headers`
  - `docs/sales/`
  - `.agent/session-handoff-2026-11-03.md`
  - `wrangler.toml`
  - any applied migration
  - `.env`
  - `.dev.vars`

## Background

- Auth is Better Auth 1.7.14 on a Cloudflare Worker with D1. See `server/auth.ts`, `client/src/lib/auth-client.ts`, `drizzle/auth-schema.ts`.
- Plugins in use today: `twoFactor` (TOTP) and `bearer`. Social login (LINE, Google) is also enabled.
- `@better-auth/passkey@1.7.14` was installed by Claude on 2026-11-04 (package.json, pnpm-lock.yaml and node_modules). Do not change either file. The package includes `@simplewebauthn/server` and `@simplewebauthn/browser`.

## Task

1. **Server.**
   - Add the `passkey()` plugin from `@better-auth/passkey` in `server/auth.ts`.
   - `rpName`: `"hayhost"`.
   - `rpID` and `origin` come from the auth base URL already used by `createAuth` (`BETTER_AUTH_URL` / the base URL option):
     - `rpID` is the registrable host without `www.`. For `https://www.hayhostth.com` it is `hayhostth.com`. For `http://localhost:8787` it is `localhost`.
     - `origin` is that URL's origin.
     - Put this in a small pure helper with unit tests.
     - Do not add a new wrangler var.
2. **Schema.**
   - Add the plugin's `passkey` table to `drizzle/auth-schema.ts`. Match the plugin's required fields exactly; check the package's schema in `node_modules/@better-auth/passkey`.
   - **Never hand-write the migration.** Generate it with `pnpm exec drizzle-kit generate --config drizzle.d1.config.ts --name add_passkey`, or with `.\node_modules\.bin\drizzle-kit.cmd` if pnpm is locked.
   - Rename the generated SQL and its `meta/` snapshot to this repo's dated pattern: `YYYYMMDDHHMMSS_add_passkey.sql` and `YYYYMMDDHHMMSS_add_passkey_snapshot.json`. Use a timestamp later than the newest file in `drizzle/d1/`.
   - Update the journal `tag` to match. drizzle-kit picks the latest snapshot by file name, so a `00NN_snapshot.json` breaks the next migration.
   - Run generate once more afterwards; it must say "No schema changes".
   - Do NOT use `drizzle/meta/` (an old MySQL leftover).
3. **2FA interaction.**
   - A passkey sign-in counts as a strong sign-in. It must not be blocked by the TOTP challenge.
   - Check that the `session.create.before` hook (`requireTwoFactorOnSocialCallback`) does not block passkey sign-in.
   - Write the decision as an `ASSUMPTION:` comment in `server/auth.ts`, and add it to `.agent/OPEN_QUESTIONS.md`.
   - Sensitive actions that need a recent MFA step-up keep working exactly as today.
4. **Client.**
   - Add `passkeyClient()` to the auth client.
   - **Login page.** Add a "เข้าสู่ระบบด้วย Passkey" / "Sign in with a passkey" button.
     - Also enable conditional UI (autofill) on the email field: `autocomplete="username webauthn"`, plus the plugin's autofill call when the browser supports it.
     - On success, follow the same redirect as the password login.
     - On cancel, show nothing alarming.
     - On error, show a short, friendly message.
   - **Account security settings** (where TOTP lives, e.g. `client/src/components/MfaSettings.tsx` or its page):
     - a "Passkey" section that lists the user's passkeys (name, date added);
     - an add button that registers one, with an optional name defaulting to the device;
     - a delete button with a confirm.
   - Hide the passkey buttons when `window.PublicKeyCredential` is missing.
   - All copy goes through i18n (`th.ts`, `en.ts`). The Thai must read naturally and briefly, the way a Thai app would say it. For example: "ใช้สแกนนิ้วหรือใบหน้าแทนรหัสผ่าน".
5. **Docs.** Add a `.agent/handoff.md` entry. It must say that the owner has to apply the new migration on production before deploying.

## Tests

- Unit tests for the rpID / origin helper:
  - www production;
  - apex;
  - localhost;
  - a `*.workers.dev` staging URL, where rpID is the full host.
- The auth config includes the passkey plugin.
- A contract test asserting the login page has the passkey button and `autocomplete="username webauthn"`, and that the settings page has the passkey section.
- Run all existing tests; they must pass. Explain any test you change in `.agent/handoff.md`.

## Rules

- Do not run `git add` or `git commit`.
- Never apply a migration to a remote database.
- If pnpm fails, run the tools directly:
  - `node_modules\.bin\vitest run --pool=forks --maxWorkers=1`, with a temp dir inside the worktree, deleted afterwards
  - `node_modules\.bin\tsc --noEmit`
  - `node_modules\.bin\vite build`
- Finish in this run.

## Report

1. The files changed.
2. The ASSUMPTION text.
3. Test, check, build and `git diff --check` output.
4. Proposed commits:
   - `feat(auth): add passkey sign-in on the server`
   - `feat(auth): passkey sign-in and management in the app`
