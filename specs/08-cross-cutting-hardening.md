# 08 Cross-cutting Platform Hardening
Status: TODO
Depends on: —
Owner-tier: mixed (see each item)

Not tied to one sidebar placeholder — pick items up opportunistically alongside
phases 01–07, or as their own tickets. Each item below is independent; treat this
file as a menu, not a single sequential spec.

## Items

### Notifications (worker-code)
In-app and/or email notifications for: new bookings, payment verified (Phase A),
signup link used, OTA sync failures. No existing notification infra — first ticket
should be the delivery mechanism (in-app toast/inbox vs. email via whatever provider
Phase D ends up choosing), not all four triggers at once.

### Automate migration application (worker-code)
Get real `DATABASE_URL`/`SUPABASE_POOLER_DB_URL` credentials into this environment so
`server/runPostgresMigration.mjs` works, or formally accept manual SQL-editor
application as permanent process and document it clearly in `CLAUDE.md`'s Migrations
section (already partially done). This is a decision for the human, not something to
default silently.

### Rate limiting on public endpoints (worker-code)
`/signup/:token`'s `validateSignupLink`/`completeHotelOwnerSignup`, and the
pre-existing `publicHotel` procedure — both `publicProcedure` with zero throttling
today. Needs a decision on where rate limiting lives (Express middleware vs. a
Vercel-level solution) before implementing.

### Bundle size (worker-bulk, once there's enough to split)
`vite build`'s output has warned about a >1.8 MB main JS chunk on every build this
session. Route-level code splitting (`React.lazy` per page) is the obvious fix —
worth doing once Phases A–G have added enough pages to make the split meaningfully
reduce initial load, not before.

## Acceptance criteria (per item, tracked independently — this spec doesn't have one
combined DoD since the items are unrelated)
Each item gets its own ticket with its own acceptance criteria drawn from its
description above, decided when that item is actually picked up.

## Definition of Done
Standard DoD from `CLAUDE.md`, applied per-item/per-ticket, not to this file as a
whole.
