# Ticket B report — platform dashboard, CRM and coupons

## Files changed
- `server/db/scope.ts`, `server/routers/accessRouter.ts`
- `server/platformBilling.access.test.ts`, updated `server/supportAccess.access.test.ts`
- `client/src/App.tsx`, `client/src/components/layout/Sidebar.tsx`, `client/src/lib/routeScope.ts`
- `client/src/pages/PlatformOverview.tsx`, `PlatformCrm.tsx`, `PlatformCoupons.tsx`, `platformBilling.ts`, `platformBilling.css`, `PlatformBilling.contract.test.ts`
- `client/src/pages/SupportAccess.contract.test.ts` (updated for the dashboard permission change)
- `client/src/lib/i18n/en.ts`, `client/src/lib/i18n/th.ts`
- `specs/12-saas-plans-billing.md`, `.agent/handoff.md`

## Procedures and permissions
- `access.billingSummary` — `platform.view_all_hotels`.
- `access.billingCrm`, `access.updateHotelProvince`, `access.setHotelPlan`, `access.coupons`, `access.createCoupon`, `access.deactivateCoupon` — each `platform.manage_billing`.
- Existing `access.platformSummary` now uses `platform.view_all_hotels` to align the `/platform` route; its read-only summary behavior is retained.
- CRM plan changes insert/update `hotel_subscriptions` and write `subscription_admin_log` in one D1 batch. Coupon deactivation only updates `active`; no deletion endpoint exists.

## Tests
Added `server/platformBilling.access.test.ts` (all seven new procedures: permitted super admin and FORBIDDEN hotel owner), and `client/src/pages/PlatformBilling.contract.test.ts`. Updated old platform summary contracts to use the new `platform.view_all_hotels` gate. Thai glossary included.

## Test, check and build output
- Focused router/page/glossary: **3 files passed, 10 tests passed**.
- Full test: **187 files passed (187), 1,283 tests passed (1,283)**. Command: ` .\\node_modules\\.bin\\vitest.cmd run --reporter=dot` with `TEMP` and `TMP` set to workspace `.tmp` after default Windows temp path returned `EPERM`.
- Check: ` .\\node_modules\\.bin\\tsc.cmd --noEmit` — exit 0, no output.
- Client build: ` .\\node_modules\\.bin\\vite.cmd build` — exit 0; Vite reports a chunk-size advisory (>500 kB).
- Worker bundle: ` .\\node_modules\\.bin\\wrangler.cmd deploy --dry-run --outdir dist-worker --env production` — `Total Upload: 3774.90 KiB / gzip: 705.28 KiB`, `--dry-run: exiting now.` Wrangler also reported an EPERM writing its diagnostic log under the configured xdg path, but completed the dry run with exit 0.
- Direct binaries used throughout because the prompt explicitly provides that fallback for pnpm store locking; pnpm was not run.

## Browser checks
Not performed. `wrangler dev --var BETTER_AUTH_SECRET:local-preview-only-not-a-real-secret-0123456789` could not start: sandbox EPERM writing Wrangler logs under `C:\\Users\\littl\\AppData\\Roaming\\xdg.config\\.wrangler\\logs` and creating Miniflare temp `email-store`. Therefore `/platform`, `/platform/crm`, and `/platform/coupons` were not checked at either 1280px or 375px, and no local admin account was created.

## ASSUMPTIONS and questions
- `ASSUMPTION`: coupon note is optional, matching the nullable schema.
- `ASSUMPTION`: manual free Pro extension is entered as an integer number of months (1–60).
- No new questions logged. No schema or shared plan-rule changes; no migration generated/applied. Ticket A is unchanged.
