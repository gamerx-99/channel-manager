# Open questions

Format: `- [ ] <question> — ASSUMPTION used in the meantime: <default>, raised <date>`
Move to a `## - [2026-11-01] Owner's decisions now in the legal text, for a lawyer to confirm: Computer-Related Crime Act s.26 applies to Hayhost and overrides erasure for 90 days; 5-year tax retention for a natural person (Revenue Code not in local data); forum clause by the Provider's domicile; EU/UK clauses meet clause 10(2) of the s.29 notification; a liability cap that is zero while no fee is charged; whether SlipOK with the hotel's own key is the hotel's processor or a Hayhost sub-processor.
- [2026-11-01] Retention still undecided: booking IP hash, sales agents, support email. See the ROPA sheet.

- [2026-11-01] For a lawyer: is a list of sub-processor groups, with names on request, enough for DPA clause 4 and the transfer notice under the s.29 notification clause 11(1)?

Resolved` section (don't delete) once the human answers, with the
answer noted.

## Open
- [ ] Website builder (2026-11-04): confirm the safeguards chosen for draft/publish. `ASSUMPTION:` users with `property.manage_profile` may discard a saved draft after confirmation; uploads are stored immediately but hidden from public output until selected as hero and published; hero selection and image focal points are staged until publish; deleting the currently published hero is blocked; the protected builder's local preview is visible only to users with `property.manage_profile` and is never public. Draft preview uses the existing in-page renderer and does not emulate every theme exactly. Raised 2026-11-04.
- [ ] ASSUMPTION (2026-11-04): only the hotel's `hotel_owner` may manage or pay its subscription; super admins use CRM billing tools and cannot purchase on behalf of a hotel. Confirm if platform staff should be able to make a payment for a customer.
- [ ] A hotel with no hotel_owner account (seed or demo data): when does its 15-day trial start? `ASSUMPTION:` the hotel's own creation date, so it still appears in the CRM and dashboard counts. Raised 2026-11-04.
- [ ] When a hotel's 15-day Pro trial ends, what should happen if it has more than 3 rooms under the Free plan? `ASSUMPTION:` do not enforce a room limit or alter/delete existing hotel data until the owner decides. Raised 2026-11-04.
- [ ] Platform user with no hotel memberships on `/hotels` (2026-11-03): `listManagedHotels` intentionally excludes platform memberships. `ASSUMPTION:` show an empty-state explaining owner permission is required and link to `/platform`; do not expose hotel data or present a misleading zero count.
- [ ] Landing page demo link: previous `Landing.tsx` linked to `#features`; no existing public demo URL is configured. `ASSUMPTION:` `/sample-stay` is the demo slug, using the public-hotel render fixture as the available example. Confirm the intended production demo slug. Raised 2026-11-03.
- [ ] `ASSUMPTION:` every hotel can pick every website template for now. `minimal-white` is marked basic and `lanna-teak` / `cafe-homestay` premium with a "Pro" tag, but no plan check exists yet. Decide when Free/Pro enforcement is built. Raised 2026-11-03.
- [ ] `ASSUMPTION:` hotel owners cannot change the public hotel slug in profile editing, because changing it may break guest links already shared. Confirm whether slug changes should remain unavailable or use a redirect. Raised 2026-11-02.
- [ ] Legal: the owner will register as a natural person once there is income. PDPA s.23(5) needs the controller's identity and contact when data is collected, so a name and contact are needed before real hotels sign up. Raised 2026-11-01.
- [ ] Legal: the Mae Hong Son court clause was chosen by the owner. The Civil Procedure Code is not in `C:\thai-law`, so whether it holds against a hotel elsewhere is unverified. Raised 2026-11-01.
- [ ] Legal: Cloudflare's DPA takes effect on signature or agreement, and the owner must confirm it is accepted on this account. Cloudflare and Resend clauses name EU, UK and Swiss transfers, not Thailand. Whether they meet the 2023 s.29 notification needs a lawyer. Support mail goes to a Gmail account. Raised 2026-11-01.
- [ ] Legal: Privacy clause 6 says 3 years for audit logs, chosen from PDPA s.78, and nothing deletes them on a timer. Raised 2026-11-01.
- [ ] Legal: Computer Crime Act 2007 s.26 keeps traffic data 90 days and data identifying a service user 90 days after the service ends. If hayhost counts as a service provider, account deletion (at once) and hotel purge (day 59) are too early, and nothing keeps traffic data. The 2017 amendment could not be read. ASSUMPTION: unchanged until a lawyer answers. Raised 2026-11-01.
- [ ] Legal: Privacy clause 6 still says periods are being set, but PDPA s.23(3) requires a period or an expected one at collection. Needs the owner's numbers. Raised 2026-11-01.
- [ ] Legal: the Hotel Act, its guest register rules and the Unfair Contract Terms Act were not readable in `C:\thai-law`, and the 2022 breach and processor-record notifications failed to load. Nothing here cites their text. Raised 2026-11-01.
- [ ] Spec 18: a closed hotel is deleted outright on day 66, bookings and TM.30 data included. Do the Hotel Act, immigration or tax rules require anything to be kept longer, and by the hotel or by hayhost? ASSUMPTION: these are the hotel's duties, met by the export. A lawyer must confirm. Raised 2026-11-01.
- [ ] Spec 18: Terms 4.2 says the service ends on the day of cancellation, but closure has a 7-day wait. No fees are charged yet, so nothing is wrong today. ASSUMPTION: the service ends when the wait ends; the text needs the owner's wording before billing starts. Raised 2026-11-01.
- [ ] Spec 18: a purged hotel leaves `hotel_purge_log` (id and dates only) as proof, with no end date. ASSUMPTION: it holds no personal data, so it stays. Raised 2026-11-01.
- [ ] 2FA is optional for hotel accounts, but platform roles (super_admin, admin, support) must still enrol. ASSUMPTION: they reach every hotel, so the rule stays until the owner says otherwise. Raised 2026-11-01.
- [ ] Spec 17: how long must bookings, payments, guest records and audit rows be kept, and which of them does the law require (Hotel Act/TM.30, tax, PDPA)? Nothing here is confirmed by a lawyer.
      ASSUMPTION: every such row stays, with the person replaced by `deleted-user`, and nothing is deleted on a timer. Raised 2026-10-31.
- [ ] Spec 17: do audit rows need the real actor kept for a dispute or a legal request? ASSUMPTION: no; the actor becomes `deleted-user` and no mapping is kept, so the deletion cannot be undone or traced later. Raised 2026-10-31.
- [ ] Spec 17: guests have no account, so they cannot use this. Who handles a guest's PDPA deletion request, the hotel or hayhost? Not built. ASSUMPTION: requests go to the hotel as data controller; none are handled in code. Raised 2026-10-31.
- [ ] Spec 17: free text that may name a person is kept as it is: `messages.body`, `booking_status_log.reason`, `hotels.owner_contact` when it is not exactly the account email, and notifications. ASSUMPTION: these are the hotel's records and cannot be matched reliably. Decide whether an admin process is needed. Raised 2026-10-31.
- [ ] Spec 17: the last platform admin cannot delete their account. ASSUMPTION: refuse, because no screen can create another one. Confirm this is acceptable for a PDPA request from that person. Raised 2026-10-31.
- [ ] Spec 17: no record is kept that a deletion happened, and no confirmation email is sent, so there is no proof for a later complaint. ASSUMPTION: none, because a log would need a migration and a decision on what it may store. Backups and Cloudflare logs are outside this code: D1 Time Travel keeps deleted rows until its retention ends. Raised 2026-10-31.
- [ ] Spec 17: a user who lost their authenticator cannot pass the step-up, so cannot delete their account until 2FA recovery exists. ASSUMPTION: they contact support. Raised 2026-10-31.
- [2026-10-31] "OTA sync stays hidden": the sidebar still shows OTA sync to holders of `ota.view_status`. It was left unchanged.
- [2026-10-31, fixed on `feat/hayhost-hardening`] Staff BookingWizard `availableRooms` hid every room when any booking overlapped. It now compares room ids (`client/src/lib/roomAvailability.ts`). ASSUMPTION: held and pending bookings block their room in the list even if expired, because the list has no `expires_at`; the server still decides.

- [ ] Should signup verify email once Resend is live? A self-registered owner invited to another hotel must set a new password through the invite link.
      ASSUMPTION: unverified accounts receive the role only through the emailed token, and their old password, sessions and 2FA are removed. Raised 2026-10-31.
- [ ] Spec 13 Q1: transactional email provider for invites/password reset/MFA recovery.
      ASSUMPTION: Resend free tier. Raised 2026-10-26.
- [ ] Spec 13 Q2: carry Supabase bcrypt password hashes over, or re-invite existing users.
      ASSUMPTION: re-invite (few users pre-launch). Raised 2026-10-26.
- [ ] Spec 12 (SaaS billing) Q1: plan line-up, feature/limit mix, THB prices, trial length.
      ASSUMPTION: placeholder plan codes `starter`/`pro`/`business` with no prices; prices
      live only in `billing_plans` rows. Raised 2026-10-26.
- [x] Spec 12 Q2: answered 2026-11-04 — PromptPay QR and automatic verification through the platform's SlipOK keys; see `.agent/DECISIONS.md` and ticket C.
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

- [ ] PUBLIC_BOOKING_LIMITER edge cases (2026-10-30, branch `cloud/remove-express`):
      (1) a request with no CF-Connecting-IP header is not counted by the binding (it
      cannot have come through Cloudflare's edge) instead of sharing one bucket; (2) if
      `limit()` throws, the request falls back to the older limits (per-isolate
      `rateLimitedProcedure` counter + D1 active-holds-per-IP guard) instead of failing.
      ASSUMPTION: both fail open, see `server/publicBookingRateLimit.ts`. Confirm or ask
      for fail-closed. Raised 2026-10-30.

## Resolved

- [x] [2026-11-01] Spec 17: an owner with nobody to transfer to had no self-service way to close a hotel. Spec 18 adds one on the security settings page.

- [x] [2026-11-01] Central SlipOK receiver fallback and the unused `slipok_*` columns: both closed when the owner returned to per-hotel keys. `log: true` checks the receiver, and the columns and `slipokCrypto.ts` are in use again.

- [x] 13-06a private-network DNS protection. ASSUMPTION (2026-10-28): Cloudflare Workers cannot
      reach private networks, so the Worker iCal guard validates literal IP ranges and local
      hostname forms without DNS-over-HTTPS. Revalidate every redirect target; do not add a DNS
      resolver.

- [x] 13-04b OTA cancellation semantics versus `20261026_ota_ical_room_type_mode.sql`. ANSWER
      (owner, 2026-10-28): the owner policy supersedes the SQL for staff-cancelled bookings. A
      cancelled OTA row is sync-cancelled only when its latest status-log row has
      `to_status='cancelled'`, `changed_by IS NULL`, and reason `ota_ical_removed_from_feed`; only
      that row may revive to `confirmed` when its UID returns, with reason `ota_ical_restored`.
      Other cancelled rows, including legacy rows with no status log, remain cancelled and are
      reported in `skipped_uids` without counting as conflicts or creating a replacement block.
      The missing-log behavior is an explicit safe-side ASSUMPTION in code. This is the tested
      exception to the SQL function's broader cancelled-row revive behavior.

- [x] Spec 13-03 scope and platform summary fields. ANSWER (owner, 2026-10-28): port every
      `server/db/*` repository into new `server/d1/*` modules with equivalent exports, D1 scope
      checks, and happy-path plus cross-hotel tests. Keep live Supabase callers unchanged until
      13-07/13-08. Do not port `channelPerformance` or `saveHotelSiteConfig`'s synthetic-success
      fallback. Platform summary `plan` and `payment_status` stay null until spec 12 billing
      exists; never use guest payment data as a substitute. Port modules in separate commits and
      stop for any module that cannot be faithfully ported, documenting the reason.

- [x] Spec 13-03 booking repository allocation. ANSWER (owner, 2026-10-28): move
      `server/db/booking.ts` to ticket 13-04a because it depends on the Postgres RPC behaviors
      `get_public_room_type_availability_for_guests`, `transition_booking_status`, and
      `get_public_hotel`, whose TypeScript/D1 replacements belong to 13-04. Close 13-03 with the
      other D1 scoped repositories complete; port booking once in 13-04a. This narrows the earlier
      13-03 repository-port scope specifically for booking. Live callers remain unchanged.

- [x] Spec 13-04a booking export count. ANSWER (owner, 2026-10-28): the prompt's count of nine
      was wrong; port all ten current exports from `server/db/booking.ts`. `getStayDates` remains a
      pure date helper without D1 context and gets the same check-out-exclusive/month-boundary
      unit tests. The other nine take `D1CallerContext`, enforce scope, and follow the 13-04a
      money, transaction, lifecycle, and tenancy requirements.

- [x] Spec 13 Q3: launch domain. ANSWER (human, 2026-10-27): **www.hayhostth.com** (brand
      "hayhost"; the "th" signals a Thai business). Register on Cloudflare before ticket 13-08.
- [x] Spec 13 Q4: Cloudflare account. ANSWER (human, 2026-10-27): the account under
      lannatc@gmail.com owns Worker, D1, R2 and the domain.
- [x] Phase 1 of i18n covers only the chrome structure (Sidebar, Topbar, Login) and translation dictionary infrastructure (`client/src/lib/i18n/`). Other application pages remain in English for now. RESOLVED 2026-09-02: Phase 2 wired all 18 content pages (Calendar, Home, Bookings, HotelDetail, Hotels, Financials, Housekeeping, Communications, OtaSync, AdvancedPricing, HotelStaff, AdminUsers, SecuritySettings, WebsiteBuilder, ChannelPerformance, MfaEnroll, NotFound, PublicHotel) to the translation system with complete EN/TH dictionary parity and test suites passing.


- [ ] Spec 14-03b/14-04 implementation assumptions (2026-10-30): the short spec does not
  define a bearer-token exchange or support-account discovery. ASSUMPTION: an owner
  approves an existing support account by opaque user id; the authenticated account
  uses the persisted grant directly. Only the owner can create/revoke/read keys and
  their audit trail (a dedicated permission, never delegated). Existing intersection
  semantics apply to overlapping keys; client projection expires at the earliest key
  expiry and refreshes from the server. Platform summaries retain null plan/payment
  status per the answered spec 13 question. No new migration is required.

- [ ] Spec 14-03b aggregate-path hardening (2026-10-30): ASSUMPTION: until a
  separate platform-notification store exists, the global platform feed is empty
  and global hotel-notification mutations are forbidden. Existing hotel notifications
  can contain guest data and cannot appear in the summary-only platform dashboard.

- [ ] Spec 14-03b delegated staff management (2026-10-30): ASSUMPTION: existing
  invite and role-template changes must obey the same permission bounds as switches;
  ownership transfer requires an owner-reserved permission. Otherwise the newly live
  manage_staff toggle bypasses owner-only switches by promoting or transferring roles.

- [ ] Spec 14 financial switch/report distinction (2026-10-30): existing shared
  permissions allow owner-granted financial amount visibility, while the spec
  explicitly keeps the financial dashboard owner-only. ASSUMPTION: retain both
  existing server semantics and mirror the owner-only dashboard gate in routing
  and navigation. Letting staff open that report requires a future spec decision;
  this delivery does not change the report endpoint or expand support permissions.


- [ ] Public signup (2026-10-31): the owner asked for a signup page. ASSUMPTION: one hotel per account, the hotel starts private, and the Worker rate limiter guards the hotel step. The page shows no prices, no trial and no terms, because those are unconfirmed. Decide email verification and the signup terms before production.

- [x] Social sign-in, email match (2026-11-01, closed): email verification now runs at signup, so a confirmed password account joins a matching verified Google login automatically. Unconfirmed accounts stay refused. ASSUMPTION: enforcement needs a real mail provider (`RESEND_API_KEY`), and the link marks the email only, without logging in, so it cannot skip the password or 2FA.
- [ ] Social sign-in, link step-up (2026-11-01): Connect needs only a live session, so a stolen session could add its own login. A 2FA account still gets the code prompt on that login. Decide whether Connect should ask for a password or code first.
- [ ] Social sign-in, provider email (2026-11-01): ASSUMPTION: only a provider-verified email is stored, so Facebook and LINE accounts get a placeholder and have no real email. They cannot reset a password, receive email, be found by staff or support invites, or be told apart by email in staff lists. Decide whether to collect a contact email and how to verify it.
- [ ] Social sign-in, 2FA (2026-11-01): `twoFactor.enable` needs a password, and `allowPasswordless` stays off. ASSUMPTION: an account with no password cannot turn on 2FA. Google users can set a password through forgot-password first; Facebook and LINE users cannot. Decide whether to allow passwordless enrolment, with UI changes to MfaEnroll and MfaSettings.
- [ ] Social sign-in, account deletion (2026-11-01): spec 17's `deleteAccount` on `feat/account-deletion` requires a password, so a Facebook or LINE account cannot delete itself. This needs another confirmation, such as a fresh provider login, before those providers go live. PDPA relevant.
## Raised on `feat/hayhost-hardening` (2026-10-31)
- [x] ASSUMPTION (2026-11-02): Signup legal notice is plain linked text under the submit button, not a required checkbox, because no spec requires an affirmative checkbox. Revisit if legal counsel requests it.
- [ ] Dashboard calendar for front desk / housekeeping: reading saved allotment and rates needs `revenue.manage_rates`, so the whole calendar used to fail with 403 for them. ASSUMPTION: they now see booking-based room counts with prices hidden, and an owner's stop-sell or reduced allotment is not reflected for them. Decide whether front desk should see saved allotment (a new read-only permission) or rates. Raised 2026-10-31.
- [ ] Web bookings are stored with `source = 'manual'`, because the `bookings_source_check` constraint only allows `manual`, `walk-in`, `phone` and `ota_ical`. The bookings list and channel reports cannot tell a web booking from one staff typed in. A fix needs a migration that adds a `website` source; not made here. Raised 2026-10-31.
- [ ] Manual slip review: the slip image is sent to SlipOK but never stored, so staff approving a `pending_verification` booking cannot see the slip and must check their bank app. ASSUMPTION: unchanged. Storing slips in R2 is its own ticket (privacy and retention decision). Raised 2026-10-31.
- [ ] `SLIPOK_API_BASE_URL` (local mock only) is honoured only for loopback URLs. ASSUMPTION: no deployed Worker should set it. Raised 2026-10-31.
- [ ] First-visit language: the landing and signup pages are Thai; every other page now follows the browser (Thai for `th-*`, otherwise English) until the visitor picks one. ASSUMPTION: foreign guests on a hotel's public page keep English. Decide whether the public hotel page should follow the hotel instead. Raised 2026-10-31.
- [ ] Server errors are translated on the client from a list of 31 known English messages (`client/src/lib/serverErrors.ts`). Any other server message still shows in English. ASSUMPTION: enough for now; a full fix would be error codes from the server. Raised 2026-10-31.
- [ ] Signup with a registered email (2026-11-01): with verification on, signing up again with an existing address shows the same "check your email" page and sends nothing, so nobody can test which emails exist. A real owner whose address was squatted must use forgot-password, then sign in and confirm. Decide whether to send them a notice email.

- [x] ASSUMPTION (2026-11-04 guided tour): progress is measured against the selected hotel and existing required fields (name, address, contact); room-type quantity creates room records used to detect setup. Screenshot placeholders remain until local images can be captured.
