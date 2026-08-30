# T03-01 — Housekeeping recon + blocking decision
Status: TODO
Owner: worker-code
Spec: specs/03-housekeeping-board.md
Depends: —
# Goal: Pure recon ticket — no production code. Read shared/authorization.ts permission matrix, server/db.ts existing hotel/room/booking tables, and spec 03 data model. Decide: checklist as jsonb vs fixed booleans (safest default = fixed small set), status enum, and confirm view-vs-edit role split per spec. Write decision to .agent/DECISIONS.md + .agent/recon/REPORT.md section T03-01. Do not touch production code.
# DoD: pnpm check/test/build not required (no code), but recon report written + DECISIONS entry.
