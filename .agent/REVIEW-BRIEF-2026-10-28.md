# Review brief for an independent reviewer (2026-10-28)

## What this is
Hayhost: a channel manager and direct-booking site for small hotels in northern Thailand (booking calendar, iCal sync with OTAs, PromptPay QR payment with slip check, staff roles). It is moving from Supabase + Vercel to Cloudflare Workers + D1 + R2 before launch. Money is Thai baht.

## Ground rules for the reviewer
- Read-only. Do not deploy, do not push to `main`, do not merge, do not run `pnpm dev` with real credentials. You need no secrets. Tests that need Supabase credentials fail by design (see "Expected failures").
- Report findings as a markdown file or issues, each with: file and line, what is wrong, a concrete failing scenario, and severity.
- Start from the tags `restore/2026-10-28/*` so everyone sees the same code. See `.agent/RESTORE-POINT-2026-10-28.md`.

## How to run
```bash
pnpm install
pnpm test      # expect exactly 7 failures, all needing live Supabase credentials
pnpm check     # tsc --noEmit, must be clean
pnpm build     # must pass
```
Expected failures (do not count as findings): `server/inviteAuthUser.test.ts` (4), `server/supabaseAnonKey.test.ts`, `server/supabase.credentials.test.ts`, `server/supabase.serverRuntime.credentials.test.ts`.

## Which branch to review for what
- `agent-c/d1-schema` (Cloudflare migration): the security-critical new code.
- `agent-a/next` (Supabase app + spec 16 UI): the guest-facing booking flow and themes.

## Where to look first (highest risk first)
1. **Hotel isolation** (`agent-c`): `server/db/scope.ts`, `server/d1/*`. Can any query read or write another hotel's rows? Is `authorizeHotelAction` called before every data access? Is the system caller (Cron) impossible to forge from a request?
2. **Double booking** (`agent-c`): `server/d1/booking.ts` (`atomicInsert`, `INSERT ... WHERE NOT EXISTS`, `changes() = 1`) and `server/d1/ota.ts`. Can two overlapping active bookings on one room ever both be stored, including under concurrent requests?
3. **Money** (`agent-c`): `server/db/money.ts`, `server/d1/bookingService.ts`. Money is stored as text and added in integer satang. Any floating-point maths, text sorting or rounding gap?
4. **Public booking input** (`agent-c` `server/d1/booking.ts`, `agent-a` `server/db/booking.ts`): is every price recomputed on the server from the database, never from the client?
5. **File upload and serving** (`agent-c`): `server/d1/media.ts`, `worker/app.ts` routes `/api/media/*` and `/media/*`. See known issue 2.
6. **Fetching OTA calendars** (`agent-c`): `server/d1/icalUrl.ts`, `server/d1/otaScheduler.ts`. Can a hotel owner make the server request an internal address (SSRF)? Is the response size and time bounded?
7. **Permissions**: `shared/authorization.ts` and where each permission is checked. `property.view_financials` must stay hotel-owner-only.
8. **Database policies** (`agent-a`, SQL at the repo root): `20261027_rls_write_hardening.sql`, `20261009_public_room_type_rls.sql`, `20261027_hotel_site_config_public_read.sql`.
9. **Booking UI** (`agent-a`): `client/src/components/booking/BookingFlow.tsx`, `client/src/components/hotel-themes/`. State bugs between the 5 steps, the 15-minute hold, and what is shown in the summary versus what is charged.

## Known issues (already found, do not re-report; confirm or add detail)
1. **Live Supabase app trusts client-sent add-on prices** (`confirmBookingDetails` takes `unit_price`). Fixed in the Cloudflare port (commit a3aa447); the live app is not fixed.
2. **R2 media accepted SVG and any `image/*`, and served files from the app's own origin** (commit 9915c6a). That allows stored XSS. A fix (image allowlist, magic-byte check, fixed content type, CSP headers) is written but not yet applied.
3. Hard-coded Supabase URL and `anon` key fallbacks in `client/src/lib/supabase.ts`, `server/_core/env.ts`, `server/supabase.ts`. The `anon` key is public by design; removal is ticket 13-07.
4. Spec 16 UI was checked only with mock data in a browser, not against a real database yet.
5. The iCal sync log is skipped when a feed fingerprint repeats, even if bookings changed. Minor.
6. The chosen hotel theme has no stored field; it comes from `?theme=` in the URL.

## What is intentionally not built yet
Better Auth login and 2FA (13-05), client login swap (13-07), data migration and cutover (13-08), billing (spec 12), booking management screens (spec 15), five of the eight hotel themes.

## Specs and decisions
`specs/13-cloudflare-migration.md` (the plan and hard invariants), `specs/14-*`, `specs/16-*`, `.agent/DECISIONS.md`, `.agent/OPEN_QUESTIONS.md`, and `.agent/handoff.md` (newest entry first).
