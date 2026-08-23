# แผนเพิ่มการสร้างโรงแรมและประเภทห้องผ่าน Dashboard

## เป้าหมาย

เปลี่ยนปุ่ม **“Add hotel”** ในหน้า `/hotels` และ **“Add room type”** ในหน้า `/hotels/[id]` จาก placeholder ให้เป็น workflow ที่ใช้งานได้จริงผ่าน tRPC และ Supabase PostgreSQL โดยใช้ `rlsClient(ctx.user.accessToken)` สำหรับทุกการเขียนข้อมูล และรักษา Supabase RLS เป็นชั้นบังคับใช้สิทธิ์สุดท้ายเสมอ

การเปลี่ยนแปลงนี้จะไม่ใช้ service-role key กับ user-facing mutation และจะไม่เพิ่มเส้นทางที่เขียนข้อมูลผ่าน MySQL/TiDB ระบบ identity และข้อมูล Channel Manager จะยังคงเป็น Supabase Auth + PostgreSQL เพียงแหล่งเดียว

| Workflow | ผู้มีสิทธิ์ | ตารางเป้าหมาย | Validation ฝั่ง server | ผลหลังสำเร็จ |
|---|---|---|---|---|
| สร้างโรงแรม | `super_admin` เท่านั้น | `public.hotels` | `name`, `slug`, `address`, `owner_contact` ต้องไม่ว่าง; `slug` ต้องเป็นรูปแบบ URL-safe; `public_enabled` เป็น boolean | คืน hotel record และ refresh directory/dashboard |
| สร้างประเภทห้อง | `super_admin` หรือ `hotel_owner` ของ `hotel_id` นั้น | `public.room_types` | `hotel_id` เป็น UUID; `name` ไม่ว่าง; `capacity` เป็นจำนวนเต็มมากกว่า 0; `base_price` เป็นตัวเลขมากกว่า 0 | คืน room-type record และ refresh hotel detail/summary |

## หลักการสิทธิ์และสัญญา API

ใน migration ปัจจุบัน `hotels` และ `room_types` เปิด RLS แล้ว โดย policy เรียก `public.is_super_admin()` และ `public.is_hotel_member(...)` ซึ่งเป็น `SECURITY DEFINER` helper ที่อนุมัติไว้ก่อนหน้า การ implement จะคง policy ดังกล่าวไว้และจะสร้าง Supabase client ต่อคำขอจาก access token ของผู้ใช้เท่านั้น

สำหรับ `createHotel` จะเพิ่ม server-side guard ที่เรียก RPC `is_super_admin()` ด้วย RLS-scoped client ก่อน insert เพื่อแสดงเจตนาสิทธิ์ให้ชัดเจนและคืน `FORBIDDEN` โดยตรงเมื่อผู้เรียกไม่ใช่ super admin หลังจากนั้น insert ยังต้องผ่าน RLS ของฐานข้อมูลอยู่ดี จึงไม่มีการเชื่อถือการซ่อนปุ่มใน UI เป็น security control

สำหรับ `createRoomType` จะส่ง `hotel_id` ไปใน input contract และปล่อยให้ RLS ตรวจ membership ของโรงแรมเป้าหมายโดยตรง หากผู้ใช้ไม่มีสิทธิ์ helper/row-level policy จะปฏิเสธ query และ router จะแปลงเป็น tRPC `FORBIDDEN` ตามรูปแบบ error mapping ที่มีอยู่ ไม่จำเป็นต้องดู role จาก client state

## ขั้นตอนดำเนินงาน

### 1. เพิ่ม data-layer helpers ที่คืน record จริง

จะเพิ่ม type สำหรับ input ที่สร้าง hotel และ room type ใน `server/db.ts` พร้อม helper `createManagedHotel(...)` และ `createRoomType(...)` โดยแต่ละ helperใช้ `client.from(...).insert(...).select(...).single()` และ `throwOnError(...)` เดียวกับ booking/availability helpers ที่ใช้อยู่แล้ว ผลลัพธ์ที่ return จะมีเฉพาะคอลัมน์ที่ UI ต้องใช้และไม่เปิดเผย owner contact ผ่าน public paths

Helper ตรวจ super-admin จะเรียก `client.rpc('is_super_admin')` และจะ fail closed หาก RPC error หรือค่าที่ได้ไม่ใช่ `true` ส่วน error จาก unique slug จะถูก map เป็นข้อความที่ผู้ใช้แก้ไขได้ เช่น slug ถูกใช้งานแล้ว แทนการแสดง database message ดิบ

### 2. เพิ่ม tRPC mutations และ permission query

จะเพิ่ม contracts ใต้ `channelManager` ใน `server/routers.ts` ดังนี้

| Procedure | Input | การบังคับสิทธิ์ | หมายเหตุ |
|---|---|---|---|
| `canCreateHotel` | ไม่มี | `protectedProcedure` + RPC `is_super_admin()` | ใช้เพื่อปรับ UX ของปุ่มเท่านั้น ไม่แทน server guard |
| `createHotel` | `name`, `slug`, `address`, `owner_contact`, `public_enabled` | `protectedProcedure` + explicit super-admin guard + RLS insert | trim/normalize input ก่อนเขียน และส่ง error แบบ typed |
| `createRoomType` | `hotel_id`, `name`, `capacity`, `base_price` | `protectedProcedure` + RLS membership check | `capacity` เป็น integer > 0 และ `base_price` > 0 ตาม requirement นี้ |

ทุก mutation จะใช้ `rlsClient(ctx.user.accessToken)` เหมือน procedures ปัจจุบัน และจะ reuse `rethrowDomainError(...)` เพื่อส่ง `FORBIDDEN`, `CONFLICT`, `BAD_REQUEST` หรือ `INTERNAL_SERVER_ERROR` อย่างสม่ำเสมอ หาก Supabase ส่ง unique violation ของ slug จะเพิ่ม mapping ให้เป็น `CONFLICT` ที่อ่านเข้าใจได้

### 3. เปลี่ยนหน้า Hotels เป็นฟอร์มสร้างโรงแรมจริง

จะเปลี่ยนปุ่ม placeholder เป็น dialog/form ที่เปิดได้เฉพาะเมื่อ `canCreateHotel` ส่งค่าอนุญาต สำหรับผู้ใช้ที่ไม่ใช่ super admin จะไม่เปิด workflow สร้างโรงแรม และ server ยังปฏิเสธการเรียก mutation หากมีการส่งคำขอโดยตรง

ฟอร์มจะมี `name`, `slug`, `address`, `owner_contact` และ toggle `public_enabled` พร้อม validation ทันทีสำหรับค่าว่างและ slug ที่ไม่รองรับ URL การ submit จะ disable ระหว่าง pending, แสดง error จาก mutation ภายใน dialog, และเมื่อสำเร็จจะ reset/ปิด dialog พร้อม invalidate `channelManager.hotels`, `channelManager.dashboard` และ permission query เพื่อให้ directory และ summary เป็นข้อมูลจริงทันที

### 4. เปลี่ยนหน้า Hotel Detail เป็นฟอร์มเพิ่มประเภทห้องจริง

จะเพิ่ม dialog/form ใน `HotelDetail.tsx` ที่ยึด `hotel_id` จาก route ปัจจุบัน ไม่เปิดให้ผู้ใช้กรอก ID เอง ฟอร์มรับ `name`, `capacity` และ `base_price`; client-side validation จะตรวจชื่อ, parse จำนวนอย่างปลอดภัย, capacity มากกว่า 0 และ base price มากกว่า 0 ก่อนเรียก mutation

เมื่อ success จะ invalidate `channelManager.hotel` ของโรงแรมปัจจุบัน รวมถึง `channelManager.hotels` และ `channelManager.dashboard` เพื่อให้ list room types, จำนวนห้อง/summary และ sidebar ที่เกี่ยวข้องไม่ค้างข้อมูลเก่า ข้อผิดพลาด RLS จะปรากฏใน form ในภาษาใช้งานได้โดยไม่เปิดเผยรายละเอียด Postgres

### 5. เพิ่ม tests และตรวจพฤติกรรมจริง

จะเพิ่ม tests แบบ router/data-layer ที่ใช้แนวทาง Vitest ปัจจุบันเพื่อยืนยันว่า super admin ผ่าน `createHotel`, non-admin ได้ `FORBIDDEN`, และ input ที่ไม่ผ่าน schema ไม่เรียก insert นอกจากนี้จะตรวจ request shape ของ `createRoomType`, การปฏิเสธ `capacity <= 0` และ `base_price <= 0`, รวมถึงกรณี RLS ปฏิเสธ hotel ที่ไม่ใช่ของผู้เรียก

หลังจากนั้นจะรัน TypeScript, test suite ทั้งชุด และ production build จากนั้นทำ browser verification อย่างน้อยสอง role: super admin สำหรับสร้าง hotel และ `hotel_owner` ของ Little Bro สำหรับเพิ่ม room type ผู้ใช้ hotel owner จะยืนยันได้ว่าห้องประเภทใหม่ปรากฏใน Hotel Detail หลัง refresh และผู้ที่ไม่มีสิทธิ์ไม่สามารถสร้างข้อมูลข้ามโรงแรมได้

## แผนทดสอบและเกณฑ์ผ่าน

| ระดับ | กรณีทดสอบ | เกณฑ์ผ่าน |
|---|---|---|
| Schema validation | ชื่อว่าง, capacity 0/ติดลบ, base price 0/ติดลบ, slug ไม่ถูกต้อง | tRPC คืน `BAD_REQUEST`; ไม่มีการ insert |
| Authorization | hotel owner เรียก `createHotel` | `FORBIDDEN`; ไม่มี row ใหม่ |
| Authorization | hotel owner เพิ่ม room type ให้ Little Bro | insert สำเร็จผ่าน RLS และ record แสดงใน detail |
| Authorization | hotel owner เพิ่ม room type ให้ UUID โรงแรมอื่น | `FORBIDDEN`; ไม่มี row ใหม่ |
| Data integrity | slug ซ้ำ | `CONFLICT` พร้อมข้อความที่แก้ไขได้ |
| UI | submit สำเร็จ/ล้มเหลว | pending state, error state, reset form และ cache invalidation ถูกต้อง |
| Regression | `pnpm exec tsc --noEmit`, `pnpm test`, `pnpm run build` | ทุกคำสั่งผ่านก่อนเผยแพร่ |

## ข้อสมมติและความเสี่ยง

แผนนี้สมมติว่า production database มี RLS policies และ `is_super_admin()`/`is_hotel_member(...)` ตาม migration ที่อนุมัติแล้ว และ Supabase Auth user ของ super admin มี `hotel_users.role = 'super_admin'` อย่างน้อยหนึ่งแถว การสร้างโรงแรมเพียงอย่างเดียวจะยังไม่ทำให้ hotel owner คนใหม่เข้าถึงโรงแรมได้จนกว่าจะมีการสร้าง `hotel_users` membership; งานนั้นไม่ได้อยู่ใน scope ที่ร้องขอและจะไม่สร้าง membership โดยอัตโนมัติเพื่อหลีกเลี่ยงการกำหนด owner ผิดคน

การทดสอบ browser แบบเต็มของ `createHotel` ต้องใช้บัญชี super admin สำหรับทดสอบแยกต่างหาก ส่วนการทดสอบ `createRoomType` สามารถใช้บัญชี E2E `hotel_owner` ของ Little Bro ที่มีอยู่ได้ หลังจบการตรวจจะ sign out และขอให้ผู้ใช้ rotate/delete credentials ตามกระบวนการเดิม
