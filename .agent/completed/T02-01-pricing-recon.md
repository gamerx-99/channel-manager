# T02-01 — Recon + Pricing resolver pure function
Status: TODO
Spec: specs/02-advanced-pricing.md
Owner-tier: worker-code
Goal: Recon DB schema (room_types) + สร้าง server/pricing.ts pure resolver + ตัดสินใจ overlapping rule
Acceptance:
- [ ] server/pricing.ts: resolveEffectiveRate(roomType,date,overrides) pure, testable
- [ ] Overlapping rule: reject on create (prefer per spec)
- [ ] Unit tests server/pricing.test.ts
