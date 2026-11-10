# Payment verification contact screen — 2026-11-10

Status: deployed to Production with owner authorization. No real-slip verification claimed.

## Source and scope

Base: `881a8d8eefdb40365503c54cb4f2b118cc184c78` with the deployed dormant Billing/QR patch preserved from the Billing release worktree. Previous Production version is `dcf5db1f-ffb3-4b2f-93f4-5c29bc2f4ccb` (rollback target for this UI batch).

This change affects only the guest payment UI and its tests/translations. No server logic, schema, or migration changed in this batch. Billing remains disabled. Auto Inventory Flow remains paused. The hotel's existing server expiry policy is unchanged.

## Behavior

- Verified slip calls booking confirmation immediately; no extra staff approval step.
- Rejected, unreadable, manual-review, and verification request failure outcomes show property contact actions and the booking reference.
- Phone/Facebook use the displayed hotel's configured public contact fields only when the held booking belongs to that hotel. No private owner contact is exposed.
- Invalid/non-HTTP(S) social links are omitted. Missing contacts show an explicit fallback instead of invented details.
- Contact screens keep payment-status polling: a later paid result confirms the booking. An expired status does not erase the contact instructions. This UI behavior does not extend the server's reservation hold.
- Payment-session creation errors also show the configured contact actions.

## Incremental files

- `client/src/components/PaymentQR.tsx`: contact outcomes, public contact links, status polling.
- `client/src/components/public-hotel/BookingStepPayment.tsx`: forwards contact properties.
- `client/src/components/public-hotel/PublicBookingSection.tsx`: gates contacts on matching hotel ownership.
- `client/src/lib/i18n/{en,th}.ts`: contact instructions and missing-contact fallback.
- `client/src/components/PaymentQR.test.tsx`: result, ownership, unsafe-link, expiry/polling, and success regressions.
- `.agent/DECISIONS.md`: owner instruction register.

## Local evidence

All commands ran in the `auto-inventory-flow/hayhost-high-season-release` worktree.

`pnpm exec vitest run client/src/components/PaymentQR.test.tsx client/src/pages/PublicBooking.render.test.tsx server/payment.verifySlip.test.ts server/paymentRouter.manualVerify.access.test.ts`

Result: **4 files / 55 tests passed**, exit 0. Log: `/tmp/hayhost-payment-contact-tests.log`.

`pnpm check` and `CLOUDFLARE_ENV=production pnpm build`: both exit 0. Build ended with Wrangler `--dry-run: exiting now`; Billing binding remained `false`. Log: `/tmp/hayhost-payment-contact-check-build.log`.

`git diff --check`: passed.

Independent GPT scoped review: no remaining blocker after fixing the rejected-screen polling issue. Reviewer inspected code and test evidence, including the rejected/under-review → expired → paid regressions and matching/mismatched hotel contacts. This is not Claude sign-off.

## Limits

No production payment/booking write, customer email, or migration was performed. This is automated local evidence plus read-only deployment verification, not a live browser or real-slip acceptance result.

## Production deployment

Owner authorized deployment in chat on 2026-11-10. Immediately before deployment, the full suite passed: **286 files / 2,034 tests**, exit 0; fresh typecheck and production build/dry-run also passed. Logs: `/tmp/hayhost-payment-contact-full-tests.log` and `/tmp/hayhost-payment-contact-release-build.log`.

Source is an uncommitted candidate, not bare baseline HEAD. Source-file manifest SHA256: `e6f4d8a7b01551131dadd8038f2ce86618c4a2d49f691ba9fd3866334ba1c1d6`; manifest: `/tmp/hayhost-payment-contact-source.json`. Incremental runtime/test changes from the previous deployed snapshot are only the six client files listed above.

Command:

```sh
CLOUDFLARE_ACCOUNT_ID=88e192bc2130779a3c9c6fd2a31aa143 CLOUDFLARE_ENV=production pnpm exec wrangler deploy --env production --tag payment-contact-e6f4d8a7 --message 'Payment contact fallback; verified slip confirms immediately; Billing stays OFF; base881a8d8 sourcee6f4d8a7; 2034 tests passed'
```

- Worker: `hayhost`, environment `production`.
- Version: `0cc72f5f-8b51-4fdb-8de8-a3489a66b070`, active **100%**, created `2026-11-10T08:54:34.236Z`.
- URL: https://www.hayhostth.com/littlebromhs/book
- Production Health: HTTP 200, `ok: true`.
- Live Billing flag endpoint: HTTP 200, `false`.
- Booking HTML matches built index byte-for-byte. All seven entry assets plus `PublicBooking-DOVsDFJP.js` returned HTTP 200 and matched local SHA256 checksums.
- No migrations applied, push, or merge.
- Evidence: `/tmp/hayhost-payment-contact-deploy.log`, `/tmp/hayhost-payment-contact-deployments.log`, `/tmp/hayhost-payment-contact-live-verification.json`.
