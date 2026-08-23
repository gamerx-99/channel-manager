# Role Separation and OTA Calendar-Only Contract

This document outlines the architectural boundaries for **Super Admin** versus **Hotel Admin/Owner** and specifies the reduced scope for **OTA Calendar Synchronization**.

## 1. Role-Permission Matrix

| Role | Scope | Allowed Actions | Restricted Actions |
|---|---|---|---|
| **Super Admin** (`super_admin`) | Global (All Hotels) | • View platform-wide dashboard overview<br>• List, create, and configure all hotels<br>• Manage users, invite members, assign hotel roles<br>• View global OTA summary across all properties | • Modifying hotel-specific operational bookings directly without membership (by design, mediated via RLS & role checks) |
| **Hotel Owner / Admin** (`hotel_owner`) | Single Hotel (`hotel_id`) | • View dashboard for assigned hotel(s)<br>• Manage room types, rooms, rates, and availability<br>• Manage manual bookings, guests, and TM.30 export<br>• Manage OTA calendar sync (iCal links / availability sync) | • Accessing platform-wide admin user management<br>• Creating new platform hotels<br>• Viewing other hotels' data |

---

## 2. Reduced OTA Scope: Calendar Synchronization Only

To keep the system lightweight, reliable, and focused on property operations without complex full-OTA API bidding engines:
- **Removed:** Full multi-endpoint OTA booking push/pull REST APIs and mock payload pipelines.
- **Retained (Calendar-Only):**
  - **iCal / Calendar Feed Synchronization:** Export hotel calendar `.ics` feed URL and import OTA iCal links (Agoda, Booking.com, Airbnb, Expedia) to sync blocked dates and prevent double bookings.
  - **Availability Push:** Simple availability count sync for connected calendar streams.
  - **Sync Logs & Status Widget:** Clean calendar sync status and log history per hotel property.
