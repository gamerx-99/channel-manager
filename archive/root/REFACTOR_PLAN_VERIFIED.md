# REFACTOR_PLAN_VERIFIED.md
> **เอกสารแผนการ Refactor ที่ผ่านการตรวจสอบกับ Source Code จริง 100%**  
> ตรวจสอบเมื่อ: 2026-09-01  
> เกณฑ์การตรวจสอบ: อ้างอิงโค้ดจริง มีหลักฐานบรรทัดต่อบรรทัด ไม่เพิ่มเทคโนโลยีใหม่ ไม่คาดเดา

---

## 1. สรุปผลการตรวจสอบ (Verification Summary)

| หัวข้อการตรวจสอบ | สถานะ | ข้อสรุปจากโค้ดจริง |
|---|---|---|
| **1. God Router (`server/routers.ts`)** | `VERIFIED` | 1,941 บรรทัด รวมทุก tRPC endpoints กว่า 10 domains ในไฟล์เดียว |
| **2. God DAL (`server/db.ts`)** | `VERIFIED` | 1,810 บรรทัด รวม Supabase queries ทั้งหมดของระบบในไฟล์เดียว |
| **3. Housekeeping Error Handling ซ้ำซ้อน** | `VERIFIED` | `db.ts` และ `routers.ts` จัดการ error 42P01 ซ้ำกัน และมีจุดที่ logic ขัดแย้งกัน |
| **4. Double Validation ของ Housekeeping** | `VERIFIED` | `routers.ts` ทำ validation ซ้ำกับ `assertHousekeepingAssigneeIsMember` ใน `db.ts` โดยใช้ `(client as any)` |
| **5. Inconsistent `rethrowDomainError`** | `VERIFIED` | 60+ จุดใน `routers.ts` มีทั้งแบบดัก `instanceof TRPCError` และแบบไม่ดัก (ทำให้ error ถูกแปลงเป็น 500 ผิดพลาด) |
| **6. Repeated Hotel Existence Guard** | `VERIFIED` | 16+ procedures ใน `routers.ts` เรียก `getManagedHotel` + null check ซ้ำรูปแบบเดิม |
| **7. Dead Code ใน `server/db.ts`** | `PARTIAL` | `getUserByOpenId` และ `upsertUser` เป็น no-op จริง แต่ `server/_core/sdk.ts` ยัง import อยู่ หากลบเฉพาะ `db.ts` จะ build ไม่ผ่าน |
| **8. Unsafe Type Casting `(client as any)`** | `VERIFIED` | พบ 11 จุดใน `routers.ts` และ 6 จุดใน `messaging.ts` |
| **9. Frontend Coupling ใน `client/src/App.tsx`** | `VERIFIED` | 518 บรรทัด รวม AppShell, Routing, PrivateRoute, และพบ `navigate` ใน `useState` (บรรทัด 498) |
| **10. `ComponentShowcase.tsx`** | `PARTIAL` | 1,438 บรรทัดใน `src/pages/` ไม่มีที่ใด import เลย แต่ Vite tree-shaking ไม่นำเข้า bundle จริง (เป็น dead file clutter) |
| **11. การแยก `index.css`** | `NOT VERIFIED` | ไม่ควรทำในรอบนี้ เสี่ยง CSS cascade/specificity พัง โดยไม่ได้แก้ปัญหาแกนกลางของระบบ |
| **12. การแตกหน้า Page ย่อย (`HotelStaff.tsx`)** | `PARTIAL` | 640 บรรทัด แยกได้เพื่อความอ่านง่าย แต่ไม่ใช่คอขวดระบบ ให้จัดเป็น Medium/Optional |

---

## 2. รายละเอียดผลการตรวจสอบรายข้อ (Detailed Verification)

### [VERIFIED] 1. God Router — `server/routers.ts` (1,941 บรรทัด, 88.7 KB)
- **หลักฐานในโค้ด:** รวมการทำงานของ `notifications`, `auth`, `channelManager` (ย่อยเป็น `dashboard`, `channels`, `financials`, `calendar`, `hotels`, `roomTypes`, `bookings`, `availability`, `rateOverrides`, `housekeeping`, `messaging`, `siteConfig`, `media`, `ota`), `slipok`, และ `payment` ไว้ใน Object เดียว
- **ผลกระทบ:** บำรุงรักษายาก เกิด merge conflict ง่าย การทดสอบ mock router ทำได้ยาก

### [VERIFIED] 2. God Database Access Layer — `server/db.ts` (1,810 บรรทัด, 63.8 KB)
- **หลักฐานในโค้ด:** มีฟังก์ชัน database operations รวมกันมากกว่า 40 ฟังก์ชัน ครอบคลุม 10+ โดเมนในไฟล์เดียว

### [VERIFIED] 3. Code Duplication & Inconsistency ใน Error Handling (Housekeeping / Missing Tables)
- **หลักฐานในโค้ด:**
  - `server/db.ts` (บรรทัด 892–898) มี `isMissingHousekeepingTableError()` และดัก error 42P01 ไว้แล้วใน `createHousekeepingTask` (บรรทัด 960, 976), `listHousekeepingTasks` (บรรทัด 1003), และ `updateHousekeepingTaskStatus` (บรรทัด 1070)
  - `server/routers.ts` กลับเขียนดัก 42P01 ซ้ำอีกใน `createHousekeepingTask` (บรรทัด 1205–1218), `listHousekeepingTasks` (บรรทัด 1227–1229), และ `updateHousekeepingTaskStatus` (บรรทัด 1317–1328)
  - **พบ Bug จากความซ้ำซ้อน:** ใน `updateHousekeepingTaskStatus` (routers.ts บรรทัด 1307–1314) เมื่อ `db.ts` ส่ง `null` กลับมาเนื่องจาก missing table ตัว router จะ throw `TRPCError(NOT_FOUND)` ที่บรรทัด 1310 ทำให้ catch block บรรทัด 1314 rethrow ทันที และ fallback บรรทัด 1318 จะไม่มีวันทำงาน

### [VERIFIED] 4. Double Validation ของ Housekeeping Assignee Membership
- **หลักฐานในโค้ด:**
  - `server/db.ts` บรรทัด 900–922 มีฟังก์ชัน `assertHousekeepingAssigneeIsMember()` และถูกเรียกใน `db.ts` แล้ว
  - แต่ `server/routers.ts` ทำ query ตรวจสอบซ้ำอีกรอบใน `createHousekeepingTask` (บรรทัด 1158–1178) และ `updateHousekeepingTaskStatus` (บรรทัด 1242–1284) โดยใช้ `(client as any)`

### [VERIFIED] 5. Inconsistent `rethrowDomainError`
- **หลักฐานในโค้ด:**
  - `routers.ts` บรรทัด 334–358: `rethrowDomainError` จะ wrap error ที่ไม่ตรงเงื่อนไขเป็น `INTERNAL_SERVER_ERROR`
  - มี catch block มากกว่า 60 จุดใน `routers.ts`:
    - บางจุดมี `if (error instanceof TRPCError) throw error; return rethrowDomainError(error);`
    - บางจุดเรียก `return rethrowDomainError(error);` ทันที ทำให้ `TRPCError` เดิม (เช่น 404/403) กลายเป็น 500

### [VERIFIED] 6. Repeated Hotel Existence Guard
- **หลักฐานในโค้ด:** 16+ procedures ใน `routers.ts` (เช่น บรรทัด 567, 585, 599, 642, 795, 898, 912, 930, 1085, 1111, 1153, 1237, 1483, 1516, 1554, 1578) เรียกซ้ำ:
  ```typescript
  const hotel = await getManagedHotel(client, input.hotel_id);
  if (!hotel) throw new TRPCError({ code: 'NOT_FOUND', message: 'This hotel is not available to your account.' });
  ```

### [PARTIAL] 7. Dead Code ใน `server/db.ts`
- **ข้อเท็จจริงจากโค้ด:**
  - `server/db.ts` บรรทัด 110–128 มี `LegacyTemplateUser`, `getUserByOpenId`, `upsertUser` ที่เป็น no-op
  - **แต่พบว่า:** `server/_core/sdk.ts` (บรรทัด 290, 296, 303, 314) ยังมีโค้ดเรียก `db.getUserByOpenId` และ `db.upsertUser` อยู่
  - **การปรับแผน:** หากต้องการลบฟังก์ชันเหล่านี้ ต้องแก้ `server/_core/sdk.ts` ควบคู่กัน หรือคง stub ไว้ชั่วคราวเพื่อไม่ให้ TypeScript error

### [VERIFIED] 8. Unsafe Type Casting `(client as any)`
- **หลักฐานในโค้ด:** พบ 11 จุดใน `server/routers.ts` (บรรทัด 1159, 1169, 1184, 1250, 1269, 1273, 1290, 1354, 1367, 1391, 1403) เกิดจากการ bypass db layer ไป query ตรง

### [VERIFIED] 9. Frontend Coupling ใน `client/src/App.tsx`
- **หลักฐานในโค้ด:**
  - `activePath` nested ternary 6 ชั้น (บรรทัด 97–107)
  - Breadcrumb inline ternary chain (บรรทัด 286)
  - `RedirectToDashboard` เรียก `navigate()` ใน `useState` callback (บรรทัด 498–500) ซึ่งผิด lifecycle ของ React

### [PARTIAL] 10. `client/src/pages/ComponentShowcase.tsx`
- **ข้อเท็จจริงจากโค้ด:** ไฟล์มีขนาด 1,438 บรรทัด (58.3 KB) อยู่ใน `client/src/pages/` โดยไม่มี route หรือ import ใดๆ ในระบบ แต่ไม่ได้ทำให้ production build บวมเนื่องจาก Vite tree-shaking
- **การปรับแผน:** ย้ายออกจาก `src/pages/` เพื่อไม่ให้สับสนกับการพัฒนา

### [NOT VERIFIED / ยกเลิก] 11. การแยก `client/src/index.css`
- **เหตุผลที่ตัดออก:** CSS ทำงานได้ปกติ การตัดแบ่งเสี่ยงต่อ specificity issue และ CSS load order ไม่ใช่งาน Refactor ที่จำเป็นต่อความเสถียรของระบบ

---

## 3. ขอบเขตงาน Refactor ที่จำเป็นจริง (Scoped Refactoring Plan)

```
┌──────────────────────────────────────────────────────────────────────────┐
│                             ขอบเขตงานที่คัดกรองแล้ว                        │
├───────────────────────────────┬──────────────────────────────────────────┤
│ Backend Refactor (แกนหลัก)    │ 1. แยก server/db.ts เป็นโมดูลย่อย        │
│                               │ 2. แยก server/routers.ts เป็น sub-routers│
│                               │ 3. รวม Error Handling & Helper ซ้ำซ้อน   │
├───────────────────────────────┼──────────────────────────────────────────┤
│ Frontend Refactor (โครงสร้าง) │ 4. แยก AppShell, PrivateRoute จาก App.tsx│
│                               │ 5. แก้ไข lifecycle bug ใน RedirectToDash │
└───────────────────────────────┴──────────────────────────────────────────┘
```

---

## 4. แผนการ Refactor ทีละขั้นตอน (Actionable Steps)

### 📌 Phase 1: รวม Helper และ Error Handling ที่ซ้ำซ้อนใน Server (ความเสี่ยงต่ำ)
1. **สร้าง Error & Guard Utilities ใน `server/routerUtils.ts`:**
   - รวม `rethrowDomainError` ให้ตรวจสอบ `if (error instanceof TRPCError) throw error;` เสมอในตัวฟังก์ชันเอง (แก้ปัญหา 500 error โดยอัตโนมัติ)
   - สร้าง helper `assertHotelExists(client, hotelId)` เพื่อลดโค้ดซ้ำ 16+ จุด
   - สร้าง generic `isMissingTableError(tableName, error)` ใน `server/dbUtils.ts`
2. **ทำความสะอาด Router Layer:**
   - ลบ duplicate membership validation ใน `routers.ts` (บรรทัด 1158–1178, 1242–1284) และให้เรียกผ่าน db layer เท่านั้น
   - ลบ duplicate 42P01 error catch ใน `routers.ts` (บรรทัด 1205–1218, 1317–1328)

---

### 📌 Phase 2: แยก Database Access Layer (`server/db/`) (ความเสี่ยงปานกลาง)
1. **สร้างโฟลเดอร์ `server/db/` และแยกไฟล์ตาม Domain:**
   - `types.ts` — Type definitions ทั้งหมด (HotelRecord, BookingRecord, ฯลฯ)
   - `utils.ts` — `throwOnError`, `isMissingTableError`
   - `hotel.ts` — Hotel & Room Type queries
   - `booking.ts` — Bookings, Guests, Services, Public Booking queries
   - `availability.ts` — Availability & Rate Overrides
   - `housekeeping.ts` — Housekeeping tasks & Assignee validation
   - `messaging.ts` — Message threads & Messages
   - `staff.ts` — Hotel Staff, User Assignments, Audit Logs
   - `payment.ts` — SlipOK settings & Payment sessions
   - `siteConfig.ts` — Hotel site config & Media
   - `notification.ts` — System & Hotel notifications
2. **สร้าง Barrel File `server/db.ts`:**
   - `export * from './db/types';`
   - `export * from './db/hotel';` ... (เพื่อรักษา Backward Compatibility กับ tests ทั้งหมด)

---

### 📌 Phase 3: แยก tRPC Routers (`server/routers/`) (ความเสี่ยงปานกลาง)
1. **สร้าง Sub-routers ใน `server/routers/`:**
   - `authRouter.ts` (auth endpoints)
   - `notificationsRouter.ts` (notifications endpoints)
   - `hotelRouter.ts` (hotels, roomTypes, siteConfig, media)
   - `bookingRouter.ts` (bookings, TM.30, public bookings)
   - `availabilityRouter.ts` (availability, rateOverrides)
   - `staffRouter.ts` (hotelStaff, adminUsers, signupLinks, auditLogs)
   - `housekeepingRouter.ts` (housekeeping tasks)
   - `messagingRouter.ts` (threads, messages)
   - `otaRouter.ts` (OTA connections, sync logs)
   - `slipokRouter.ts` (SlipOK settings)
   - `paymentRouter.ts` (Payment sessions, slip verification)
   - `dashboardRouter.ts` (dashboard, channels, financials, calendar)
2. **ประกอบ Router หลักใน `server/routers.ts` (หรือ `server/routers/index.ts`):**
   - รวม sub-routers ทั้งหมดเข้า `appRouter`
   - Export `type AppRouter = typeof appRouter;` คงเดิม

---

### 📌 Phase 4: ปรับโครงสร้าง `client/src/App.tsx` (ความเสี่ยงต่ำ)
1. **แยก Components ออกจาก `App.tsx`:**
   - `client/src/components/layout/AppShell.tsx` (Sidebar + Topbar + Navigation layout)
   - `client/src/components/auth/PrivateRoute.tsx` (Authentication & MFA gate)
2. **แก้ไข Code Issues ใน `App.tsx`:**
   - แก้ไข `RedirectToDashboard`: เปลี่ยนจาก `useState` เป็น `useEffect`
   - แปลง nested ternary ของ `activePath` และ `breadcrumbs` ให้เป็น helper function ที่อ่านง่าย
3. **จัดการ Unused File:**
   - ย้าย `ComponentShowcase.tsx` ไปไว้ใน `client/src/_dev/` หรือลบออกหากไม่ใช้งาน

---

## 5. การควบคุมความเสี่ยงและการตรวจสอบ (Risk Control & Verification)

### กฎความปลอดภัย
1. **ไม่เปลี่ยน Contract ของ API:** ชื่อ endpoint, input schema, output type ของ tRPC ต้องเหมือนเดิม 100%
2. **รักษา Barrel Exports:** การแยก `db.ts` และ `routers.ts` ต้องมี barrel export เพื่อไม่ให้ unit tests เดิมพัง
3. **ตรวจสอบ Types & Tests ทุกขั้นตอน:**
   ```bash
   pnpm check   # TypeScript compile check ต้องผ่าน (0 error)
   pnpm test    # Vitest ทั้งหมดต้อง PASS 100%
   ```

---
*เอกสารนี้พร้อมใช้เป็นแนวทางปฏิบัติจริงสำหรับการ Refactor*
