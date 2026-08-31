# 00 — Overview

Translates `todo.md`'s "Roadmap: Remaining Modules" (Phases A–H) into the executable
spec format this workflow uses. `todo.md` remains the narrative history of *why*;
these specs are the *what, precisely* for what's not built yet.

## Architecture (current, before any of these phases)

See `.agent/recon/REPORT.md`'s System map for the live diagram. In short: React
(client) → tRPC (`server/routers.ts`) → either an RLS-scoped Supabase client
(`server/db.ts`, the default) or the service-role admin client (`server/supabase.ts`,
only where RLS genuinely can't apply — anonymous signup, Auth user admin). Every
capability is gated by a named `Permission` in `shared/authorization.ts`, checked on
both sides.

## Dependency graph

```
09-authenticator-mfa ─────────────▶ 01-payments-slipok ──────────────┬──▶ 05-direct-booking-engine
  (MFA step-up gates SlipOK          (checkout needs a payment/       │      (checkout needs a payment/
   settings access)                   verification step)              │       verification step)
                                  02-advanced-pricing ──────────────────────▶ 05-direct-booking-engine
                                  │                                    │      (checkout needs a resolved rate)
                                  03-housekeeping-board                │      (independent — no dependency on A/B)
                                  04-communications                    │      (MVP exists, tRPC pending)
                                  06-website-builder                          (independent — hotel_media/hotel_domains are unused today)
                                  07-ota-live-integrations                    (independent, but gated on external partner approval —
                                                                                a business step, not a code dependency)
                                  08-cross-cutting-hardening                   (pick up opportunistically alongside any of the above,
                                                                                or as its own pass once several phases are underway)
```

No cycles. `09` gates `01` (MFA step-up must exist before SlipOK settings ship, per
the human's explicit request); `01` and `02` both feed `05`. Everything else can
start in any order the human prioritizes. `07`'s real blocker is external (OTA
partner API access), not sequencing within this repo.

## Spec index

|| Spec | Phase | Status | Owner-tier | Depends on |
||---|---|---|---|---|
|| `09-authenticator-mfa.md` | I | DONE (2026-08-30 opencode/deepseek-v4-pro) | worker-code | — |
|| `01-payments-slipok.md` | A | PARTIAL — settings infra done (MFA gate, encryption, migration, UI); `verifySlip` booking mutation still pending | worker-code | 09 |
|| `02-advanced-pricing.md` | B | DONE (2026-08-30 opencode/deepseek-v4-pro) | worker-code | — |
|| `03-housekeeping-board.md` | C | DONE (2026-08-30) | worker-code | — |
|| `04-communications.md` | D | DONE (2026-08-30) | worker-code | — |
|| `05-direct-booking-engine.md` | E | DONE (2026-08-31) | worker-code | 01, 02 |
|| `06-website-builder.md` | F | DONE (2026-08-31) | worker-code | — |
|| `07-ota-live-integrations.md` | G | DEFERRED PERMANENTLY (human decision 2026-08-31) | worker-code | — |
|| `08-cross-cutting-hardening.md` | H | DONE (2026-08-31) | worker-bulk / worker-code (mixed, see spec) | — |

Numbering note: `09` was added after `01`–`08` already existed (the human asked for
MFA once the first roadmap pass was already written), so it sorts after them
alphabetically by filename despite being an earlier dependency. Don't renumber the
existing files just to make the sort order match the dependency order — the table
above and the graph are the source of truth for sequencing, not the filenames.

## How to use these specs

Each spec is written at "phase" granularity, not "ticket" granularity — a phase's
Acceptance Criteria section will usually decompose into 3–8 tickets once someone
actually starts the loop (`.agent/MASTER_PROMPT.md` §6). Split it into
`.agent/tickets/` files at that point; don't try to do a whole phase as one ticket.