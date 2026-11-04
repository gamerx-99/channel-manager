# Codex prompt: plans, trial, coupons, PromptPay billing, super admin dashboard and CRM

Read `CLAUDE.md`, `.agent/BANNED_ZONE.md`, `.agent/DECISIONS.md` (the "Plans and pricing" register, rows dated 2026-11-04), `specs/ui-house-style.md` and `docs/thai-glossary.md` first.

## Where to work

- Worktree: `C:\WORK\channel-manager\.claude\worktrees\account-deletion`
- Branch: `feat/signup-integration`
- Do not push, deploy, or apply migrations remotely. Do not touch `client/public/_headers` or `.github/`.
- Do not edit `client/src/index.css`: another agent is splitting it. Put new styles in a new CSS file next to the new pages, using the existing tokens (`var(--pine)`, `var(--ink)` and so on).
- You cannot commit (index.lock). Leave the work uncommitted. Claude reviews and commits each ticket.

**This run: do ticket C only, then stop and report.**
- Tickets A (`8131dab`) and B (`735caaf`) are done. Reuse `shared/plans.ts` (`resolvePlan`, `quotePro`, `extendPaidUntil`, `TRIAL_DAYS`) and the `listHotelsWithTrialClock` helper in `server/db/scope.ts`. Never copy their maths.
- **Lessons from ticket B. Claude had to fix these, so do not repeat them:**
  1. **Never widen an existing permission gate.** Codex moved `/platform` from `platform.view_system_logs` to a permission the `support` and `admin` roles also hold, and edited an existing test to match. Changing an existing test's expected permission counts as editing a test to pass. If a gate seems wrong, log it in `OPEN_QUESTIONS.md` and leave it.
  2. i18n placeholders are `{{name}}` (double braces). `{name}` prints literally.
  3. Every key used in a page needs a Thai and an English entry (`platformCrm.plan` was missing).
  4. Dates use `dateLocale(language)` from `client/src/lib/dateLocale.ts`.
  5. Money sums go through `sumMoneyInSatang` (`server/db/money.ts`), never `Number()` additions.
- **Ticket C security notes:**
  - `property.manage_billing` is new and is for `hotel_owner` only. Check whether `super_admin` gets it through its blanket filter in `shared/authorization.ts`. If so, decide deliberately: the owner pays, and super admin has CRM tools. Write the decision as an ASSUMPTION.
  - Use `requirePermission`-style checks where `requireHotelPermission` would let `super_admin` bypass (see `CLAUDE.md` Conventions).
- **Payment safety:**
  - Write the full payment state machine as a plain function first (`pending` → `verified` | `failed` | `expired`), with unit tests.
  - Then wire the SlipOK call. Mock SlipOK in the tests; never call the real API.
- **Browser check:** the PromptPay QR and SlipOK need secrets that do not exist locally. Check at 1280px and 375px:
  - the plan card;
  - the quote with and without a coupon, using a local test coupon;
  - the "payment system not ready" message.

  Say plainly that the real payment was not tested.
- Claude has already applied the ticket A migration to local D1 (`hayhost-dev`).
- **If `pnpm` fails with `ERR_PNPM_STORE_DIR_OPEN_OPERATION_LOCK`**, call the binaries directly. Do not stop.
  - `.\node_modules\.bin\vitest.cmd run`
  - `.\node_modules\.bin\tsc.cmd --noEmit`
  - `.\node_modules\.bin\vite.cmd build`
  - `.\node_modules\.bin\wrangler.cmd deploy --dry-run --outdir dist-worker --env production`
  - `.\node_modules\.bin\wrangler.cmd dev --var BETTER_AUTH_SECRET:local-preview-only-not-a-real-secret-0123456789`

  Say in the report which one you used.
- **Local platform admin for the browser check.** No credentials are stored.
  1. Sign up on `wrangler dev` (http://localhost:8787/signup) with a made-up email and password.
  2. Run `.\node_modules\.bin\wrangler.cmd d1 execute hayhost-dev --local --command "..."` to:
     - set `email_verified = 1` on that row in `user`;
     - insert a row into `platform_admins` (`id`, `user_id`, `email`, `invited_by`, `accepted_at`, `created_at`). Use the new user's id; `invited_by` may be the same id; the timestamps are `unixepoch()*1000`.
  3. Log in again.
- **If the browser check is impossible, do not stop.** Build the ticket, run the tests, and say plainly what you could not check.
- Write the `.agent/handoff.md` entry and the report file **before** your final checks, so a crash does not lose them. The last run ended without a report.
- Ticket C follows in a later run.

## Owner decisions (2026-11-04). Do not change them or add to them.

1. **Trial.** Every new account gets Pro free for **15 days**, counted from the account's creation (`user.createdAt` of the hotel's owner). When it ends unpaid, the hotel is on **Free** automatically. Nothing is deleted.
2. **Coupons.** The super admin creates coupon codes in a menu. The owner screens who gets a code. The hotel owner types the code when paying. The launch coupon is 50% off for Mae Hong Son, but that is data the admin enters, not code.
   - The admin sets these per coupon:
     - percent off (1–100);
     - number of paid months the discount applies to;
     - maximum redemptions (optional);
     - expiry date (optional);
     - active/inactive.
   - A hotel can use a given coupon once.
3. **Payment.** Pro is paid to hayhost by **PromptPay QR, checked automatically** with SlipOK. The revenue on the dashboard is the sum of these verified payments.
4. **Price.** Pro is **299 baht/month** (provisional). Keep it in one shared constant so it is easy to change. Free costs 0.

## Design

### Ticket A: data and plan rules (this run)

- **Migration** in `drizzle/d1-schema.ts`, generated with `pnpm exec drizzle-kit generate --config drizzle.d1.config.ts`. Check the journal lands in `drizzle/d1/meta`. Tables:
  - `hotel_subscriptions`: `hotel_id` (PK, FK hotels, cascade), `paid_until` (timestamp_ms, nullable), `updated_at`.
  - `subscription_payments`:
    - `id`, `hotel_id`, `months`;
    - `list_amount`, `discount_amount`, `amount` (money as text, like the existing money columns);
    - `coupon_id` nullable;
    - `status` (`pending`/`verified`/`failed`/`expired`);
    - `slip_trans_ref` (unique, nullable);
    - `qr_expires_at`, `created_by_user_id`, `verified_at`, `created_at`.
  - `coupons`: `id`, `code` (unique, stored upper-case), `percent_off`, `discount_months`, `max_redemptions` nullable, `expires_at` nullable, `active`, `note`, `created_by_user_id`, `created_at`.
  - `coupon_redemptions`: `id`, `coupon_id`, `hotel_id`, `payment_id`, `created_at`, unique (`coupon_id`, `hotel_id`).
  - `hotels.province`: a new nullable text column, for the CRM.
  - `subscription_admin_log`: `id`, `hotel_id`, `admin_user_id`, `action`, `detail`, `created_at`. It records manual plan changes made by the super admin.
- **Pure rules** in `shared/plans.ts`, plain data in and plain data out, following `server/financials.ts`:
  - `PRO_MONTHLY_PRICE = 299`, `TRIAL_DAYS = 15`.
  - `resolvePlan({ ownerCreatedAt, paidUntil, now })` returns `{ plan: "trial" | "pro" | "free", endsAt: Date | null, daysLeft: number }`:
    - `pro` while `paidUntil > now`;
    - otherwise `trial` while `now < ownerCreatedAt + 15 days`;
    - otherwise `free`.
    - Count `daysLeft` in whole days, rounded up, in Asia/Bangkok.
  - `quotePro({ months, coupon, now, alreadyRedeemed })` returns the list amount, the discount and the amount due. The discount covers `min(months, discount_months)` months only. It rejects an inactive coupon, an expired one, one that is used up, and one this hotel already used, each with a distinct error code. Round to 2 decimals.
  - `extendPaidUntil({ paidUntil, trialEndsAt, now, months })`: the new period starts at the latest of `now`, the current `paidUntil` and the trial end, so a hotel never loses days it already has. Add calendar months.
- **Unit tests** for all three functions, covering the edges:
  - the trial's last day;
  - paying during the trial;
  - paying while Pro is still active;
  - a coupon that covers fewer months than were bought;
  - 100% off;
  - an expired coupon;
  - a used-up coupon;
  - a coupon this hotel already redeemed.
- Do not apply the migration remotely. Applying it locally (`wrangler d1 migrations apply hayhost-dev --local`) is fine.

### Ticket B: super admin dashboard and CRM (later run)

- **Dashboard** (`/platform`, gated on `platform.view_all_hotels`). Cards:
  - number of hotels;
  - number of user accounts;
  - hotels now on paid Pro;
  - hotels in trial;
  - revenue this month;
  - revenue total.

  Revenue counts only `verified` payments. No guest data.
- **CRM** (`/platform/crm`, gated on `platform.manage_billing`). One row per hotel:
  - name and slug;
  - owner email and `owner_contact`;
  - province (editable inline);
  - plan, with days left;
  - account created;
  - last payment;
  - coupon used.

  Filters: plan, and province (text search). The admin can also set the plan manually: extend Pro by N months for free with a reason, or end Pro. Every manual change writes `subscription_admin_log`.
- **Coupons menu** (`/platform/coupons`, gated on `platform.manage_billing`): create, list (with redemption counts), deactivate. Never delete a coupon that has redemptions.
- Add a mocked-router test for each procedure: allowed with the permission, FORBIDDEN without it, and a hotel owner gets FORBIDDEN.

### Ticket C: the owner's plan card and payment (later run)

- On the hotel overview page (the owner's dashboard), add a plan card:
  - the current plan (ทดลองใช้ / Pro / Free);
  - days left and the end date;
  - a "เปลี่ยนแพ็กเกจ" button.

  Gate it on a hotel-owner billing permission. Add `property.manage_billing` to `shared/authorization.ts` for `hotel_owner` only, and mirror it in `routeScope.ts` and `can()`.
- The plan page:
  1. The owner chooses the months (1, 3, 6 or 12), optionally enters a coupon, and the server quotes the price with `quotePro`.
  2. On confirm, the server creates a `pending` payment and returns a PromptPay QR. Use `server/promptpay.ts` `generatePromptPayQR`, the platform's PromptPay ID from the env var `PLATFORM_PROMPTPAY_ID`, and a 15-minute expiry.
  3. The owner uploads the slip.
  4. The server verifies it with `server/slipVerification.ts` `verifySlipWithSlipOk`, using the platform keys `SLIPOK_API_KEY` / `SLIPOK_BRANCH_ID`, not the hotel's keys.
- Payment rules, all enforced on the server:
  - **Amount:** always computed on the server. Never trust a client amount.
  - **Slip match:**
    - the slip amount must equal the amount due;
    - the receiver must match the platform account;
    - `slip_trans_ref` must not have been used before (unique).
  - **On success, in one D1 batch:**
    - mark the payment `verified`;
    - extend `paid_until` with `extendPaidUntil`;
    - record the coupon redemption.
  - A redemption that breaks `max_redemptions` or the unique key fails the whole batch.
  - **100% off:** no QR is needed. The payment is created `verified` with amount 0 and extends the plan.
  - **Missing secrets:** if `PLATFORM_PROMPTPAY_ID` or the SlipOK secrets are missing, show a clear message ("ระบบชำระเงินยังไม่พร้อม กรุณาติดต่อ hayhost") and do not create a payment.
- Add only the names `PLATFORM_PROMPTPAY_ID` to `.env.example`. Never commit a value.
- Tests:
  - the quote is computed on the server;
  - a reused slip is rejected;
  - a wrong amount is rejected;
  - a verified payment extends `paid_until` correctly;
  - another hotel's owner gets FORBIDDEN.

### Ticket D: plan limits (not decided; do not build)

The Free limits (3 rooms, basic theme, manual slip check) are not enforced in code. What happens to a hotel with more than 3 rooms when its trial ends is **not decided**. Do not build enforcement. Log it in `.agent/OPEN_QUESTIONS.md` if it is not there.

## Rules for every ticket

- Follow the `CLAUDE.md` conventions: a permission check first, then `try { ... } catch (error) { return rethrowDomainError(error); }`. Hotel data goes through the scoped repositories in `server/d1/`.
- **Thai copy:** natural Thai per `docs/thai-glossary.md`; the glossary test must pass. Every string also gets English in the i18n files.
- **Pages:** follow the house style at 1280px and 375px, with no sideways scroll.
  - Build each new page in three files: the page `.tsx`, a `.ts` hook or logic file, and its own `.css`. This is the new project rule.
- **Never invent a requirement.** Anything not stated above goes to `.agent/OPEN_QUESTIONS.md`, with the safest default marked `ASSUMPTION:` in a code comment.
  - Known ASSUMPTION: the plan belongs to the hotel, and the trial clock uses the hotel owner's account creation date. A user who owns two hotels gets the same trial end on both.
- Run `pnpm test`, `pnpm check` and `pnpm build`, and paste the real output. A single test that times out under load may be re-run alone; say so.
- Add one `.agent/handoff.md` entry.

## Report (this run)

1. The files changed.
2. The procedures added, each with its permission.
3. The tests added.
4. Test, check and build output.
5. Pages checked in the browser at 1280px and 375px: the owner overview plan card and the plan/payment page. Use a local hotel owner (sign up on `wrangler dev`, then create a hotel through onboarding). Never claim a check you did not do.
6. Every ASSUMPTION you added and every question you logged.
