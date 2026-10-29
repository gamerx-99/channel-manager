# 13-08 Data Migration & Cutover Runbook

## Overview
This runbook guides the operations team through rehearsing and executing the full platform cutover from **Supabase** (Postgres, Storage, Auth) to **Cloudflare** (D1 SQLite, R2, Better Auth) for ticket `13-08`.

---

## 1. Migration Toolkit
All migration operations are powered by standard repository scripts:
1. `scripts/migrate-supabase-to-d1.ts`: Connects to Supabase Postgres (or reads offline JSON dumps), transforms types, checks invariants, backfills `booking_nights`, and outputs an executable D1 SQL bundle.
2. `scripts/sync-supabase-storage-to-r2.ts`: Connects to Supabase Storage `hotel-media` bucket and streams all media to Cloudflare R2 (`hayhost-media-staging` or `hayhost-media`), verifying MIME types and keys.
3. `shared/migration/dataTransforms.ts`: Shared transformation logic (timestamps, booleans, money format, JSON text, URL rewriting).

---

## 2. Stage 1: Staging Rehearsal (Dry Run)

### Step 1.1: Verify Staging Infrastructure
Ensure Cloudflare D1 staging database and R2 staging bucket are active:
```bash
# Check D1 database
pnpm exec wrangler d1 info hayhost-staging --env staging

# Check R2 bucket
pnpm exec wrangler r2 bucket list
```

### Step 1.2: Extract & Transform Supabase Data for Staging
Run the migration script against staging:
```bash
# Option A: Connect directly to Supabase
pnpm exec tsx scripts/migrate-supabase-to-d1.ts --output=d1_staging_bundle.sql

# Option B: Run from pre-extracted JSON dumps
pnpm exec tsx scripts/migrate-supabase-to-d1.ts --dump-dir=./dumps --output=d1_staging_bundle.sql
```

The script will:
- Check all 29 tables + auth identities.
- Validate money text format on all pricing/booking fields.
- Detect any overlapping occupying bookings. If conflicts exist, it stops and prints the conflict table.
- Generate `booking_nights` backfill matching the D1 occupancy invariant.

### Step 1.3: Apply Database Bundle to Cloudflare D1 Staging
```bash
pnpm exec wrangler d1 execute hayhost-staging --env staging --remote --file=d1_staging_bundle.sql
```

### Step 1.4: Sync Media to Cloudflare R2 Staging
```bash
# Dry run first
pnpm exec tsx scripts/sync-supabase-storage-to-r2.ts --env=staging --dry-run

# Execute sync
pnpm exec tsx scripts/sync-supabase-storage-to-r2.ts --env=staging
```

---

## 3. Stage 2: Post-Migration Invariant Verification

Run the following SQL queries against the D1 database to verify integrity:

```sql
-- 1. Foreign Key Verification (Must return 0 rows)
PRAGMA foreign_key_check;

-- 2. Verify Booking Nights Invariant
-- Every confirmed booking must have matching rows in booking_nights
SELECT b.id, b.room_id, b.check_in, b.check_out, count(n.night) as total_nights
FROM bookings b
LEFT JOIN booking_nights n ON n.booking_id = b.id
WHERE b.status IN ('confirmed', 'checked_in')
GROUP BY b.id
HAVING count(n.night) = 0;

-- 3. Verify Money Text Formatting (Must return 0 rows)
SELECT id, price FROM bookings WHERE typeof(price) != 'text' OR price NOT GLOB '*[0-9]*' OR price GLOB '*[^0-9.]*';
SELECT id, base_price FROM room_types WHERE typeof(base_price) != 'text' OR base_price NOT GLOB '*[0-9]*' OR base_price GLOB '*[^0-9.]*';

-- 4. Verify Media URLs (Must start with /media/)
SELECT id, hotel_id, url FROM hotel_media WHERE url NOT LIKE '/media/%';
```

---

## 4. Stage 3: Production Cutover Checklist

1. **Pre-Cutover Notification (T-24h)**:
   - Announce scheduled maintenance window (approx. 30 minutes).
2. **Freeze Writes on Supabase (T-0)**:
   - Temporarily place legacy Express / Supabase in read-only maintenance mode.
3. **Final Database Extraction & Sync**:
   - Run `pnpm exec tsx scripts/migrate-supabase-to-d1.ts --output=d1_production_bundle.sql`
   - Apply to production:
     ```bash
     pnpm exec wrangler d1 execute hayhost-production --env production --remote --file=d1_production_bundle.sql
     ```
4. **Final Media Sync to Production R2**:
   - Run `pnpm exec tsx scripts/sync-supabase-storage-to-r2.ts --env=production`
5. **DNS Cutover**:
   - Update domain `hayhostth.com` in Cloudflare Dashboard to route to the Cloudflare Worker (`hayhost-production`).
6. **Re-issue OTA Export URLs**:
   - Public OTA iCal URLs follow `/api/ical/:file` on `https://www.hayhostth.com`.
   - Verify OTA sync cron (`*/15 * * * *`) fires on schedule.
7. **Post-Cutover Smoke Test**:
   - Test login via Better Auth on production.
   - Verify dashboard, hotel management, reservations, and media serving.

---

## 5. Contingency & Rollback Plan
If critical issues occur prior to DNS propagation:
- Re-enable writes on Supabase.
- Point DNS records back to Vercel (`cname.vercel-dns.com`).
- D1 Time Travel backup can restore the database state:
  `wrangler d1 time-travel restore hayhost-production --timestamp=...`
