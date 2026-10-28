# Create the test Supabase project `test-channel-manager` (full steps)

Purpose: an isolated database so Antigravity can test spec 16 on the gserver machine without touching the live project (`roznxbvhflwrfvybmhtm`).
Nothing here touches the live project. Never paste a key, token or password into chat or a commit.

## 0. Know before you start
- **Cost:** a second project in a paid organisation is billed monthly. The create screen shows the price; read it before you click Create. A free-plan organisation allows 2 free projects. Pause or delete the test project when testing is done (Step 9).
- **GitHub link:** Supabase's GitHub integration (Project Settings > Integrations > GitHub) is for syncing migrations and branches. It is not needed to test, and it can auto-run files in `supabase/migrations/` from the repo. This repo's migrations are applied by hand, so do NOT turn on automatic deployment. Skip it, or connect only if you want the link and leave "Deploy to production" off.
- **Why not the CLI:** `supabase projects create` works, but it cannot link GitHub, and it needs an access token and a database password typed by you. The dashboard is simpler for a one-off.
- **Time:** about 30–40 minutes, mostly pasting SQL.

## 1. Create the project (browser)
1. Open https://supabase.com/dashboard and sign in with the same account that owns the live project (GitHub `gamerx-99`).
2. Pick the organisation (the live project's org is `HEDJOMKUN`) > **New project**.
3. Fill in:
   - Name: `test-channel-manager`
   - Database password: use "Generate a password" and save it in your password manager. You only need it later for a direct DB connection (`DATABASE_URL`), which the test does not need.
   - Region: Southeast Asia (Singapore), the same as live.
   - Security options: leave the Data API **enabled** (the app uses it).
4. Read the monthly price shown at the bottom. If it is not acceptable, stop here.
5. Click **Create new project** and wait about 2 minutes until the dashboard shows "Project is ready".

## 2. Apply the database (SQL editor, one file at a time)
Open **SQL Editor > New query** in the NEW project. For each file below: open it from `C:\WORK\channel-manager-a` in an editor, copy everything, paste, **Run**, and make sure there is no red error.
Run them in exactly this order (26 files; the first is the base schema, then date order):

| # | File |
|---|---|
| 1 | supabase_migration_production.sql |
| 2 | 20260824_add_admin_role_and_platform_admin.sql |
| 3 | 20260830_add_hotel_signup_links.sql |
| 4 | 20260831_add_rate_overrides.sql |
| 5 | 20260901_add_housekeeping_tasks.sql |
| 6 | 20260902_add_message_threads.sql |
| 7 | 20260903_add_hotel_site_config.sql |
| 8 | 20260904_add_hotel_payment_settings.sql |
| 9 | 20260904_add_notifications.sql |
| 10 | 20260905_harden_notifications_rls.sql |
| 11 | 20260906_notifications_recreate_policies.sql |
| 12 | 20260907_add_booking_services.sql |
| 13 | 20260908_add_payment_flow.sql |
| 14 | 20260909_add_slipok_branch_id.sql |
| 15 | 20260910_booking_lifecycle_v1.sql |
| 16 | 20260911_add_hotel_services_catalog.sql |
| 17 | 20261009_booking_lifecycle_checkin_checkout.sql |
| 18 | 20261009_public_booking_inventory.sql |
| 19 | 20261009_public_room_type_rls.sql |
| 20 | 20261009_room_type_occupancy_pricing.sql |
| 21 | 20261025_booking_occupancy_snapshot.sql |
| 22 | 20261026_ota_ical_room_sync.sql |
| 23 | 20261026_ota_ical_room_type_mode.sql |
| 24 | 20261027_hotel_site_config_public_read.sql |
| 25 | 20261027_rls_write_hardening.sql |
| 26 | 20261027_room_type_occupancy_fixes.sql |

Do NOT run:
- `20261027_booking_cancellation_permission.sql` and its verify file: untracked and not part of any approved ticket yet.
- `ota_ical_sync_cron_setup.sql`: it needs pg_cron and a deployed app; the test does not need it.
- `PHASE10_*.sql`: one-off repair scripts for the live project.

Caveats (honest):
- This exact from-scratch sequence has never been run before; the live project grew step by step. I checked the order for the occupancy columns (files 17–19 do not need them), but if a file fails with "relation/column/function ... does not exist", copy the exact error and stop. Do not guess. Send it to me and I will fix the order.
- Each file is idempotent in style (`IF NOT EXISTS`), so re-running a file after a fix is safe.
- Do not paste all 26 files into one run: if one fails halfway you will not know which.

Optional faster way to paste (builds one file per batch so you can run 3 batches instead of 26):
```powershell
cd C:\WORK\channel-manager-a
$all = @('supabase_migration_production.sql') + (Get-ChildItem -Filter '2026*.sql' -Name | Where-Object { $_ -ne '20261027_booking_cancellation_permission.sql' } | Sort-Object)
$all[0..9]   | ForEach-Object { "-- FILE: $_"; Get-Content $_ -Raw } | Set-Content C:\WORK\bundles\batch1.sql
$all[10..18] | ForEach-Object { "-- FILE: $_"; Get-Content $_ -Raw } | Set-Content C:\WORK\bundles\batch2.sql
$all[19..25] | ForEach-Object { "-- FILE: $_"; Get-Content $_ -Raw } | Set-Content C:\WORK\bundles\batch3.sql
```
If a batch fails, the `-- FILE:` markers show which file was running.

## 3. Check the result (verify scripts)
For each migration there is a `verify_<same name>.sql` read-only script; every row must say PASS. Run at least these in the SQL editor:
`verify_20261009_public_booking_inventory.sql`, `verify_20261009_room_type_occupancy_pricing.sql`, `verify_20261027_hotel_site_config_public_read.sql`, `verify_20261027_rls_write_hardening.sql`.
Any FAIL: stop and send me the row.

## 4. Seed the test hotel
1. Open `C:\WORK\channel-manager\.agent\test-project-seed.sql`.
2. Replace `REPLACE_ME` at the top with a PromptPay ID you own for testing (10-digit phone or 13-digit ID). It only draws a QR; nobody pays because the test stops at the QR.
3. Paste it into a new SQL query in the NEW project and Run. You should see "Created hotel test-local".
4. Result: hotel slug `test-local` with 3 room types (Standard King 2 rooms, Studio Terrace 1, Loft Suite 1), 5 photos, add-ons Breakfast (per person per night) and Airport pickup (once), a hero text, and SlipOK switched off.

## 5. Collect the connection values (copy them yourself, never paste them in chat)
In the new project: **Project Settings > API Keys / Data API**.
- Project URL → `SUPABASE_URL`, `VITE_SUPABASE_URL`, `CHANNEL_MANAGER_SUPABASE_URL`
- Publishable (anon) key → `SUPABASE_ANON_KEY`, `VITE_SUPABASE_ANON_KEY`, `CHANNEL_MANAGER_SUPABASE_ANON_KEY`
- Secret (service_role) key → `SUPABASE_SERVICE_ROLE_KEY` (server only, the most sensitive one)
- Also set: `PORT=3300`, `NODE_ENV=development`, `JWT_SECRET=<any random 32+ characters>`, `PUBLIC_APP_URL=http://localhost:3300`
- Leave `DATABASE_URL`, `CRON_SECRET`, `SLIP_*` empty. The test does not use them.

## 6. Put them on the gserver (the only place the keys go)
```bash
nano ~/hayhost/spec16-test-inbox/.env     # paste the variables above, save
chmod 600 ~/hayhost/spec16-test-inbox/.env
```
Do not copy the live `.env` this time. Do not send the file through chat.

## 7. Auth setting needed for the test
The public booking flow does not need sign-in, so no auth users are required for the 16-item checklist. Item 16 (change `accent_color`) is the only one that needs a logged-in hotel owner. Skip it, or create an owner later with Authentication > Users > Add user, then add a `hotel_users` row with role `hotel_owner`. Ask me for the SQL if you want it.

## 8. Ask Antigravity to run round 2 (message to paste)
```
ทดสอบรอบ 2 ด้วย slug: test-local
- .env ใหม่ (ชี้ไป Supabase โปรเจกต์ test-channel-manager) อยู่ที่ ~/hayhost/spec16-test-inbox/.env
- ใช้โฟลเดอร์ ~/hayhost/spec16-test/app เดิม: copy .env เข้าไป, chmod 600, ลบทั้งสองที่หลังจบ
- PORT=3300 pnpm dev, กติกาเดิมทั้งหมด (หยุดที่หน้า QR, ห้ามอัปสลิป, ห้ามแตะ ~/hayhost/repo)
- ก่อนเริ่มให้ยืนยันว่า http://localhost:3300/test-local โหลดข้อมูลโรงแรมได้ ถ้ายังขึ้น Hotel unavailable ให้หยุดและรายงานทันที
- ข้อ 16 (accent_color) ให้ mark SKIPPED ถ้าไม่มีบัญชี owner
- ส่งรายงาน spec16-test-report.md ฉบับใหม่ (ข้อ 1-16)
```

## 9. After testing
- Delete `.env` on the gserver (Antigravity does it, but check: `ls ~/hayhost/spec16-test*/`).
- In the dashboard: Project Settings > General > **Pause project** (keeps data, stops most cost) or **Delete project** (when you no longer need it).
- Rotate nothing on live; no live key was used.

## Troubleshooting
| Symptom | Cause | Fix |
|---|---|---|
| "Hotel unavailable" | slug mismatch, `public_enabled` false, or the `.env` points at another project | `select slug, public_enabled from public.hotels;` in the NEW project; check `SUPABASE_URL` in `.env` |
| 401/permission errors on every call | anon key from a different project | recopy URL and key from the same project |
| A migration says "already exists" | it was run twice | safe to ignore if the verify script passes |
| Rooms list empty on step 1 | no rooms seeded or the dates are in the past | check `select count(*) from public.rooms;` |
| QR step errors "has not configured PromptPay" | seed skipped the PromptPay ID | `select promptpay_id from public.hotel_payment_settings;` |
