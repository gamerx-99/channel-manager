# 15 Booking management (front desk) — DRAFT, owner decisions 2026-10-28

Status: DRAFT. Not yet in specs/. Platform choice (Cloudflare after 13-04 vs Supabase now) is still open.

## UI
On the Bookings page, clicking a booking opens a booking panel with three tabs.

- **Guest info:** view the guest data. Edit is gated by `operations.manage_guests`.
- **Add-on services:** add a service from the hotel's services catalog (or a custom one) and record the payment. Gated by `operations.manage_bookings`.
- **Status change:** cancel the booking (gated by `operations.cancel_bookings`) and see the history. Check-in and check-out may move here too.

Tabs or actions the user lacks permission for are hidden, not disabled.

## Rules
1. **Guest edit**
   - Editable fields: name, phone, email, and the TM.30 fields (passport_no, nationality_code, birth_date).
   - A note is required (non-empty).
   - Every edit writes an audit row: who, when, field, old value, new value, note.
2. **Add-on at check-in**
   - Stored in `booking_services`.
   - Payment is recorded manually only. Method is cash or transfer; also store amount, received_at, received_by and an optional note.
   - No PromptPay QR or SlipOK for add-ons.
   - The booking total and the financials must include add-ons.
3. **Cancel**
   - A note is required.
   - Status becomes `cancelled`, and the room or allotment is released immediately, so the calendar shows it as free (a test must prove it).
   - If the booking was paid, record a refund (amount, method, refunded_at, note). The amount may be 0 when the policy gives no refund. This is kept for tax records and must never be deleted.
   - OTA-sourced bookings may be cancelled too, but a confirm pop-up must say to cancel it on the OTA as well.
   - The iCal sync must NOT revert a manually cancelled booking back to active while the event is still in the OTA feed. Verify the current sync behaviour and add a test.
4. Every change is append-only history (audit) and is visible in the Status tab.

5. **Marketing consent (PDPA):**
   - The public booking form gets an opt-in checkbox "รับข่าวสารและโปรโมชันจากโรงแรม / Receive news and offers from the hotel".
   - It is unchecked by default.
   - Store `marketing_consent` (boolean) and `marketing_consent_at` on the guest/booking.
   - It must not block the booking.

## Split
- **Server and data (Codex):**
  - Migration or D1 schema for the guest-edit audit, add-on payments, refunds and the cancellation note.
  - Procedures `updateGuest`, `addBookingService`, `recordAddonPayment`, `cancelBooking`.
  - Each procedure does `requireHotelPermission` first. Tests for each, plus the calendar-release test and the iCal no-revert test.
- **UI (Beam):** booking panel with the 3 tabs, the OTA pop-up, a contract test, and no direct supabase calls.
