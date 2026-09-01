# REFACTOR_PLAN_FINAL.md

> **เอกสารแผนการ Refactor ฉบับปรับปรุงหลังตรวจสอบ Source Code จริง**
>
> สร้างเมื่อ: 2026-09-01  
> หลักการ: **Evidence-based / No Guess / No New Technology / Preserve API Contract**
>
> **กฎสำคัญ:** Refactor ทีละ Concern → ตรวจสอบ → Commit → ไปขั้นถัดไป

---

## 1. Executive Summary

โปรเจกต์มี Architecture หลักที่ถูกต้อง ได้แก่:

- tRPC
- Supabase
- RLS
- Shared Authentication

แต่ Source Code มีการสะสม logic ในไฟล์กลางขนาดใหญ่ ทำให้เกิด:

1. **God Router** — `server/routers.ts`
2. **God Database Access Layer** — `server/db.ts`
3. **Business Logic ซ้ำระหว่าง Router และ DB Layer**
4. **Error Handling ไม่สม่ำเสมอ**
5. **Housekeeping fallback logic ที่มี unreachable path**
6. **Unsafe `(client as any)`**
7. **Frontend App.tsx รวมหลาย concern**
8. Dev-only dead file clutter

การ Refactor รอบนี้จะเน้นเฉพาะสิ่งที่ **ตรวจสอบจาก Source Code แล้วว่ามีจริง**

---

# 2. Verified Findings

| # | Finding | Status | Priority |
|---|---|---|---|
| 1 | `server/routers.ts` เป็น God Router | VERIFIED | 🔴 Critical |
| 2 | `server/db.ts` เป็น God DAL | VERIFIED | 🔴 Critical |
| 3 | Housekeeping error handling ซ้ำ | VERIFIED | 🔴 Critical |
| 4 | Housekeeping membership validation ซ้ำ | VERIFIED | 🔴 Critical |
| 5 | `rethrowDomainError` ใช้ไม่สม่ำเสมอ | VERIFIED | 🔴 Critical |
| 6 | Hotel existence guard ซ้ำ 16+ จุด | VERIFIED | 🟠 High |
| 7 | Legacy SDK functions เป็น dead/no-op แต่ยังมี SDK dependency | PARTIAL | 🟠 High |
| 8 | `(client as any)` หลายจุด | VERIFIED | 🟠 High |
| 9 | `App.tsx` รวมหลาย concern | VERIFIED | 🟡 Medium |
| 10 | `RedirectToDashboard` ใช้ `useState` ทำ side effect | VERIFIED | 🟠 High |
| 11 | `ComponentShowcase.tsx` ไม่มี import | VERIFIED | 🟢 Low |
| 12 | CSS split | NOT REQUIRED | ❌ Out of Scope |

---

# 3. Architecture Ownership Rules

ก่อน Refactor ต้องกำหนดความรับผิดชอบของแต่ละ Layer ให้ชัดเจน

## Router Layer

รับผิดชอบ:

```text
Authentication
Authorization
Input Validation
API Contract
TRPC Error Response
```

ไม่ควร:

```text
Query Supabase ซ้ำโดยไม่จำเป็น
ทำ Database Compatibility Logic
ทำ Membership Validation ซ้ำกับ DB Layer
```

---

## Database Layer

รับผิดชอบ:

```text
Supabase Queries
Database Error Handling
Domain Validation
Missing Table Compatibility
Database-level Business Rules
```

---

## Shared Utilities

รับผิดชอบ:

```text
TRPC Error Mapping
Shared Guards
Date Helpers
Shared Type Utilities
```

---

# 4. Critical Bug: Housekeeping Fallback

พบว่า flow ปัจจุบันมี logic ที่อาจไปไม่ถึง fallback

```text
Database Layer
      │
      ▼
Missing Table
      │
      ▼
Return null
      │
      ▼
Router checks result
      │
      ▼
Throw NOT_FOUND
      │
      ▼
catch receives TRPCError
      │
      ▼
TRPCError rethrown
      │
      ▼
42P01 fallback below is unreachable
```

## กฎหลัง Refactor

```text
DB Layer
│
├── ตรวจสอบ Missing Table
├── จัดการ Compatibility
└── Return Domain Result ที่ชัดเจน

Router Layer
│
├── Authorization
├── Call DB Function
└── Return API Response
```

Router ต้องไม่ implement `42P01` handling ซ้ำกับ DB Layer

---

# 5. Phase 0 — Baseline Verification

> **ห้ามแก้ Source Code ก่อนผ่าน Phase นี้**

รัน:

```bash
git status
pnpm check
pnpm test
pnpm build
```

บันทึกผล:

```text
BASELINE REPORT

Git Status:
- Clean / Modified files: ...

TypeScript:
- PASS / FAIL
- Error count: ...

Tests:
- Passed: ...
- Failed: ...
- Existing failures: ...

Build:
- PASS / FAIL
```

## กฎสำคัญ

หากมี Test พังอยู่ก่อน Refactor:

```text
Existing Failure ≠ Refactor Regression
```

ต้องบันทึกไว้ก่อนเริ่มงาน

### Commit

ไม่มีการ Commit ใน Phase นี้ เว้นแต่เพิ่ม Baseline Report เข้า repository ตามกฎโปรเจกต์

---

# 6. Phase 1 — Server Cleanup

> แบ่งเป็นหลาย Commit เพื่อให้ Debug และ Rollback ง่าย

---

## Phase 1A — Centralize `rethrowDomainError`

### ปัญหา

ปัจจุบันมี catch blocks มากกว่า 60 จุด

บางจุด:

```ts
catch (error) {
  if (error instanceof TRPCError) throw error;
  return rethrowDomainError(error);
}
```

บางจุด:

```ts
catch (error) {
  return rethrowDomainError(error);
}
```

ทำให้ `TRPCError` บางกรณีถูกเปลี่ยนเป็น:

```text
INTERNAL_SERVER_ERROR
```

ทั้งที่ควรเป็น:

```text
NOT_FOUND
FORBIDDEN
UNAUTHORIZED
BAD_REQUEST
```

---

## เป้าหมาย

ให้ `rethrowDomainError()` รับผิดชอบเรื่องนี้เอง

ตัวอย่างโครงสร้าง:

```ts
export function rethrowDomainError(error: unknown): never {
  if (error instanceof TRPCError) {
    throw error;
  }

  // Existing domain error mapping here

  throw new TRPCError({
    code: "INTERNAL_SERVER_ERROR",
    message: "Internal server error",
  });
}
```

หลังจากนั้น:

```ts
catch (error) {
  rethrowDomainError(error);
}
```

### Verification

```bash
pnpm check
pnpm test
```

### Commit

```text
fix(router): centralize TRPC domain error handling
```

---

# 7. Phase 1B — Centralize Hotel Guard

### ปัญหา

Pattern นี้ซ้ำมากกว่า 16 จุด:

```ts
const hotel = await getManagedHotel(client, input.hotel_id);

if (!hotel) {
  throw new TRPCError({
    code: "NOT_FOUND",
    message: "This hotel is not available to your account.",
  });
}
```

---

## สร้าง Helper

```ts
export async function assertHotelExists(
  client: SupabaseClient,
  hotelId: string
) {
  const hotel = await getManagedHotel(client, hotelId);

  if (!hotel) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "This hotel is not available to your account.",
    });
  }

  return hotel;
}
```

Router:

```ts
const hotel = await assertHotelExists(
  client,
  input.hotel_id
);
```

### Verification

```bash
pnpm check
pnpm test
```

### Commit

```text
refactor(router): centralize hotel existence guard
```

---

# 8. Phase 1C — Remove Duplicate Housekeeping Validation

### ปัญหา

ปัจจุบัน Membership Validation มีหลาย path:

```text
Router
├── createHousekeepingTask validation
├── updateHousekeepingTaskStatus validation
│
DB
└── assertHousekeepingAssigneeIsMember
```

เกิด:

- Code Duplication
- `(client as any)`
- Risk ที่ validation ไม่เหมือนกัน

---

## เป้าหมาย

ให้ DB Layer เป็น Source of Truth:

```text
Router
   │
   ▼
createHousekeepingTask()
   │
   ▼
DB Layer
   │
   ├── Validate Room
   ├── Validate Hotel
   └── Validate Assignee Membership
```

Router ไม่ควร query:

```ts
(client as any)
  .from("housekeeping_tasks")
```

โดยตรงอีก

### Verification

```bash
pnpm check
pnpm test
```

### Commit

```text
refactor(housekeeping): remove duplicate router validation
```

---

# 9. Phase 1D — Centralize Missing Table Detection

สร้าง:

```text
server/dbUtils.ts
```

หรือหากเริ่ม DB Split แล้ว:

```text
server/db/utils.ts
```

---

## Generic Helper

```ts
function escapeRegExp(value: string) {
  return value.replace(
    /[.*+?^${}()|[\]\\]/g,
    "\\$&"
  );
}

export function isMissingTableError(
  tableName: string,
  error: unknown
): boolean {

  if (!error || typeof error !== "object") {
    return false;
  }

  const code =
    (error as { code?: string }).code;

  if (code === "42P01") {
    return true;
  }

  const message =
    (error as { message?: string }).message ?? "";

  return new RegExp(
    `${escapeRegExp(tableName)}.*does not exist`,
    "i"
  ).test(message);
}
```

---

## Replace

```text
isMissingHousekeepingTableError
isMissingMessagingTableError
isMissingHotelSiteConfigTableError
```

ด้วย:

```ts
isMissingTableError(
  "housekeeping_tasks",
  error
);
```

### Verification

```bash
pnpm check
pnpm test
```

### Commit

```text
refactor(db): centralize missing table detection
```

---

# 10. Phase 2 — Split Database Access Layer

> **ย้ายทีละ Domain ห้ามย้ายทั้งหมดในครั้งเดียว**

โครงสร้าง:

```text
server/
│
├── db.ts
│
└── db/
    ├── types.ts
    ├── utils.ts
    │
    ├── hotel.ts
    ├── booking.ts
    ├── availability.ts
    ├── housekeeping.ts
    ├── messaging.ts
    ├── staff.ts
    ├── payment.ts
    ├── siteConfig.ts
    └── notification.ts
```

---

## Phase 2A — Create Foundation

สร้าง:

```text
server/db/types.ts
server/db/utils.ts
```

ย้าย:

```text
Types
Interfaces
throwOnError
isMissingTableError
```

### Verification

```bash
pnpm check
pnpm test
```

### Commit

```text
refactor(db): create modular db foundation
```

---

## Phase 2B เป็นต้นไป

ย้ายทีละ Domain

ลำดับแนะนำ:

```text
2B — Housekeeping
2C — Messaging
2D — Hotel
2E — Availability
2F — Booking
2G — Staff
2H — Payment
2I — SiteConfig
2J — Notifications
```

ทุก Domain:

```text
Move
↓
pnpm check
↓
pnpm test
↓
Commit
```

---

# 11. Backward Compatibility Barrel

`server/db.ts` ต้องยังอยู่

ตัวอย่าง:

```ts
export * from "./db/types";
export * from "./db/hotel";
export * from "./db/booking";
export * from "./db/availability";
export * from "./db/housekeeping";
export * from "./db/messaging";
export * from "./db/staff";
export * from "./db/payment";
export * from "./db/siteConfig";
export * from "./db/notification";
```

## กฎ

ห้ามเปลี่ยน Import ของทั้งโปรเจกต์พร้อมกัน

โค้ดเดิมยังสามารถ:

```ts
import {
  getManagedHotel,
  listBookingsForHotel
} from "./db";
```

ได้เหมือนเดิม

---

# 12. Legacy SDK Functions

## สถานะ

`getUserByOpenId()` และ `upsertUser()`:

- เป็น no-op
- ดูเหมือน Legacy
- แต่ยังถูกเรียกโดย `server/_core/sdk.ts`

ดังนั้น:

# ❌ ห้ามลบทันที

ต้องทำ:

```text
Step 1
ตรวจสอบ SDK dependency

Step 2
Refactor SDK ให้ไม่ต้องใช้ Legacy DB API

Step 3
pnpm check

Step 4
pnpm test

Step 5
ลบ Legacy Functions
```

จนกว่าจะทำครบ:

```text
Legacy Functions = Keep Temporary Compatibility Stub
```

---

# 13. Phase 3 — Split tRPC Routers

> **Router เป็นส่วนเสี่ยงสูงที่สุด**
>
> ย้ายทีละ Router เท่านั้น

โครงสร้าง:

```text
server/
│
├── routers.ts
│
├── routerUtils.ts
│
├── schemas/
│   ├── hotel.ts
│   ├── booking.ts
│   ├── staff.ts
│   ├── housekeeping.ts
│   ├── messaging.ts
│   └── payment.ts
│
└── routers/
    ├── authRouter.ts
    ├── notificationsRouter.ts
    ├── hotelRouter.ts
    ├── bookingRouter.ts
    ├── availabilityRouter.ts
    ├── staffRouter.ts
    ├── housekeepingRouter.ts
    ├── messagingRouter.ts
    ├── otaRouter.ts
    ├── slipokRouter.ts
    ├── paymentRouter.ts
    └── dashboardRouter.ts
```

---

# 14. Phase 3A — Extract Shared Router Utilities

สร้าง:

```text
server/routerUtils.ts
```

ย้ายเฉพาะ:

```text
rethrowDomainError
requirePermission
requireHotelPermission
requireSuperAdmin
assertSingleHotelAdmin
date helpers
identity helpers
```

### Verification

```bash
pnpm check
pnpm test
```

### Commit

```text
refactor(router): extract shared utilities
```

---

# 15. Phase 3B+ — Extract Routers One by One

แนะนำลำดับ:

```text
3B — housekeepingRouter
3C — messagingRouter
3D — hotelRouter
3E — availabilityRouter
3F — bookingRouter
3G — staffRouter
3H — paymentRouter
3I — slipokRouter
3J — otaRouter
3K — dashboardRouter
3L — notificationsRouter
3M — authRouter
```

ทุก Router:

```text
Extract
↓
pnpm check
↓
pnpm test
↓
Verify API Contract
↓
Commit
```

---

# 16. Router Contract Rules

ห้ามเปลี่ยน:

```text
Procedure Name
Input Schema
Output Shape
Error Code
Authorization Behavior
Public/Protected Status
```

ตัวอย่าง:

ก่อน:

```text
channelManager.bookings.list
```

หลัง:

```text
channelManager.bookings.list
```

แม้ Source File จะเปลี่ยน

---

# 17. Main Router Composition

สุดท้าย:

```ts
export const appRouter =
  router({
    auth: authRouter,

    notifications:
      notificationsRouter,

    channelManager:
      channelManagerRouter,

    slipok: slipokRouter,

    payment: paymentRouter,
  });

export type AppRouter =
  typeof appRouter;
```

## กฎ

Client ต้องไม่รู้ว่า Backend แตก Router แล้ว

Client เห็น API เดิม 100%

---

# 18. Phase 4 — Frontend App Structure

แยก:

```text
client/src/
│
├── App.tsx
│
└── components/
    ├── auth/
    │   └── PrivateRoute.tsx
    │
    └── layout/
        ├── AppShell.tsx
        ├── Sidebar.tsx
        └── Topbar.tsx
```

---

## `App.tsx` หลัง Refactor

เป้าหมาย:

```text
App Providers
↓
Router
↓
Routes
```

ไม่ควรมี:

```text
Sidebar Logic
Topbar Logic
Auth Logic
Breadcrumb Logic
Large Navigation Logic
```

---

# 19. Fix `RedirectToDashboard`

ปัจจุบัน:

```ts
useState(() => {
  navigate(...);
});
```

แก้:

```ts
useEffect(() => {
  navigate(...);
}, [navigate]);
```

### Verification

```bash
pnpm check
pnpm test
pnpm build
```

และต้อง:

```text
Manual Browser Test
```

ตรวจ:

```text
Login
Logout
Redirect
MFA
Hotel Switching
Protected Route
```

---

# 20. Simplify Active Path

เปลี่ยน:

```text
Nested Ternary
```

เป็น:

```ts
function getActivePath(
  location: string,
  hotelId?: string
) {
  // Explicit route matching
}
```

หรือ:

```ts
const routeMap = [
  ...
];
```

หลักการ:

```text
Readable > Clever
```

---

# 21. Breadcrumb Lookup

เปลี่ยน:

```text
Long Inline Ternary
```

เป็น:

```ts
const breadcrumbLabels = {
  dashboard: "...",
  bookings: "...",
  availability: "...",
};
```

---

# 22. ComponentShowcase

สถานะ:

```text
No Route
No Import
Not Production Bundle Problem
```

ดังนั้นไม่ใช่ Performance Priority

ทำเพียง:

```text
Move to:

client/src/_dev/
```

หรือ:

```text
Delete
```

เฉพาะเมื่อยืนยันว่าไม่ใช้งานแล้ว

---

# 23. Explicitly Out of Scope

รอบนี้ **ไม่ทำ**:

```text
❌ Split index.css
❌ Rewrite UI
❌ Change Database Schema
❌ Change Supabase
❌ Add New Framework
❌ Change tRPC API Contract
❌ Rewrite HotelStaff.tsx
❌ Performance Optimization ที่ไม่มีหลักฐาน
```

---

# 24. Final Execution Order

```text
PHASE 0
Baseline
│
▼
PHASE 1A
rethrowDomainError
│
▼
CHECK + TEST
│
▼
COMMIT
│
▼
PHASE 1B
Hotel Guard
│
▼
CHECK + TEST
│
▼
COMMIT
│
▼
PHASE 1C
Remove Duplicate Housekeeping Validation
│
▼
CHECK + TEST
│
▼
COMMIT
│
▼
PHASE 1D
Generic Missing Table Helper
│
▼
CHECK + TEST
│
▼
COMMIT
│
▼
PHASE 2A
DB Foundation
│
▼
CHECK + TEST
│
▼
PHASE 2B–2J
Move DB Domains One-by-One
│
▼
CHECK + TEST EVERY DOMAIN
│
▼
COMMIT EVERY DOMAIN
│
▼
PHASE 3A
Router Utilities + Schemas
│
▼
CHECK + TEST
│
▼
PHASE 3B–3M
Extract One Router at a Time
│
▼
CHECK + TEST EVERY ROUTER
│
▼
COMMIT EVERY ROUTER
│
▼
PHASE 4
AppShell + PrivateRoute
│
▼
CHECK + TEST + BUILD + MANUAL TEST
│
▼
PHASE 5
ComponentShowcase Cleanup
```

---

# 25. Definition of Done

Ticket จะถือว่า DONE ได้ก็ต่อเมื่อ:

```text
[ ] Scope ทำครบ
[ ] No API Contract Change
[ ] pnpm check = PASS
[ ] pnpm test = PASS
[ ] pnpm build = PASS (ถ้าแตะ build path)
[ ] Existing failures documented
[ ] Git diff reviewed
[ ] Commit created
```

---

# 26. Commit Rules

ใช้:

```text
One Concern
=
One Verification
=
One Commit
```

ตัวอย่าง:

```text
fix(router): centralize TRPC domain error handling

refactor(router): centralize hotel existence guard

refactor(housekeeping): remove duplicate router validation

refactor(db): centralize missing table detection

refactor(db): extract housekeeping data access

refactor(router): extract housekeeping router

refactor(app): extract application shell
```

---

# Final Decision

> **แผนนี้เป็นแผน Refactor แบบ Incremental และ Conservative**
>
> ไม่ Rewrite ระบบ  
> ไม่เพิ่ม Technology  
> ไม่เปลี่ยน API Contract  
> ไม่ย้ายทุกอย่างพร้อมกัน  
>
> ทุกขั้นตอนต้อง:
>
> **Change → Check → Test → Review → Commit**

## จุดเริ่มต้นที่ควร Execute จริง

```text
Phase 0
↓
Phase 1A
↓
STOP
↓
ตรวจ pnpm check + pnpm test
```
