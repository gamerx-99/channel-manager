# T04-01 — Communications recon
Status: TODO
Owner: worker-code
Spec: specs/04-communications.md
Depends: —
# Goal: Pure recon — no production code. Read shared/authorization.ts (operations.* permissions), server/db.ts bookings/hotels, specs/04 data model. Decide: message_threads + messages tables design, reuse operations.view_bookings / operations.manage_bookings (don't add new permission unless needed), confirm in-app-only v1 (log email/SMS question to OPEN_QUESTIONS.md if unanswered) and templated trigger mechanism (Vercel Cron vs Supabase scheduled — check what's available). Write to .agent/DECISIONS.md + .agent/recon/REPORT.md T04-01.
