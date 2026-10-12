# REFACTOR_PLAN.md
> วิเคราะห์จากโค้ดจริง — ห้ามแก้ไข Source Code ในรอบนี้
> สร้างเมื่อ: 2026-09-01

---

## 1. ภาพรวมปัญหา (Problem Overview)

โปรเจกต์นี้มี Architecture ที่ถูกต้องในหลักการ (tRPC + Supabase + RLS + shared auth) แต่ **โค้ดสะสมโดยไม่มีการแตกโมดูล** ทำให้เกิด God Files ที่ใหญ่มาก รวมถึงมี Code Duplication ที่ตรวจพบจากโค้ดจริงหลายจุด ซึ่งสร้างความเสี่ยงทั้งด้าน Correctness (logic ที่ซ้ำกันอาจไม่ตรงกัน) และ Maintainability

### สรุปตัวเลขจากโค้ดจริง

| ไฟล์ | บรรทัด | ขนาด | ปัญหาหลัก |
|---|---|---|---|
| `server/routers.ts` | 1,941 | 88.7 KB | God Router — ทุก endpoint อยู่ในไฟล์เดียว |
| `server/db.ts` | 1,810 | 63.8 KB | God DAL — ทุก domain อยู่ในไฟล์เดียว + Dead Code |
| `client/src/index.css` | ~3,500+ | 89.5 KB | Monolithic CSS |
| `client/src/pages/HotelStaff.tsx` | 640 | 34.4 KB | Page ที่มีหลาย sub-panel ในไฟล์เดียว |
| `client/src/pages/WebsiteBuilder.tsx` | ~1,000+ | 29.4 KB | Page ขนาดใหญ่ |
| `client/src/components/ComponentShowcase.tsx` | ~2,000+ | 58.3 KB | Dev-only file ที่ขนาดใหญ่มาก |
| `client/src/App.tsx` | 518 | 22.5 KB | Layout + Routing + Auth Guard รวมกัน |

---

## 2. รายการปัญหาที่พบจากโค้ดจริง

### 2.1 Code Duplication ที่อันตราย — `server/routers.ts` vs `server/db.ts`

**ปัญหา:** Housekeeping missing-table error handling ถูกเขียนซ้ำกัน **ทั้งใน db layer และ router layer** โดยที่ logic ไม่ตรงกันทั้งหมด

`server/db.ts` มี helper `isMissingHousekeepingTableError()` (บรรทัด 892–898) และจัดการ error ใน `createHousekeepingTask`, `updateHousekeepingTaskStatus`, `updateHousekeepingTask` เรียบร้อยแล้ว

แต่ `server/routers.ts` กลับจัดการ error เดียวกันซ้ำอีกครั้งในทุก procedure:
```typescript
// routers.ts บรรทัด 1203–1218 (createHousekeepingTask handler)
const code = (error as { code?: string })?.code;
const msg = error instanceof Error ? error.message : '';
if (code === '42P01' || /housekeeping_tasks.*does not exist/i.test(msg)) {
  return { id: '00000000-...', ... } // synthetic record
}

// routers.ts บรรทัด 1227–1229 (listHousekeepingTasks handler)
if (code === '42P01' || /housekeeping_tasks.*does not exist/i.test(msg)) return [];

// routers.ts บรรทัด 1313–1328 (updateHousekeepingTaskStatus handler)
if (code === '42P01' || /housekeeping_tasks.*does not exist/i.test(msg)) {
  return { id: input.task_id, room_id: '', ... } // synthetic record — room_id เป็น '' (ผิดพลาด)
}
```

เช่นเดียวกันกับ `isMissingMessagingTableError` และ `isMissingHotelSiteConfigTableError` ซึ่งทั้งสามตัวใช้ pattern เดียวกันซ้ำ 3 ครั้ง:
```typescript
// db.ts บรรทัด 892, 1164, 1329 — pattern เหมือนกัน 100%
function isMissingXxxTableError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const code = (error as { code?: string }).code;
  if (code === '42P01') return true;
  const message = (error as { message?: string }).message ?? '';
  return /xxx.*does not exist/i.test(message);
}
```

### 2.2 Double Validation — Housekeeping Assignee Membership

`server/db.ts` มีฟังก์ชัน `assertHousekeepingAssigneeIsMember()` (บรรทัด 900–922) ที่ validate assignee membership แล้ว  
แต่ `server/routers.ts` **re-implements** การ validate เดียวกัน inline อีกครั้งใน `updateHousekeepingTaskStatus` procedure (บรรทัด 1242–1284) โดยใช้ `(client as any)`:
```typescript
// routers.ts บรรทัด 1250–1283 — ซ้ำกับ db.ts assertHousekeepingAssigneeIsMember
const { data: existingTask } = await (client as any)
  .from('housekeeping_tasks').select('room_id')...
const { data: room } = await (client as any)
  .from('rooms').select('hotel_id')...
const { data: membership } = await (client as any)
  .from('hotel_users').select('id')...
```
ซึ่งยิ่งกว่านั้น `createHousekeepingTask` ใน `routers.ts` (บรรทัด 1158–1178) ก็ทำซ้ำอีกครั้งเช่นกัน ทำให้ validation path เดียวกันมีอยู่ 3 ที่

### 2.3 Repeated Pattern — `rethrowDomainError` และ `TRPCError` Guard

Pattern ต่อไปนี้ปรากฏ **มากกว่า 20 ครั้ง** ใน `routers.ts`:
```typescript
} catch (error) {
  if (error instanceof TRPCError) throw error;
  return rethrowDomainError(error);
}
```
และบาง procedure ใช้แค่:
```typescript
} catch (error) {
  return rethrowDomainError(error);
}
```
ทั้งสองรูปแบบปนกันอยู่ทั่วไปอย่างไม่สม่ำเสมอ

### 2.4 Repeated Pattern — Hotel Not Found Guard

Pattern ต่อไปนี้ปรากฏ **มากกว่า 10 ครั้ง** ใน `routers.ts`:
```typescript
const hotel = await getManagedHotel(client, input.hotel_id);
if (!hotel) {
  throw new TRPCError({ code: 'NOT_FOUND', message: 'This hotel is not available to your account.' });
}
```

### 2.5 Dead Code ใน `server/db.ts`

บรรทัด 110–128 มี legacy code ที่ไม่ทำงานจริงและมี comment บอกตัวเองว่าไม่ใช้:
```typescript
// db.ts บรรทัด 106-108 (comment ในโค้ด)
// Compatibility surface for the unused template OAuth SDK. Channel Manager
// authentication is now Supabase Auth; no user record is read from or written
// to the template MySQL/TiDB database.
type LegacyTemplateUser = { ... }; // บรรทัด 110–120
export async function getUserByOpenId(_openId: string): Promise<LegacyTemplateUser | undefined> {
  return undefined; // always undefined — dead code
}
export async function upsertUser(_user: ...): Promise<void> {
  // Intentionally no-op — dead code
}
```

### 2.6 Unsafe Type Casting ใน `routers.ts`

`(client as any)` ปรากฏ **11+ ครั้ง** ในส่วน housekeeping และ messaging procedures ของ `routers.ts` (บรรทัด 1159, 1169, 1184, 1250, 1269, 1273, 1290, 1354, 1367, 1391, 1403) เพราะ router layer ทำ query ตรงโดยไม่ผ่าน db layer helper ที่มี type ถูกต้องอยู่แล้ว

### 2.7 Logic ซับซ้อนใน `client/src/App.tsx`

**activePath** คำนวณด้วย nested ternary 6 ชั้น (บรรทัด 97–107):
```typescript
const activePath = selectedHotelId && location.startsWith(`/hotels/${selectedHotelId}/bookings`)
  ? `/hotels/${selectedHotelId}/bookings`
  : selectedHotelId && location.startsWith(...)
    ? ...
    : selectedHotelId && location.startsWith(...)
      ? ...
      : ...
```

**Breadcrumb label** คำนวณด้วย inline ternary chain ยาวมาก (บรรทัด 286) ซึ่งยากต่อการเพิ่ม route ใหม่

**`RedirectToDashboard`** ใช้ `useState` เรียก side effect (บรรทัด 498) ซึ่งผิดหลัก React — ควรใช้ `useEffect`

### 2.8 `ComponentShowcase.tsx` ขนาด 58 KB

`client/src/pages/ComponentShowcase.tsx` เป็น dev-only showcase ขนาด 58.3 KB ที่ไม่มี route ใน `App.tsx` ซึ่งหมายความว่าไม่ถูก render ในการใช้งานจริง แต่ยังถูกรวมเข้าใน bundle

---

## 3. รายการไฟล์ที่ควร Refactor พร้อมเหตุผล

### ระดับ 🔴 Critical (High Priority)

| # | ไฟล์ | ปัญหาหลัก | ขนาด |
|---|---|---|---|
| 1 | `server/routers.ts` | God Router — 1,941 บรรทัด, ทุก tRPC endpoint ในไฟล์เดียว, Zod schemas 30+ ตัวฝังอยู่บนสุด, helper functions ปนกับ business logic | 88.7 KB |
| 2 | `server/db.ts` | God DAL — 1,810 บรรทัด, ทุก domain query ในไฟล์เดียว, Dead Code, pattern ซ้ำ 3 ครั้ง | 63.8 KB |

### ระดับ 🟡 Medium Priority

| # | ไฟล์ | ปัญหาหลัก | ขนาด |
|---|---|---|---|
| 3 | `client/src/App.tsx` | Layout + Routing + Auth Guard + MFA Check รวมกัน, nested ternary ซับซ้อน, `useState` ใช้เรียก side effect | 22.5 KB |
| 4 | `client/src/pages/HotelStaff.tsx` | Page Component ที่มี UI + State + Mutation สำหรับ 4 sub-features ในไฟล์เดียว (invite, role, transfer, signup link) | 34.4 KB |
| 5 | `client/src/index.css` | Monolithic CSS ขนาด 89.5 KB ที่ไม่แบ่ง scope | 89.5 KB |

### ระดับ 🟢 Low Priority (Clean-up)

| # | ไฟล์ | ปัญหาหลัก | ขนาด |
|---|---|---|---|
| 6 | `client/src/pages/ComponentShowcase.tsx` | Dev-only file ขนาด 58 KB ที่ไม่มี route จริง, ควรย้ายออกหรือ lazy-load | 58.3 KB |
| 7 | `client/src/pages/WebsiteBuilder.tsx` | Page ขนาดใหญ่ที่มีหลาย section ในไฟล์เดียว | 29.4 KB |

---

## 4. แผนการ Refactor ทีละขั้นตอน

### Phase 1: ทำความสะอาดก่อน (Pre-Refactor Cleanup) — ความเสี่ยงต่ำ

**เป้าหมาย:** ลบ Dead Code, รวม helper ที่ซ้ำกัน — ไม่เปลี่ยน public API

**1.1 ลบ Dead Code ใน `server/db.ts`**
- ลบ `LegacyTemplateUser` type (บรรทัด 110–120)
- ลบ `getUserByOpenId()` (บรรทัด 122–124)
- ลบ `upsertUser()` (บรรทัด 126–128)
- ตรวจสอบว่าไม่มีที่ใดในโปรเจกต์ import ทั้งสองฟังก์ชันนี้

**1.2 รวม `isMissing*TableError` เป็น Generic Helper**
- สร้าง `function isMissingTableError(tableName: string, error: unknown): boolean` ใน `server/db.ts`
- แทนที่ `isMissingHousekeepingTableError`, `isMissingMessagingTableError`, `isMissingHotelSiteConfigTableError` ด้วย generic version

**1.3 แก้ไข `RedirectToDashboard` ใน `client/src/App.tsx`**
- เปลี่ยนจาก `useState(() => { navigate(...) })` เป็น `useEffect(() => { navigate(...) }, [])`

---

### Phase 2: แยก Database Access Layer (`server/db.ts`) — ความเสี่ยงปานกลาง

**เป้าหมาย:** แตก `db.ts` ออกตาม Domain โดยไม่เปลี่ยน export signature

**โครงสร้างใหม่:**
```
server/
  db/
    types.ts          ← Types และ interfaces ทั้งหมด (HotelRecord, BookingRecord, ฯลฯ)
    utils.ts          ← throwOnError, isMissingTableError (generic helper)
    hotel.ts          ← listManagedHotels, getManagedHotel, createManagedHotel, createManagedRoomType, ...
    booking.ts        ← listBookingsForHotel, createBookingWithGuests, getPublicHotelAvailability, ...
    availability.ts   ← listAvailabilityForHotel, updateAvailability, listRateOverrides, ...
    staff.ts          ← listHotelUserAssignments, createHotelUserAssignment, listHotelStaff, ...
    housekeeping.ts   ← createHousekeepingTask, listHousekeepingTasks, updateHousekeepingTaskStatus, ...
    messaging.ts      ← createMessageThread, listThreads, createMessage, listMessages
    notification.ts   ← listNotifications, markNotificationRead, insertNotification, ...
    payment.ts        ← getSlipOkSettings, saveSlipOkSettings, createPaymentSession, ...
    siteConfig.ts     ← getHotelSiteConfig, saveHotelSiteConfig, listHotelMedia, ...
  db.ts               ← re-export ทั้งหมดจาก db/* (backward compat barrel)
```

**ขั้นตอน:**
1. สร้างโฟลเดอร์ `server/db/`
2. สร้าง `server/db/types.ts` — copy types ทั้งหมด
3. สร้าง `server/db/utils.ts` — copy `throwOnError` + generic `isMissingTableError`
4. สร้างไฟล์ domain ทีละไฟล์ โดย import จาก `./types` และ `./utils`
5. แก้ `server/db.ts` เดิม ให้เป็น barrel file: `export * from './db/hotel'; export * from './db/booking'; ...`
6. รัน `pnpm check` ทันทีหลังแต่ละขั้น

---

### Phase 3: แยก tRPC Routers (`server/routers.ts`) — ความเสี่ยงสูง

**เป้าหมาย:** แตก `routers.ts` เป็น sub-routers ตาม domain

**3.1 สร้าง Shared Utilities ก่อน**

สร้าง `server/routerUtils.ts`:
```typescript
// Helper ที่ซ้ำในทุก procedure — ย้ายมาไว้ที่นี่
export function getIdentityRoles(...) { ... }
export function requirePermission(...) { ... }
export function requireHotelPermission(...) { ... }
export async function requireSuperAdmin(...) { ... }
export function assertSingleHotelAdmin(...) { ... }
export function rethrowDomainError(...) { ... }
export function addIsoDays(...) { ... }
export function todayIso() { ... }
export function rlsClient(accessToken?: string) { ... }
```

**3.2 แยก Zod Schemas**

สร้าง `server/schemas/` โดยแยกตาม domain:
```
server/schemas/
  hotel.ts      ← createHotelSchema, createRoomTypeSchema, updateRoomTypeSchema, ...
  booking.ts    ← createBookingSchema, bookingStatusSchema, ...
  staff.ts      ← assignUserSchema, inviteUserSchema, hotelStaffInviteSchema, ...
  housekeeping.ts ← createHousekeepingTaskSchema, ...
  messaging.ts  ← listThreadsSchema, sendMessageSchema, ...
  payment.ts    ← createPublicBookingSchema, publicHotelAvailabilitySchema, ...
```

**3.3 สร้าง Sub-Routers**

โครงสร้างใหม่:
```
server/routers/
  index.ts          ← appRouter ที่รวม sub-routers ทั้งหมด (แทน routers.ts เดิม)
  authRouter.ts
  notificationsRouter.ts
  hotelRouter.ts    ← hotel CRUD, roomType CRUD, site config, media
  bookingRouter.ts  ← bookings, exportTm30, previewTm30, public booking flow
  availabilityRouter.ts ← updateAvailability, rateOverrides
  staffRouter.ts    ← adminUsers, hotelStaff, signupLinks, audit logs
  housekeepingRouter.ts
  messagingRouter.ts
  otaRouter.ts
  slipokRouter.ts
  paymentRouter.ts
  dashboardRouter.ts ← dashboard, channelPerformance, financials, dashboardCalendar
```

**3.4 แก้ไข Double Validation (ระหว่าง Phase นี้)**
- ลบ inline membership validation ออกจาก `createHousekeepingTask` และ `updateHousekeepingTaskStatus` ใน router layer
- ให้ router เรียกแค่ `await createHousekeepingTask(client, input)` — db layer จัดการ validation เองอยู่แล้ว
- ลบ duplicate `42P01` error handling ออกจาก router — db layer จัดการ graceful fallback เองแล้ว

---

### Phase 4: ปรับโครงสร้าง Frontend (`client/src/App.tsx`) — ความเสี่ยงต่ำ–ปานกลาง

**เป้าหมาย:** แยก Layout, Auth, Routing ออกจากกัน

**4.1 แยก Layout Components**
```
client/src/components/layout/
  AppShell.tsx      ← shell + sidebar + topbar (ย้ายจาก App.tsx)
  Sidebar.tsx       ← sidebar nav items + workspace menu
  Topbar.tsx        ← topbar + breadcrumbs + search + user menu
```
- แทนที่ nested ternary ใน `activePath` ด้วยฟังก์ชัน `getActivePath(location, selectedHotelId)`
- แทนที่ inline ternary chain ใน breadcrumb ด้วย lookup object

**4.2 แยก Auth Guard**
```
client/src/components/auth/
  PrivateRoute.tsx  ← ย้ายจาก App.tsx
```

**4.3 ให้ `App.tsx` เหลือเฉพาะ**
```typescript
// App.tsx หลัง refactor — ~50 บรรทัด
export default function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <LanguageProvider>
          <TooltipProvider>
            <Toaster />
            <Router />
          </TooltipProvider>
        </LanguageProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}
```

---

### Phase 5: Clean-up Frontend Pages (ทำทีหลังสุด)

- **`HotelStaff.tsx`**: แยก 4 sub-features เป็น component ย่อย (`StaffInvitePanel`, `StaffTransferDialog`, `SignupLinkPanel`, `AuditLogPanel`)
- **`ComponentShowcase.tsx`**: ตรวจสอบว่ามี route จริงหรือไม่ — ถ้าไม่มี ให้ย้ายออกนอก `src/pages/` หรือทำ code-split แยก
- **`index.css`**: แยกตาม concern (variables, base, layout, components)

---

## 5. ความเสี่ยงและผลกระทบ

### ความเสี่ยงสูง

| ความเสี่ยง | รายละเอียด | วิธีบรรเทา |
|---|---|---|
| **Import path พัง** | การย้ายไฟล์ทำให้ import paths ใน tests ทั้งหมดพัง | ใช้ barrel file (`db.ts` re-export ทั้งหมด) เพื่อ backward compat — ค่อยอัปเดต import ในรอบถัดไป |
| **AppRouter type เปลี่ยน** | `export type AppRouter` ใน `routers.ts` ถูก import โดย client — ถ้า path เปลี่ยนต้องอัปเดตทุกที่ | อัปเดต `server/index.ts` ให้ re-export `AppRouter` จากที่ใหม่ด้วย |
| **Test ที่ mock router** | Tests ที่ทำ mocked-router test (เช่น `financials.access.test.ts`) import จาก `routers.ts` โดยตรง | อัปเดต import ใน test หลังย้าย, รัน `pnpm test` ทันที |

### ความเสี่ยงปานกลาง

| ความเสี่ยง | รายละเอียด | วิธีบรรเทา |
|---|---|---|
| **Double Validation ที่ถูกลบ** | การลบ inline validation ใน router อาจทำให้ test ที่ตรวจสอบ router behavior fail | ตรวจสอบ test coverage ก่อน — validation ควรยังผ่านจาก db layer |
| **Merge Conflict** | ไฟล์ที่แตะมากอย่าง `routers.ts` เสี่ยง conflict กับ feature branch | ทำใน branch แยก และ rebase บ่อยๆ |

### ความเสี่ยงต่ำ

| ความเสี่ยง | รายละเอียด | วิธีบรรเทา |
|---|---|---|
| **Dead Code ลบผิด** | `getUserByOpenId` อาจถูกเรียกจากที่อื่นที่ยังไม่เจอ | Grep ทั้งโปรเจกต์ก่อนลบ: `grep -r "getUserByOpenId"` |
| **CSS specificity เปลี่ยน** | การแยก `index.css` อาจทำให้ rule ที่พึ่ง global order หยุดทำงาน | ทำ CSS หลังสุด, ทดสอบ visual ด้วย browser |

---

## 6. คำสั่งที่ต้องรันหลังแต่ละ Phase

```bash
# ต้องผ่านทุก Phase
pnpm check        # TypeScript type checking — ห้าม error
pnpm test         # Vitest unit tests — ห้าม test ใดพัง

# เฉพาะ Phase ที่แตะ server/deploy config
pnpm build        # vite build + esbuild server bundle
```

> **กฎสำคัญจาก AGENTS.md:** ห้าม mark ticket ว่า DONE จนกว่าจะ paste output จาก `pnpm test` และ `pnpm check` เป็นหลักฐาน

---

## 7. ลำดับการ Execute ที่แนะนำ

```
Phase 1 (Cleanup)    → pnpm check + pnpm test
Phase 2 (db split)   → pnpm check + pnpm test
Phase 3a (routerUtils + schemas) → pnpm check
Phase 3b (sub-routers ทีละตัว)  → pnpm check + pnpm test ทุก sub-router
Phase 4 (App.tsx)    → pnpm check + pnpm test + visual check
Phase 5 (Pages)      → pnpm check + pnpm test
```

แนะนำให้ทำ **1 Phase = 1 Commit** ตามกฎ "One ticket = one concern = one commit" ใน AGENTS.md
