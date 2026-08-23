# Mobile Responsive Audit — Channel Manager MVP

**Viewport tested:** 375 × 812 px (mobile)

| Route | Result | Mobile behavior verified |
|---|---|---|
| `/dashboard` | Pass | Header collapses to menu/search/action controls; KPI cards and content panels stack vertically without overlap. |
| `/hotels` | Pass | Search, filters, and property rows remain readable; secondary desktop-only columns are intentionally hidden to preserve scanability. |
| `/hotels/1` | Pass | Property hero reflows to two columns, actions span full width, and the detail tab strip can be scrolled horizontally. |
| `/hotels/1/bookings` | Pass with mobile hint | `Export TM.30` and `Add booking` remain side by side with accessible tap targets; the bookings table retains all columns through horizontal scrolling with an explicit swipe hint. |
| `/hotels/1/calendar` | Pass with mobile hint | Primary actions, weekly controls, legend, and availability values stay readable; the wide rate table scrolls horizontally and now includes an explicit swipe hint. |
| `/hotelname` | Pass | Public navigation collapses into a menu, content sections stack, room cards are single-column, and the booking form remains legible. |

## Fix applied during this audit

The bookings and availability tables were already configured for horizontal scrolling to avoid hiding operational columns. A short Thai swipe hint was added directly above each table for mobile widths so users understand that room, status, price, and later dates remain accessible by swiping sideways.

## Scope note

The audit verifies responsive layout, visual hierarchy, visible controls, and intended scrolling behavior. It does not replace an authenticated end-to-end test against production data or a real TM.30 file download workflow.
