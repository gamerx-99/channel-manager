# T04-03 — Templated pre-arrival message trigger
Status: TODO
Owner: worker-code
Spec: specs/04-communications.md
Depends: T04-02
# Goal: Implement simplest templated message (day-before-check-in reminder) — either as a pure function that can be called via tRPC/cron or document manual trigger. Needs booking date awareness (check_in). Add server/messaging.templated.test.ts proving trigger fires for booking with check_in = tomorrow and not for other dates. Gracefully handle missing tables.
