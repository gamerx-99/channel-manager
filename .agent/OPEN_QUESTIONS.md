# Open questions

Format: `- [ ] <question> — ASSUMPTION used in the meantime: <default>, raised <date>`
Move to a `## Resolved` section (don't delete) once the human answers, with the
answer noted.

## Open

- [ ] Spec 12 (SaaS billing) Q1: plan line-up, feature/limit mix, THB prices, trial length.
      ASSUMPTION: placeholder plan codes `starter`/`pro`/`business` with no prices; prices
      live only in `billing_plans` rows. Raised 2026-10-26.
- [ ] Spec 12 Q2: how the platform collects subscription money — PromptPay/bank slip
      verified with the platform's own SlipOK key (manual renewals), or card auto-renew via
      Stripe/Opn. ASSUMPTION: v1 = PromptPay + slip behind a `BillingProvider` interface.
      Raised 2026-10-26.
- [ ] Spec 12 Q3: is the operating company VAT-registered, and should invoices handle 3%
      withholding tax (50 ทวิ)? ASSUMPTION: model both VAT and WHT as per-invoice rates
      defaulting to 0 until answered. Raised 2026-10-26.
- [ ] Spec 12 Q4: what a `suspended` hotel can still do. ASSUMPTION: read-only back office,
      public booking page off, iCal export/import and existing bookings keep working (no
      double-booking risk). Raised 2026-10-26.
- [ ] Spec 12 Q5: mid-period plan changes. ASSUMPTION: upgrade immediate with prorated
      invoice; downgrade at period end, refused if usage exceeds the new limits. Raised 2026-10-26.

- [ ] `DATABASE_URL`/`SUPABASE_POOLER_DB_URL` in `.env` are placeholder values, not a
      real pooler connection string — so `server/runPostgresMigration.mjs` and
      `server/verifySupabaseMigration.mjs` can't run against the live project from
      this environment. ASSUMPTION: every migration continues to be applied by hand
      via the Supabase SQL editor, with a `verify_*.sql` companion the human runs and
      pastes results from. Raised 2026-08-30.
- [ ] `pnpm dev`'s local server has failed to bind (`server.listen()`'s callback never
      fired, confirmed by absence of "Server running on..." in its logs across many
      restarts) in this sandboxed environment. ASSUMPTION: verify changes against the
      live Vercel deploy instead of local dev when this happens; not yet root-caused.
      Raised 2026-08-30.
- [ ] Phase A (SlipOK): where should each hotel's `slipok_api_key` be encrypted —
      Supabase Vault, or app-level encryption with a server-only secret? Not yet
      researched. ASSUMPTION: block Phase A's schema ticket on answering this rather
      than guess, since it's a real security decision, not a style choice. Raised
      2026-08-30.
- [ ] Phase A: what permission gates the SlipOK settings page — reuse
      `property.manage_profile`, or add a new narrow permission (mirroring how
      `property.view_financials` was deliberately scoped away from
      `super_admin`/`admin`)? Raised 2026-08-30.
- [ ] No lint tooling (ESLint/Biome) is configured in this repo currently. Not
      blocking any current phase, but flagged in `todo.md`'s Phase H as a possible
      future addition — don't add one opportunistically inside an unrelated ticket.
      Raised 2026-08-30.
- [ ] Phase T04 (Communications): does the human want email/SMS/WhatsApp delivery for guest messaging in v1, or is in-app-only sufficient? `specs/04-communications.md:17-21` says default to in-app-only if unanswered. No provider decision exists today (no `RESEND_API_KEY`/`TWILIO_*` in `.env.example`, no `twilio`/`resend` deps in `package.json`). ASSUMPTION for T04-01 recon: in-app-only v1 — staff-visible threads attached to bookings, no external delivery; log this question and revisit provider choice (Resend for email, Twilio for SMS/WhatsApp) as a standalone ticket if needed. Raised 2026-08-30 T04-01.
- [ ] Phase T04 (Communications templated trigger): Supabase `pg_cron` availability on the current Supabase plan was not verified live — `supabase_migration_production.sql:6` shows only `btree_gist` and no `pg_cron` extension. Vercel Cron (`vercel.json` `crons`) was selected as primary because it needs no DB extension and fits the existing `api/index.ts -> dist/index.js` serverless shape; Supabase `pg_cron` / Edge Function schedule is the documented fallback. ASSUMPTION: proceed with Vercel Cron `GET /api/cron/messaging` guarded by `CRON_SECRET`/`x-vercel-cron`; confirm in Supabase dashboard that `pg_cron` is available before switching. Raised 2026-08-30 T04-01.
- [ ] The Orchestrator role in `.agent/MASTER_PROMPT.md` assumes it runs at whatever
      model tier the human's Claude Code session is on — it cannot switch its own
      model mid-session. If a phase seems to warrant Opus-tier orchestration
      (Phase G's OTA partner-API work, most likely), that's a manual switch the human
      needs to make, not something a ticket can request automatically. Raised
      2026-08-30.
- [ ] The staff "Availability" page (`client/src/pages/Calendar.tsx`, backed by
      `listAvailabilityForHotel`/an `availability` snapshot table staff edit by hand
      via "Save changes") is **not connected** to live `bookings` data at all — even a
      `confirmed` booking today doesn't decrement the room count shown there. This is
      pre-existing, not introduced by Booking Lifecycle v1. Found while checking
      whether the new HELD/PENDING_PAYMENT states would show stale "full" cells after
      expiry — they won't, but only because the whole page is already disconnected
      from live booking state, which is its own separate UX gap (staff-entered numbers
      can drift from what customers can actually book). Left out of Booking Lifecycle
      v1 Phase 1 scope — flagging as a candidate for its own ticket if the human wants
      the two systems reconciled. Raised 2026-09-03.

## Resolved
- [x] Phase 1 of i18n covers only the chrome structure (Sidebar, Topbar, Login) and translation dictionary infrastructure (`client/src/lib/i18n/`). Other application pages remain in English for now. RESOLVED 2026-09-02: Phase 2 wired all 18 content pages (Calendar, Home, Bookings, HotelDetail, Hotels, Financials, Housekeeping, Communications, OtaSync, AdvancedPricing, HotelStaff, AdminUsers, SecuritySettings, WebsiteBuilder, ChannelPerformance, MfaEnroll, NotFound, PublicHotel) to the translation system with complete EN/TH dictionary parity and test suites passing.

