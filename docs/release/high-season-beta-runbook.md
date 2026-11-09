# High Season Guided Beta Runbook

Prepared 2026-11-10 for branch `codex/high-season-release`.

## Release state

- Release baseline: `1049a48`.
- P0 fix commit: `00b1ee4` (`fix: protect allotment and persist manual payment slips`).
- The P0 commit passed `pnpm check`, `pnpm test` (278 files / 1,965 tests), `pnpm build` and Wrangler dry-run. No push, merge, migration apply or deploy was performed.
- Production Wrangler settings were inspected read-only. Worker `hayhost` has bindings `DB` (D1), `MEDIA` (R2 `hayhost-media`), `PUBLIC_BOOKING_LIMITER` (rate-limit namespace `1003`) and `ASSETS`. Production secret names present: `BETTER_AUTH_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `LINE_CLIENT_ID`, `LINE_CLIENT_SECRET`, `PLATFORM_PROMPTPAY_ID`, `RESEND_API_KEY`, `SLIPOK_API_KEY`, `SLIPOK_BRANCH_ID`, `SLIPOK_ENCRYPTION_KEY`. Values were not retrieved. Presence does not prove that credentials are valid or that external providers accept them. The Worker settings response did not expose plain-text variable names in the `vars` object; no plain-text values were requested or returned.
- Production migration list reports `20261109010000_restore_stop_sell_allotment.sql` pending.
- A read-only query against Production found no `rooms_available = 0` rows dated 2026-11-10 or later (query limit 500; zero rows returned). Therefore the current future-date candidate list for lost pre-Stop-Sell allotments is empty. This is a point-in-time result; rerun immediately before migration. Older/historical rows were not queried.

## Before any Production change

1. Confirm the exact reviewed source commit is on the approved release branch and rerun `corepack pnpm check`, `corepack pnpm test`, and `corepack pnpm build` from that checkout.
2. Confirm the production Worker name and bindings match this runbook. Secret names are present, but check provider validity through provider test facilities or a test transaction in a non-production environment; never print secret values.
3. Ask each hotel to review future stop-sell rows and intended online allotment. Rerun this read-only candidate query immediately before migration:

   ```sql
   SELECT rt.hotel_id, a.room_type_id, a.date, a.rooms_available
   FROM availability a
   JOIN room_types rt ON rt.id = a.room_type_id
   WHERE a.date >= 'YYYY-MM-DD' AND a.rooms_available = 0
   ORDER BY rt.hotel_id, a.room_type_id, a.date;
   ```

   These rows have no historical allotment to restore automatically. Treat each as a hotel-confirmation item; do not infer a prior positive cap. After migration, use the confirmed cap when reopening.
4. Create a protected backup location with restricted access and enough space. D1 SQL exports contain hotel and guest data; keep plaintext off persistent storage, encrypt the export at rest, and keep it out of the repository and chat. On this host, `systemd-creds --user` encryption/decryption was tested with a disposable payload before use; it uses the current OS user's credential key.

## Production backup and migration (not executed)

Run only after separate owner approval. This streams SQL through an encrypted credential file: plaintext passes through a FIFO in `/dev/shm`, while only ciphertext persists. Replace the timestamp for each backup.

```bash
umask 077
mkdir -p /home/gserver/.local/share/hayhost-release-backups
chmod 700 /home/gserver/.local/share/hayhost-release-backups
mkdir -m 700 /dev/shm/hayhost-production-backup
mkfifo -m 600 /dev/shm/hayhost-production-backup/export.sql
systemd-creds encrypt --user --name=hayhost-production-before-20261109010000 /dev/shm/hayhost-production-backup/export.sql /home/gserver/.local/share/hayhost-release-backups/hayhost-production-before-20261109010000.cred &
BACKUP_ENCRYPT_PID=$!
corepack pnpm exec wrangler d1 export hayhost-production --remote --env production --config wrangler.toml --output /dev/shm/hayhost-production-backup/export.sql
wait "$BACKUP_ENCRYPT_PID"
test -s /home/gserver/.local/share/hayhost-release-backups/hayhost-production-before-20261109010000.cred
systemd-creds decrypt --user --name=hayhost-production-before-20261109010000 /home/gserver/.local/share/hayhost-release-backups/hayhost-production-before-20261109010000.cred /dev/stdout | sha256sum
unlink /dev/shm/hayhost-production-backup/export.sql
rmdir /dev/shm/hayhost-production-backup
```

Verify the export and encryption commands succeeded, the ciphertext is non-empty, and decryption produces a checksum without printing SQL. Retain the ciphertext and current user's systemd credential key for recovery. Wrangler documents that `d1 migrations apply` captures a backup after applying and rolls back a failed migration; this encrypted export is an additional pre-change recovery copy.

After the owner approves applying Production migration, run:

```bash
corepack pnpm exec wrangler d1 migrations apply hayhost-production --remote --env production --config wrangler.toml
corepack pnpm exec wrangler d1 migrations list hayhost-production --remote --env production --config wrangler.toml
```

Confirm the migration is applied and verify the new nullable column exists before deploying. Do not change or backfill existing rows as part of this migration.

## Recovery

- If migration execution fails, Wrangler reports a rollback and leaves the previous successful migration state. Stop and inspect the error; do not manually edit `d1_migrations`.
- This migration only adds a nullable column. If application behavior must be rolled back, roll back the Worker version while retaining the column. Do not drop the column after the application has stored saved allotments.
- If database restoration is required, stop writes and assess all writes since the target point first. D1 Time Travel restore is destructive to later writes. Use it only with a separately approved recovery point and incident plan:

  ```bash
  corepack pnpm exec wrangler d1 time-travel info hayhost-production --env production --config wrangler.toml --timestamp 2026-11-10T00:00:00Z
  corepack pnpm exec wrangler d1 time-travel restore hayhost-production --env production --config wrangler.toml --timestamp 2026-11-10T00:00:00Z
  ```

  The timestamp above is an example only; select and validate the recovery point during the incident. Never run restore as routine migration rollback. Retain the SQL export until the restore plan is verified.

## Deploy preparation (not executed)

After migration verification and a separate owner deploy approval:

```bash
corepack pnpm build
corepack pnpm exec wrangler deploy --env production --config wrangler.toml
```

Confirm the deployed Worker version and custom domain in the Wrangler output. Do not run the deploy command until the approved commit is checked out and the production migration is confirmed applied.

## Mobile smoke test

Run the full flow against staging with a dedicated test hotel, test email, and non-paid/manual verification. Do not use a real guest booking or payment in Production for smoke testing.

1. On a narrow mobile viewport, open the hotel's public booking page; verify the page loads, text and controls fit, and no horizontal overflow blocks use.
2. Select check-in and check-out dates, guests, and a room type; verify per-night allotment and Stop Sell states match the owner calendar.
3. Create one test hold and verify the session expires according to the configured timeout.
4. Upload a test slip; verify the guest sees “under review,” the staff booking page displays the uploaded evidence, and another hotel's staff account cannot retrieve it.
5. Approve and reject separate test bookings; verify public status becomes paid only after staff approval and failed after rejection. Retry the same slip and verify duplicate protection.
6. With PromptPay unset on a separate test hotel, verify the server refuses the hold. For enabled PromptPay, inspect QR generation without transferring money.
7. Test two simultaneous holds against allotment 1; at most one may succeed. Stop Sell must reject new guest bookings while leaving existing bookings untouched; reopening must restore the confirmed cap.

Record device/browser, viewport, test hotel, booking IDs, results and any failure. For Production, limit the initial check to public page rendering and owner-approved non-mutating checks until the first real hotel booking is intentionally opened.
