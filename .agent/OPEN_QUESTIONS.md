# Open questions

Log questions the RONDMAP does not answer. Pick the safest default, mark it ASSUMPTION: in code.

## 2026-10-17 — SaaS shell

- **Plan prices are placeholders.** Seeded `starter` 990/9,900 · `standard`
  1,990/19,900 · `pro` 3,990/39,900 THB in `20261017_saas_billing_schema.sql`
  and mirrored in `shared/billing/planCatalog.ts`. Owner to confirm real
  numbers; they live in the `plans` table, so changing them is a row UPDATE.
  ASSUMPTION: yearly < 12x monthly (enforced by a test).
- **Trial length.** 14 days, in `DEFAULT_TRIAL_DAYS`. RONDMAP E2 also plans a
  "free pilot with 3–5 known hotels" — that may want a longer trial or a manual
  plan. Not yet decided.
- **`past_due` has no automatic transition.** Nothing sweeps a lapsed
  subscription into `past_due`, and no webhook confirms PromptPay. Today an
  operator records payment via `billing.confirmPayment`. A cron/Vercel function
  is its own ticket.
- **SlipOK for subscriptions is not wired.** `billing.confirmPayment` accepts
  `source: 'slipok'` but nothing calls SlipOK for membership payments; only
  PromptPay QR generation exists. Needs a platform SlipOK key, which RONDMAP
  still lists as "รอคำตอบ ตม.".
- **Self-signup email delivery.** Signup requires a Supabase session, so
  `client/src/pages/Signup.tsx` falls back to password sign-in and asks the user
  to confirm their email first. No magic-link email is sent from our side.
  ASSUMPTION: Supabase's default email template is good enough for launch.
- **Lapsed hotels keep existing data readable** (owner decision 2026-10-17) but
  there is no staff-facing banner yet — only the public booking page is gated.
  The dashboard hook is a follow-up.
- **iCal feed tokens have no rotate path.** The 2026-10-17 rotation migration
  fixes the weak backfilled values, but if a token ever leaks later there is no
  button in the OTA page to reissue one. ASSUMPTION: applying the rotation
  migration again is the workaround (it invalidates all links, so it is not
  something to do casually). A real rotate action is a small ticket.

