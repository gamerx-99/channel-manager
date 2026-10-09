# Channel Manager → SaaS — RONDMAP

Owner: เกมส์ · Updated: 2026-10-10 · Source of decisions: Z:\knowledge (DECISIONS + inbox candidates `cm-*`)
Positioning: hotel PMS + direct booking engine for Thai guesthouses (not an OTA). Data baseline: Sirvoy (`reference/`). Thai edge: TM.30, PromptPay + SlipOK, Thai UI.
Principle: the owner thinks as little as possible (working defaults, optional settings), while the system is careful about money, availability, guest data (PDPA), and review before release.
Authorization (2026-10-10): the owner authorized agents to work through this roadmap. Level-3 actions (production SQL, push, deploy, deleting data) still need the owner's explicit OK each time.

## P0 — Close open work
- [x] Public booking RLS/RPC, check-in/out, calendar fix, unassigned-room fix, hide messaging (pushed)
- [x] Occupancy pricing per guest count (not cumulative), child age groups, height rule (042de19, pushed)
- [ ] Owner: enable 3–4 guest levels + prices for Little Bro room types (levels above base are OFF after migration)
- [ ] Confirm verify_20261009_room_type_occupancy_pricing.sql is all PASS (rpc_grants)
- [ ] agy UI retest: book 2/3/4 guests + children, check-in/out, calendar

## P1 — Complete booking
- [ ] Store adults/children (and child ages) on the booking record (check-in, TM.30)
- [ ] Retire the legacy public booking endpoint
- [ ] Extra bed as an add-on in step ③ (services catalog)
- [ ] Cancellation & refund policy (owner-set), shown before payment
- [ ] Check-in/out times + one free-text house rules box, shown in step ⑤

## P2 — Usable by owners
- [ ] Public page: empty hero CTA, line across booking section, room photos, tiny/low-contrast Thai text, English leftovers, booking section too deep (sticky)
- [ ] Back office mobile layout
- [ ] SlipOK setup without forced MFA friction
- [ ] Owner access to Financials

## P3 — Owner understands the system
- [ ] Thai guide from the code: booking flow, data tables, where to look when it breaks

## 🎯 Start selling: after P0–P3, 3–5 known guesthouses on a free trial

## P4 — SaaS
- [ ] L1: landing page + self-signup (reuse the signup-link flow)
- [ ] L2: dashboard "get set up" checklist + trial period
- [ ] L3: account balance topped up via PromptPay + SlipOK. Pricing: up to 5 rooms ~฿290–390/mo + stepped per-room add-on. Prepay 3/6/12 months with a discount. Simple coupons (%/THB, uses, expiry)
- [ ] L4: platform admin + per-tenant export/delete (PDPA), Terms + DPA (lawyer review)
