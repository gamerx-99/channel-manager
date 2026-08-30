# 07 Live OTA API Integrations (ARI push / booking push)
Status: TODO (external blocker)
Depends on: —
Owner-tier: worker-code

## Goal
Extend OTA integration beyond the current iCal-only scope: push
Availability-Rates-Inventory (ARI) changes outward to connected OTAs, and ingest
real bookings pushed inbound from them.

## Non-goals
- Anything beyond whichever OTA(s) the human actually secures partner API access
  for — do not build against a hypothetical unified interface before at least one
  real partner's API is confirmed

## Hard external blocker — read before starting any ticket here
`service.ari_sync_reserved` and `service.booking_push_reserved` already exist as
permissions in `shared/authorization.ts` but are deliberately granted to nobody —
`AUTHORIZATION_MODEL.md` documents this as intentional, not an oversight. Every
major OTA (Booking.com, Agoda, Expedia, Airbnb) gates real API access behind a
partner program requiring business approval, sometimes a formal application and
review period. **This is a business/legal step the human must complete before any
code in this phase starts** — flag it immediately if this phase is ever picked up
without confirmed partner API credentials in hand.

## Interface contract (sketch only — finalize against the actual partner API docs
once credentials exist; don't guess at a shape now)
- Extend `server/otaSync.ts`'s existing iCal sync job pattern to also push rate/
  availability changes outward on the same schedule/trigger.
- A new webhook-receiving route (raw Express, not tRPC — mirror
  `registerOAuthRoutes`'s pattern for non-JSON-RPC endpoints) for inbound booking
  push, converting the OTA's payload into a `createBookingWithGuests` call.

## Data model
Likely needs OTA-specific external-id columns on `bookings` (to reconcile future
webhook updates/cancellations against the same booking) — finalize once a specific
partner's payload shape is known.

## Business rules
- Once partner credentials exist, `service.ari_sync_reserved`/
  `service.booking_push_reserved` get granted to `api_service` (and only
  `api_service`) — do not grant these to any human role.

## Error handling
- **Idempotency is mandatory for the booking-push webhook.** OTA webhook delivery
  commonly retries; nothing in this codebase currently guards against duplicate
  webhook delivery creating duplicate bookings. Use the OTA's own booking reference
  as a dedup key before inserting.

## Acceptance criteria
- [ ] Confirmed partner API credentials exist for at least one OTA before any ticket
      in this phase is started
- [ ] ARI changes made in this platform propagate to the connected OTA within the
      documented sync window
- [ ] An inbound OTA booking creates a real `bookings` row, with a passing
      idempotency test proving a retried webhook doesn't double-create it
- [ ] `service.ari_sync_reserved`/`service.booking_push_reserved` are granted to
      `api_service` only, verified by a `shared/authorization.test.ts` matrix check

## Test plan
- `server/otaAri.test.ts` / `server/otaBookingPush.test.ts`: mock the partner API,
  cover success, idempotent-retry, and malformed-payload paths
- Extend `shared/authorization.test.ts` for the newly-granted reserved permissions

## Definition of Done
- [ ] `pnpm test`, `pnpm check`, `pnpm build` all pass
- [ ] No TODO/FIXME left in touched files
- [ ] Migration + `verify_*.sql` pair applied and confirmed by the human, if schema
      changed
- [ ] Spec status updated to DONE, `.agent/handoff.md` entry written
- [ ] Reviewer approved with evidence
