# T02-03 — Enforce min_stay_nights on booking creation
Status: TODO
Spec: specs/02-advanced-pricing.md
Owner-tier: worker-code
Goal: booking creation ต้องเช็ค min_stay_nights จาก overrides
Acceptance:
- [ ] createBookingWithGuests เช็ค min_stay_nights → BAD_REQUEST พร้อมข้อความ
- [ ] Test booking violates min stay
