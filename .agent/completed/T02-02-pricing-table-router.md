# T02-02 — rate_overrides table + tRPC router
Status: TODO
Spec: specs/02-advanced-pricing.md
Owner-tier: worker-code
Goal: Migration rate_overrides + CRUD router (create/list/delete) gated on revenue.manage_pricing_rules
Acceptance:
- [ ] YYYYMMDD_add_rate_overrides.sql + verify_*.sql pair
- [ ] server/routers.ts: createRateOverride/listRateOverrides/deleteRateOverride
- [ ] Overlapping → CONFLICT via rethrowDomainError
- [ ] server/rateOverrides.access.test.ts (mocked-router)
