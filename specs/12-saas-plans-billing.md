# 12 SaaS plans, entitlements & subscription billing
Status: TODO — BLOCKED on the human decisions listed under "Blocking questions" (prices,
collection method, tax setup). The architecture below does not depend on those answers;
the first ticket (plan catalogue + entitlements, no money) can start once Q1 is answered.
Depends on: 09-authenticator-mfa (DONE, step-up for billing settings), 01-payments-slipok (DONE, reused for
platform slip verification)
Owner-tier: worker-code

## Goal
Turn the platform into a sellable SaaS: every hotel is on a **plan** that decides which
features and how much capacity it gets, has a **subscription** with a billing period, and
is **invoiced and charged** by the platform operator. Unpaid hotels move through a grace
period to read-only, never to data loss.

## Separation from guest payments (do not mix)
`.agent/DECISIONS.md` 2026-08-30 says the platform never touches *guest* money: each hotel
verifies its guests' slips with its own SlipOK key. This spec is the opposite direction:
the **hotel pays the platform**. It uses separate tables (`billing_*`), a separate
permission set, and the platform's own collection account. Nothing here reads or writes
`payment_sessions`, `hotel_payment_settings`, or a booking's `payment_status`.

## Non-goals (v1)
- Per-booking commission / revenue share (flat subscription only)
- Multi-currency (THB only)
- Usage-metered billing (limits are hard caps per plan, not pay-per-use)
- Self-serve hotel creation without a signup link (today super_admin creates the hotel and
  sends a signup link; keep that, add the trial on top). Self-serve signup is a follow-up spec.
- Automated e-Tax invoice submission to the Revenue Department (v1 produces a PDF tax
  invoice/receipt; e-Tax filing is a follow-up once VAT-registered)

## Blocking questions — NEEDS HUMAN DECISION
1. **Plan line-up and prices.** How many plans, which features each, room/seat limits,
   monthly and yearly THB prices, trial length. The spec ships with placeholder codes
   `starter` / `pro` / `business` and NO prices; prices are data in `billing_plans`, not code.
2. **How the platform collects money.**
   - (a) **PromptPay / bank transfer + SlipOK slip check** with the *platform's own* SlipOK
     key and bank account. No card data, no gateway fees beyond SlipOK, but renewal is
     manual (owner pays each invoice). Reuses `server/slipVerification.ts`.
   - (b) **Card auto-renew through a gateway** (Stripe Billing or Opn/Omise schedules).
     Hands-off renewals and dunning, but needs a registered Thai company, gateway
     onboarding, ~3–4% fees, and webhook handling.
   - Recommended: ship (a) in v1 behind a `BillingProvider` interface, add (b) later
     without touching plans/entitlements.
3. **Tax.** Is the operating company VAT-registered (7%)? Hotels that are companies will
   withhold 3% service WHT — must invoices show WHT and accept a 50 ทวิ certificate as
   part-payment? Needed before invoice numbering/PDF ticket.
4. **What "suspended" blocks.** Proposed default below (read-only back office, public
   booking page off, **iCal export and existing bookings keep working** so a hotel that
   stops paying cannot cause double bookings on its OTAs). Confirm.
5. **Plan changes mid-period.** Proposed: upgrade = immediate, prorated invoice for the
   remaining days; downgrade = at period end, blocked if current usage exceeds the new
   plan's limits.

## Concepts
| Concept | Meaning |
|---|---|
| Plan | A catalogue row: code, name, price per cycle, `features[]`, `limits{}` |
| Entitlements | What a hotel may use right now = its plan's features/limits, adjusted by subscription status and per-hotel overrides |
| Subscription | One per hotel: plan, cycle, status, current period, trial end |
| Invoice | What the hotel owes for one period (or a proration); has a number, VAT/WHT lines, status |
| Payment | Evidence an invoice was paid: slip reference (v1) or gateway charge id (later) |

Permission vs entitlement: **permission** answers *who in the hotel* may do something
(`shared/authorization.ts`, unchanged rules); **entitlement** answers *whether the hotel paid
for it*. A procedure for a paid feature checks both: `requireHotelPermission(...)` then
`requireEntitlement(...)`.

## Feature and limit keys (initial set, maps to modules that already exist)
Features (boolean):
`ota.ical_sync`, `booking_engine.direct`, `website.builder`, `website.custom_domain`,
`pricing.advanced`, `payments.slipok`, `communications.inbox`, `housekeeping.board`,
`reports.channel_performance`, `reports.financials`, `tm30.export`

Limits (integers, `null` = unlimited):
`rooms.max`, `ota_connections.max`, `staff_seats.max`

Rule: a key that is absent from a plan means **not included**. New features must add a key
here and to every plan explicitly, so nothing becomes free by accident.

## Data model (migration `YYYYMMDD_saas_billing.sql` + `verify_…`)
- `billing_plans`: `id`, `code` (unique), `name`, `description`, `price_monthly_thb`,
  `price_yearly_thb`, `features text[]`, `limits jsonb`, `trial_days int`, `is_public bool`,
  `is_active bool`, `sort_order`, timestamps. Readable by every authenticated user (pricing page);
  writable by `platform.manage_billing` only.
- `hotel_subscriptions`: `hotel_id` (PK/FK, cascade), `plan_id`, `billing_cycle`
  (`monthly|yearly`), `status` (`trialing|active|past_due|suspended|cancelled`),
  `trial_ends_at`, `current_period_start`, `current_period_end`, `cancel_at_period_end`,
  `pending_plan_id` (scheduled downgrade), `grace_ends_at`, `entitlement_overrides jsonb`
  (comp a feature or raise a limit per hotel), timestamps.
- `hotel_billing_profiles`: `hotel_id` (PK), legal name, tax id (13 digits), branch
  (`สำนักงานใหญ่`/branch no.), billing address, billing email, `withholds_tax bool`.
- `billing_invoices`: `id`, `hotel_id`, `number` (unique, sequential per year, e.g.
  `INV-2026-000123`, generated in SQL so numbers never collide), `kind`
  (`subscription|proration|manual`), `period_start/end`, `subtotal`, `vat_rate`,
  `vat_amount`, `wht_rate`, `wht_amount`, `total`, `amount_due`, `status`
  (`draft|open|paid|void|uncollectible`), `due_at`, `paid_at`, `plan_snapshot jsonb`,
  `billing_profile_snapshot jsonb` (tax invoice must not change if the profile is edited later).
- `billing_payments`: `id`, `invoice_id`, `method` (`promptpay_slip|bank_slip|card|manual`),
  `amount`, `provider`, `provider_ref` (**unique** — same slip/charge can never pay twice),
  `status`, `raw_response jsonb`, `recorded_by` (staff for manual), `created_at`.
- `billing_events`: append-only audit (plan change, status change, invoice issued/paid/voided,
  override granted) with actor and before/after.
- SQL function `public.hotel_entitlements(target_hotel_id uuid) returns jsonb` (SECURITY
  DEFINER, `row_security=off`, authorizes `is_hotel_member` or platform admin) — the single
  source of truth both the server and DB-level guards use.
- RLS: hotel members read their own subscription/plan/invoices; only `hotel_owner` (new
  permission below) reads billing profile and pays; all writes to subscriptions/invoices go
  through SECURITY DEFINER RPCs or the billing cron, never direct table writes from the client.
- Backfill: every existing hotel gets a `trialing` (or `active` comped) subscription in the
  migration, so nothing breaks on deploy.

## Permissions (`shared/authorization.ts`)
- Existing `platform.manage_billing` (super_admin): manage plans, change any hotel's plan,
  grant overrides/extensions, record manual payments, void invoices.
- New `property.manage_billing` (hotel_owner only): view invoices, edit billing profile,
  change plan, pay. Excluded from super_admin's blanket grant, the same way
  `property.view_financials` is, so platform staff manage billing only through
  `platform.manage_billing` tools that are audited in `billing_events`. Because
  `requireHotelPermission` bypasses for super_admin, these procedures check membership role
  explicitly instead. MFA step-up for plan change and billing profile edit.
- Read-only `admin`: may *view* subscription status/plan for support (`platform.view_all_hotels`),
  not invoices' tax details.

## Entitlement enforcement
- `shared/entitlements.ts` (pure, unit-tested): `resolveEntitlements(plan, subscription,
  now)`, `hasFeature(ent, key)`, `remaining(ent, limitKey, currentUsage)`. Status rules:
  `trialing`/`active`/`past_due` (inside grace) → full plan; `suspended` → read-only set;
  `cancelled` → read-only set until data-retention end.
- Server: `requireEntitlement(ctx, hotelId, feature)` and `requireWithinLimit(ctx, hotelId,
  limitKey)` in `server/routerUtils.ts`, throwing `FORBIDDEN` with a machine-readable
  `reason: 'PLAN_FEATURE' | 'PLAN_LIMIT' | 'SUBSCRIPTION_SUSPENDED'` so the client can show
  an upgrade prompt instead of a generic error.
- Where it is called first: room create (`rooms.max`), OTA connection create
  (`ota_connections.max`, `ota.ical_sync`), staff invite (`staff_seats.max`), website
  builder/custom domain, advanced pricing writes, SlipOK settings, communications.
- DB backstop for hard limits that a race could bypass: `BEFORE INSERT` triggers on `rooms`
  and `ota_connections` that call `hotel_entitlements()`.
- Suspended = writes refused by `requireEntitlement` on every hotel-scoped mutation except
  billing ones; public booking page returns "temporarily unavailable"; **iCal export,
  scheduled iCal import, check-in/out of existing bookings keep working** (pending Q4).
- Client: `trpc.billing.entitlements` query + `useEntitlements(hotelId)` hook; `can()` stays
  for permissions, a new `hasFeature()` for plan gates; locked items show an upgrade badge
  rather than disappearing.

## Billing lifecycle (daily cron, same pattern as iCal: pg_cron → `POST /api/cron/billing`)
1. **Trial end**: no payment method needed to start; T-7 and T-1 reminders; at
   `trial_ends_at` issue the first invoice and move to `past_due` with grace.
2. **Renewal**: issue the next invoice `N` days (default 7) before `current_period_end`;
   status stays `active`; when paid, roll the period forward.
3. **Overdue**: at period end with an open invoice → `past_due`, `grace_ends_at = +7 days`
   (configurable); reminders at grace start/middle/end via in-app `notifications` (+ email
   once a provider exists — see OPEN_QUESTIONS T04 delivery question).
4. **Suspension**: grace over and still unpaid → `suspended`. Paying the open invoice
   reactivates immediately (no manual step).
5. **Cancellation**: `cancel_at_period_end` → `cancelled` at period end; data kept for a
   retention window (proposed 90 days) then flagged for platform review — never auto-deleted
   by this phase.
Every transition is idempotent (re-running the cron the same day changes nothing) and
written to `billing_events`.

## Collecting payment — v1 (PromptPay + slip, pending Q2)
- Invoice page shows a PromptPay QR for the exact `amount_due` (EMVCo payload generated
  server-side for the platform's PromptPay ID; env `BILLING_PROMPTPAY_ID`) and bank details.
- Owner uploads the slip → `billing.submitSlip(invoiceId, slip)` → verified with the
  **platform's** SlipOK credentials (`BILLING_SLIPOK_BRANCH_ID`, `BILLING_SLIPOK_API_KEY`,
  server-only env, never per-hotel) → amount and receiver account must match → payment row
  with unique `provider_ref` → invoice `paid` → subscription reactivated/rolled forward.
- Fallback: super_admin `billing.recordManualPayment` (with reference + note) for transfers
  that SlipOK cannot read.
- Later (b): `BillingProvider` interface (`createCheckout`, `handleWebhook`,
  `cancel`) with a Stripe/Opn adapter; webhooks land on `POST /api/webhooks/billing/:provider`,
  signature-verified, idempotent by event id.

## Interface contract (tRPC `billing` router, new `server/routers/billingRouter.ts`)
Hotel side (`property.manage_billing`, except where noted):
- `billing.plans()` — public catalogue (any authenticated user)
- `billing.entitlements(hotelId)` — any hotel member (needed for UI gating)
- `billing.subscription(hotelId)` — plan, status, period, usage vs limits
- `billing.changePlan(hotelId, planCode, cycle)` — upgrade now (proration invoice) /
  downgrade at period end; refuses downgrade below current usage; MFA step-up
- `billing.cancel(hotelId)` / `billing.resume(hotelId)`
- `billing.invoices(hotelId)`, `billing.invoicePdf(invoiceId)`
- `billing.updateProfile(hotelId, profile)` — MFA step-up
- `billing.submitSlip(invoiceId, slip)`

Platform side (`platform.manage_billing`):
- `billing.admin.upsertPlan`, `billing.admin.listSubscriptions` (filter by status),
  `billing.admin.setPlan(hotelId, …)`, `billing.admin.extendTrial`,
  `billing.admin.grantOverride`, `billing.admin.recordManualPayment`,
  `billing.admin.voidInvoice`, `billing.admin.revenueSummary` (MRR, active/trialing/past_due counts)

Raw Express: `POST /api/cron/billing` (Bearer `CRON_SECRET`), later
`POST /api/webhooks/billing/:provider`.

## UI
- Hotel: `/hotels/:id/billing` — current plan, usage bars (rooms, OTA connections, seats),
  next invoice, invoice list + PDF, pay (QR + slip upload), billing profile, change plan
  (comparison table from `billing.plans`). Banner in `AppShell` for `trialing` (days left),
  `past_due` (pay now, grace end), `suspended` (read-only notice).
- Platform: `/admin/billing` — plan editor, subscriptions table with status filters,
  per-hotel drawer (change plan, extend trial, override, manual payment, invoices), MRR summary.
- Sidebar/route registration via `routeScope.ts` like every other page.

## Business rules
- Prices, VAT rate, WHT rate, grace days, reminder days, retention days are **data/config**,
  never hard-coded in components.
- Money is stored as `numeric(12,2)` THB; all arithmetic in SQL or integer satang in TS.
- An invoice's plan and billing profile are snapshotted at issue time.
- Invoice numbers are gap-free per year and never reused, even when voided.
- A hotel never loses data because of billing; suspension is reversible by paying.
- Platform staff can never see `property.view_financials` data through billing screens
  (billing shows what the hotel owes the platform, not the hotel's revenue).

## Error handling
- Slip amount/receiver mismatch → clear error, invoice stays `open`, attempt logged.
- Duplicate slip → "already used" (unique `provider_ref`), no double credit.
- Plan limit hit → `PLAN_LIMIT` with limit and current usage, UI shows upgrade CTA.
- Cron partial failure → per-hotel errors collected and logged, other hotels still processed
  (same shape as `server/otaScheduler.ts`).

## Acceptance criteria
- [ ] Plans are editable by super_admin and listed for owners; no prices in code
- [ ] Every hotel has exactly one subscription after the migration (verify script checks)
- [ ] A starter-plan hotel cannot exceed `rooms.max` via UI, API, or a concurrent insert (DB trigger)
- [ ] A hotel without `ota.ical_sync` cannot add an OTA connection; one with it can
- [ ] Trial → invoice → slip payment → `active` with the period rolled forward, end to end
- [ ] Unpaid past grace → `suspended`: back-office writes refused with `SUBSCRIPTION_SUSPENDED`,
      iCal export still serves, paying reactivates immediately
- [ ] The same slip cannot pay two invoices
- [ ] Upgrade issues a correct prorated invoice; downgrade below usage is refused
- [ ] `front_desk`/`revenue_manager`/`admin` cannot see invoices, pay, or change plan; super_admin
      can manage plans but cannot act through `property.manage_billing`
- [ ] Daily cron is idempotent (two runs on the same day = one set of changes)

## Test plan
- `shared/entitlements.test.ts`: resolution by status, overrides, limits, unknown-key = denied
- `server/billingLifecycle.test.ts`: pure state machine (trial end, renewal, grace, suspend,
  reactivate, cancel) driven by a fake clock
- `server/billingInvoice.test.ts`: VAT/WHT/proration arithmetic in satang, numbering format
- `server/billingRouter.access.test.ts`: permission matrix per role (pattern of
  `server/financials.access.test.ts`) + entitlement refusals
- `server/billingMigration.test.ts`: contract test of the migration (pattern of
  `server/otaIcalMigration.test.ts`)
- `client/src/pages/Billing.contract.test.ts`, `AdminBilling.contract.test.ts`

## Suggested ticket split
1. Plan catalogue + `shared/entitlements.ts` + subscriptions table + backfill (no money)
2. Entitlement guards in routers + DB limit triggers + client `useEntitlements`/upgrade badges
3. Billing profile + invoices (numbering, VAT/WHT, snapshots, PDF)
4. Payment v1: PromptPay QR + platform SlipOK verification + manual payment
5. Lifecycle cron (`/api/cron/billing`) + notifications + AppShell banners
6. Platform admin billing console + MRR summary
7. (later) Card gateway adapter + webhooks

## Definition of Done
- [ ] `pnpm test`, `pnpm check`, `pnpm build` pass — output pasted
- [ ] Migration + `verify_*.sql` applied by the human, all PASS
- [ ] No TODO/FIXME in touched files
- [ ] Spec status updated, `.agent/handoff.md` entry written
- [ ] Reviewer approved with evidence
