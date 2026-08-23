# แผนปฏิบัติการ: Create Hotel และ Create Room Type

## เป้าหมาย

ทำให้ปุ่ม **“+ Add hotel”** และ **“+ Add room type”** สร้างข้อมูลใน Supabase PostgreSQL ได้จริงผ่าน tRPC โดยคงหลักการความปลอดภัยที่อนุมัติแล้ว ได้แก่ **ใช้ Supabase Auth + PostgreSQL เป็น source of truth เดียว**, สร้าง RLS-scoped client จาก access token ของผู้ใช้ทุกครั้ง, ใช้ server guard เพิ่มเติมเพื่อความชัดเจน, และ **ห้ามใช้ service-role key** ใน user-facing mutation

| Workflow | ผู้เรียกที่อนุญาต | ตารางที่เขียน | บังคับใช้สิทธิ์ |
|---|---|---|---|
| Create Hotel | `super_admin` เท่านั้น | `public.hotels` | Router ตรวจ `is_super_admin()` และ database RLS ตรวจซ้ำ |
| Create Room Type | `super_admin` หรือ `hotel_owner` ของโรงแรมเป้าหมาย | `public.room_types` | Router ต้อง authenticated; RLS ตรวจ membership ของ `hotel_id` เป้าหมาย |

## ขั้นตอนดำเนินการ

### ขั้นที่ 1 — เตรียม data-layer contract

1. ตรวจ schema และ RLS policy ที่ใช้งานอยู่ของ `hotels` และ `room_types` อีกครั้ง เพื่อให้ชื่อคอลัมน์, unique slug และ constraint ตรงกับ production migration
2. เพิ่ม typed input/output และ Supabase helpers ใน `server/db.ts` สำหรับ insert โรงแรมและ insert room type
3. ใช้ `.insert(...).select(...).single()` กับ RLS-scoped client เท่านั้น และนำ error ของ Supabase/Postgres มา map เป็น domain error ที่ปลอดภัย เช่น `CONFLICT` สำหรับ slug ซ้ำ
4. เพิ่ม helper แบบ fail-closed เพื่อตรวจ RPC `is_super_admin()` สำหรับ createHotel; RPC error หรือค่าอื่นที่ไม่ใช่ `true` ต้องถือว่าไม่อนุญาต

### ขั้นที่ 2 — เพิ่ม tRPC mutations และ validation ฝั่ง server

1. เพิ่ม `channelManager.canCreateHotel` เพื่อให้ UI แสดง workflow ได้อย่างเหมาะสม แต่ไม่ถือเป็น security boundary
2. เพิ่ม `channelManager.createHotel` เป็น `protectedProcedure` พร้อม schema สำหรับ `name`, `slug`, `address`, `owner_contact`, `public_enabled`
3. Validation ฝั่ง server จะ trim fields ที่เป็นข้อความ, ห้ามฟิลด์บังคับว่าง, ตรวจ slug แบบ URL-safe และตรวจ boolean ก่อน write
4. เพิ่ม `channelManager.createRoomType` เป็น `protectedProcedure` พร้อม schema `hotel_id` แบบ UUID, `name`, `capacity` เป็น integer มากกว่า 0 และ `base_price` มากกว่า 0
5. ทุก procedure จะสร้าง client ด้วย `rlsClient(ctx.user.accessToken)` และส่งผ่าน error mapper เดียวกับ procedures ปัจจุบัน เพื่อคืน `BAD_REQUEST`, `FORBIDDEN` หรือ `CONFLICT` โดยไม่ปล่อย Postgres message ดิบ

### ขั้นที่ 3 — ต่อ UI หน้า Hotels

1. แทน placeholder ของปุ่ม **“+ Add hotel”** ด้วย dialog form ใน `Hotels.tsx`
2. ใช้ `canCreateHotel` เพื่อให้ปุ่ม/entry point ปรากฏแก่ super admin เท่านั้น; หากไม่ใช่ super admin จะไม่แสดง workflow สร้างโรงแรม
3. ฟอร์มรับ `name`, `slug`, `address`, `owner_contact` และ `public_enabled` พร้อม validation ฝั่ง client สำหรับค่าว่างและ slug ที่ไม่ถูกต้อง
4. ตอน submit จะแสดง pending state, ป้องกันการส่งซ้ำ, แสดง error จาก mutation ใน dialog และปิด/reset form เฉพาะเมื่อสร้างสำเร็จ
5. เมื่อสำเร็จ จะ invalidate `hotels`, `dashboard` และ permission query ที่เกี่ยวข้อง เพื่อให้รายชื่อและสรุปเป็นข้อมูลล่าสุดทันที

### ขั้นที่ 4 — ต่อ UI หน้า Hotel Detail

1. แทน placeholder ของปุ่ม **“+ Add room type”** ด้วย dialog form ใน `HotelDetail.tsx`
2. ใช้ hotel UUID จาก route ที่เปิดอยู่เท่านั้น; ผู้ใช้ไม่สามารถเปลี่ยน `hotel_id` ในฟอร์มได้
3. ฟอร์มรับ `name`, `capacity`, `base_price` โดย client validation จะปฏิเสธชื่อว่าง, capacity ที่ไม่ใช่จำนวนเต็มบวก และ base price ที่ไม่เป็นบวก
4. เมื่อ mutation สำเร็จ จะ invalidate hotel detail, hotels list และ dashboard เพื่อ refresh room-type list และ summary โดยไม่ต้องโหลดหน้าใหม่
5. หาก RLS ปฏิเสธ จะคง dialog ไว้พร้อมข้อความที่ใช้งานได้ โดยไม่เผย database internals

### ขั้นที่ 5 — เพิ่ม automated tests

1. เพิ่ม router/data-layer tests สำหรับ `createHotel`: input ไม่ถูกต้อง, non-admin ถูกปฏิเสธ, super admin request shape ถูกต้อง และ slug ซ้ำ map เป็น `CONFLICT`
2. เพิ่ม tests สำหรับ `createRoomType`: input ไม่ถูกต้อง, `capacity <= 0`, `base_price <= 0`, successful insert request shape และ RLS/membership rejection
3. รัน `pnpm exec tsc --noEmit`, `pnpm test` และ `pnpm run build`; แก้ทุก failure ก่อน checkpoint

### ขั้นที่ 6 — checkpoint และ browser verification

1. เมื่อ automated checks ผ่าน จะบันทึก checkpoint และเผยแพร่ preview ก่อนทำ browser verification
2. **จุดที่ต้องขอผู้ใช้:** แจ้งผู้ใช้เพื่อขอบัญชีทดสอบ Supabase สองบัญชีที่สร้างใน project `zeidlliiqtpsenlkhkzv` ได้แก่
   - บัญชี `super_admin` แบบทดสอบ เพื่อยืนยัน createHotel สำเร็จและ hotel owner ไม่เห็นปุ่ม/ถูกปฏิเสธเมื่อเรียก endpoint โดยตรง
   - บัญชี `hotel_owner` แบบทดสอบที่ถูกผูกกับ Little Bro ใน `hotel_users` เพื่อยืนยัน createRoomType สำเร็จเฉพาะโรงแรมของตน
3. ทำ browser verification ภายใต้สอง role ดังกล่าว: validation, pending/error state, success state, cache refresh และการห้ามข้าม tenant
4. Sign out ทั้งสอง session หลังทดสอบ และแจ้งผู้ใช้ให้ลบหรือ rotate credentials ทันที

## เกณฑ์ยอมรับ

| หมวด | เกณฑ์ผ่าน |
|---|---|
| Security | ทุก mutation ใช้ `rlsClient(ctx.user.accessToken)`; ไม่มี service-role key และไม่มี automatic `hotel_users` membership |
| Create Hotel | super admin สร้างโรงแรมได้; non-admin ได้ `FORBIDDEN`; slug ซ้ำได้ `CONFLICT` |
| Create Room Type | owner สร้างประเภทห้องให้ Little Bro ได้; owner สร้างให้โรงแรมอื่นไม่ได้ |
| Validation | ชื่อว่าง, capacity ไม่เป็นบวก, base price ไม่เป็นบวก และ slug ไม่ถูกต้อง ถูกปฏิเสธก่อน write |
| UX | ฟอร์มมี loading/error/success state และข้อมูล refresh หลัง mutation สำเร็จ |
| Regression | TypeScript, Vitest suite และ production build ผ่านทั้งหมด |
| E2E evidence | มีภาพหรือบันทึก browser ครอบคลุม success/rejection ตาม role ที่กำหนด |

## ข้อสมมติและความเสี่ยง

แผนนี้ไม่สร้าง membership อัตโนมัติหลัง createHotel เพราะการเลือก owner เป็นการกำหนดสิทธิ์ที่ต้องทำอย่างชัดเจนใน workflow แยกต่างหาก จึงเป็นไปได้ว่าโรงแรมที่ super admin สร้างใหม่จะยังไม่มี hotel owner จนกว่าจะเพิ่ม `hotel_users` โดยผู้ดูแลระบบ

การทดสอบ browser แบบสมบูรณ์ต้องรอผู้ใช้จัดเตรียมบัญชี test-only สอง role ตามขั้นที่ 6; จนถึงตอนนั้นจะทำได้เฉพาะ automated tests และ smoke checks ที่ไม่แก้ข้อมูล production เท่านั้น
