# Ticket C report — owner plan card and billing

## Files changed

- Permissions: `shared/authorization.ts`, `shared/permissions.ts`, `client/src/lib/routeScope.ts`, and `client/src/components/layout/AppShell.tsx` (existing can() uses membership permissions).
- Server: `server/subscriptionPayments.ts`, its tests, `server/subscriptionBillingRouter.ts`, `server/subscriptionBilling.access.test.ts`, `server/_core/context.ts`, `server/routers.ts`, `server/db/scope.ts`, `worker/app.ts`.
- Client: `client/src/App.tsx`, `client/src/pages/Home.tsx`, `SubscriptionPlan.tsx`, `useSubscriptionPlan.ts`, `subscriptionPlan.css`, contract test, both i18n dictionaries.
- Project records: `.env.example`, `.agent/OPEN_QUESTIONS.md`, `specs/12-saas-plans-billing.md`, `.agent/handoff.md`.

## Procedures and permission

- `subscriptionBilling.state`, `quote`, `createPayment`, `verifySlip`: `property.manage_billing`, matching hotel owner only. Server also checks scoped hotel access. Platform identities are refused despite super_admin's blanket filter.
- Quote calls shared `quotePro`; payment values are derived on server. Slip verification uses platform SlipOK keys and checks exact satang amount and transfer reference. A D1 batch updates payment/paid-until/redemption.

## Tests added

- Payment state machine transitions, terminal-state rejection, amount and slip checks.
- Mocked access router test for allowed owner and forbidden other-hotel owner/platform roles.
- Page route, permission and UI contract test.
- Focused test output: 4 files passed, 14 tests passed. TypeScript `tsc --noEmit` exited 0.

## Full checks

- `pnpm` failed with `ERR_PNPM_STORE_DIR_OPEN_OPERATION_LOCK`. Direct binaries used.
- Full `vitest run` did not complete in this execution environment: successive runs returned after initial output with no final summary/exit status. Ticket focused tests passed.
- `vite build` output stopped after `transforming...`; no completion summary was returned.
- `wrangler deploy --dry-run --outdir dist-worker --env production` built the Worker: 3,788.72 KiB, `--dry-run: exiting now`. Wrangler logged EPERM writing under managed XDG config but continued.

## Browser and payment checks

- Browser unavailable: CUA reported `Browsers: Error: The browser access host is unavailable`. Local `/signup` returned HTTP 200. Wrangler dev starts only with `TEMP`, `TMP`, `WRANGLER_LOG_PATH`, and `XDG_CONFIG_HOME` redirected to `.tmp`; initial run hit temp/log EPERM.
- Not checked at 1280px or 375px: overview plan card, plan/payment page, coupons, or missing-secret UI. No local owner sign-up/onboarding completed.
- Real payment was not tested. No payment secrets are present locally.
- IMPORTANT LIMIT: this checkout has no local QR renderer dependency. The UI currently shows a visual QR placeholder with the PromptPay payload; this is not machine-readable. Paid payment creation is server-blocked with the requested not-ready error. The normal paid flow cannot be enabled until a QR renderer dependency is added. Do not deploy this implementation as payment-ready.

## ASSUMPTIONS and questions

- `ASSUMPTION:` only the property's hotel_owner may manage/pay its subscription; platform roles use CRM tools. Logged in `.agent/OPEN_QUESTIONS.md`.
- `ASSUMPTION:` do not create paid payments until a local first-party QR renderer is available. Code comment in `server/subscriptionBillingRouter.ts`.
- Closed the old Spec 12 Q2 provider question; owner decision on PromptPay + platform SlipOK answers it.
- No further product questions added.
## Final verification (direct binaries)
	sc.cmd --noEmit: exit 0.
Focused Vitest: Test Files 4 passed (4); Tests 14 passed (14); Duration 3.41s.
Full Vitest: no final summary or exit code returned after three attempts; not counted as a pass.
Vite: output stopped at 	ransforming...; no completion summary returned.
Wrangler production dry-run: Total Upload: 3788.75 KiB / gzip: 707.97 KiB; --dry-run: exiting now. No remote deploy.

