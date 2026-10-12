# Channel Manager Authorization Model

เอกสารนี้เป็นสัญญากลางของสิทธิ์สำหรับ Channel Manager MVP หลังการแยกบทบาทจากโมเดลเดิมที่มีเพียง Super Admin และ Hotel Owner ออกเป็นเจ็ดบทบาท โดยการตรวจสิทธิ์ต้องเกิดทั้งใน backend guard และ PostgreSQL RLS; การซ่อนเมนูบน frontend ไม่ถือเป็นมาตรการความปลอดภัยเพียงอย่างเดียว

## บทบาทและขอบเขต

| บทบาท | ขอบเขตข้อมูล | สิทธิ์หลัก | สิ่งที่ห้ามทำ |
|---|---|---|---|
| `super_admin` | ทั้งแพลตฟอร์มและทุกโรงแรม | จัดการโรงแรมและผู้ใช้, ดูระบบและการตั้งค่าระดับแพลตฟอร์ม, ดูรายงานรวม, ดูและจัดการ iCal OTA connection | ไม่ได้รับ `service.*` โดยอัตโนมัติ และไม่ใช้สิทธิ์ machine-to-machine แทน `api_service` |
| `admin` | อ่านได้ทุกโรงแรมทั้งแพลตฟอร์ม (read-only) | ดูรายการโรงแรมทั้งหมด, ดูข้อมูลที่พัก, รายงาน, การจอง, สถานะห้อง, สถานะและ sync log ของ iCal เพื่องาน support/operations | ไม่สร้าง/แก้/ลบข้อมูลใด ๆ, ไม่จัดการผู้ใช้หรือพนักงาน, ไม่แก้ราคา/allotment/stop-sell, ไม่ trigger iCal sync และไม่รับโอนสิทธิ์ Hotel Admin |
| `hotel_owner` | เฉพาะโรงแรมที่มี membership | จัดการข้อมูลที่พัก, โครงสร้างห้อง, พนักงานของโรงแรม, รายงาน, การจอง, TM.30, ราคา, allotment, stop-sell และ iCal OTA ของโรงแรม | ไม่เห็นโรงแรมอื่นและไม่เข้าถึง platform billing/system logs |
| `revenue_manager` | เฉพาะโรงแรมที่ได้รับมอบหมาย | จัดการ rate plans, seasonal rates, dynamic pricing rules, promotion constraints, allotment และ stop-sell; ดูรายงานและสถานะ iCal | ไม่แก้โครงสร้างโรงแรม, ผู้ใช้, booking หรือ OTA connection |
| `front_desk` | เฉพาะโรงแรมที่ได้รับมอบหมาย | ดู master booking calendar, สร้าง/แก้ไข booking, จัดการ guest, check-in/check-out, export TM.30 และดูสถานะห้อง | ไม่แก้ OTA mapping, โครงสร้างโรงแรม, rate rules หรือ housekeeping status |
| `housekeeping` | เฉพาะโรงแรมที่ได้รับมอบหมาย | ดูและอัปเดตสถานะห้อง `Clean`, `Dirty`, `Out of Order` | ไม่ดูหรือแก้ booking, ราคา, OTA, ผู้ใช้ หรือโครงสร้างโรงแรม |
| `api_service` | machine-to-machine ตาม credential และ service boundary | ปัจจุบันสงวนไว้เฉพาะ `service.ical_sync`; ใช้กับงานอัตโนมัติที่ backend อนุญาต | ห้ามเข้าสู่ browser session และยังไม่มีสิทธิ์ ARI หรือ booking push จนกว่าจะเปิด scope OTA API อย่างชัดเจน |

## Platform roles กับ staff roles

`super_admin` และ `admin` เป็น **platform role** ไม่ใช่ membership ของโรงแรม (`PLATFORM_ROLES` ใน `shared/authorization.ts`) แถว `hotel_users` ของทั้งสองยังต้องมี `hotel_id` เพราะคอลัมน์เป็น NOT NULL แต่ `public.is_platform_admin()` ไม่สนใจว่าแถวชี้ไปโรงแรมไหน

`ASSIGNABLE_STAFF_ROLES` คือชุดบทบาทที่โรงแรมมอบให้พนักงานของตัวเองได้ (`hotel_owner`, `revenue_manager`, `front_desk`, `housekeeping`) หน้า Hotel Staff, `hotelStaffRoleValueSchema` และการโอนสิทธิ์ Hotel Admin ใช้ชุดนี้เท่านั้น จึงไม่มีทางแจกบทบาทระดับแพลตฟอร์มผ่านหน้าจัดการพนักงานของโรงแรม การมอบ `admin` ทำได้เฉพาะ `super_admin` ผ่านหน้า Admin Users

การอ่านข้ามโรงแรมของ `admin` เกิดที่ RLS ผ่าน `public.is_hotel_member()` ซึ่ง short-circuit ด้วย `public.is_platform_admin()` โดย **ไม่แตะ** `public.is_super_admin()` หรือ `can_manage_*` policy ทั้งหมดที่ยังอ้าง `is_hotel_member()` ในสคีมาปัจจุบันเป็น `for select` ล้วน (มี regression test `server/platformAdminRole.migration.test.ts` ยืนยันข้อนี้ในไฟล์ migration และ `verify_20260824_platform_admin.sql` ยืนยันซ้ำกับ `pg_policies` ของฐานข้อมูลจริง) ดังนั้น `admin` จึงเขียนข้อมูลโรงแรมใดไม่ได้เลยแม้ที่ชั้นฐานข้อมูล

## Permission contract

สิทธิ์ถูกประกาศไว้ที่ `shared/authorization.ts` และใช้ร่วมกันโดย router, route scope, Admin Users และ tests กลุ่มหลัก ได้แก่ `platform.*` (โดย `platform.view_all_hotels` เป็นสิทธิ์อ่านอย่างเดียวที่แยกจาก `platform.manage_*`), `property.*`, `revenue.*`, `operations.*`, `housekeeping.*`, `ota.*` และ `service.*` การเพิ่ม endpoint ใหม่ต้องเพิ่ม permission ใน matrix ก่อน แล้วจึงผูก guard และ RLS policy ที่สอดคล้องกัน

`api_service` ได้รับเพียง `service.ical_sync` ในรอบนี้ แม้จะมีชื่อ permission ที่สงวนไว้สำหรับ `service.ari_sync_reserved` และ `service.booking_push_reserved` เพื่อป้องกันการเปิด API OTA เกินขอบเขต iCal-only โดยไม่ตั้งใจ

## Enforcement layers

1. **Identity layer:** `server/supabase.ts` ใช้ Supabase anon key กับ access token ของผู้ใช้เพื่อสร้าง request-scoped RLS client, ดึง membership จาก `hotel_users`, คำนวณ roles และ default-deny เมื่อ identity หรือ helper ไม่พร้อมใช้งาน
2. **Machine identity boundary:** identity ที่มี `api_service` ใน metadata จะไม่ถูกสร้างเป็น human browser session; service credential ต้องใช้เส้นทาง server-to-server ที่แยกจาก UI และไม่ใช้ service-role client กับ query ข้อมูลโรงแรมตาม request ของผู้ใช้
3. **Backend layer:** `server/routers.ts` ใช้ `requirePermission` สำหรับ platform capability และ `requireHotelPermission` สำหรับ property capability ก่อนเรียก data helper โดย `super_admin` ข้าม property membership ได้เสมอ ส่วน `admin` ข้ามได้เฉพาะ capability ที่ matrix มอบให้ (ซึ่งเป็นสิทธิ์อ่านล้วน) endpoint ที่ต้องเป็น super admin จริง เช่น `createHotel` และ Admin Users ยังยืนยันซ้ำด้วย RPC `public.is_super_admin()` ที่ migration นี้ไม่ได้แก้
4. **Database layer:** `supabase_migration_production.sql` มี helper และ RLS policies สำหรับ property role, staff, room structure, booking, housekeeping, OTA connection และ sync logs การ apply patch กับ Supabase Postgres จริงต้องตรวจสอบ target connection ก่อน เพราะ environment ของ database execution ที่ใช้ตรวจล่าสุดรายงานเป็น TiDB/MySQL และไม่ควรถือว่าการ migrate สำเร็จ
5. **Frontend layer:** `client/src/App.tsx` และ `client/src/lib/routeScope.ts` ใช้ capability-aware navigation และ default-deny route decisions เพื่อไม่แสดงหน้าที่ role นั้นไม่มีสิทธิ์ แต่ frontend เป็นเพียง usability layer ไม่ใช่ security boundary

## OTA scope

ระบบยังคงจำกัด OTA เป็น **iCal calendar synchronization only** การ์ดสถานะบน Overview และหน้า OTA Sync จึงครอบคลุม connection health, last sync, updated calendar items, retry และ sync logs เท่านั้น ยังไม่เปิดการเชื่อมต่อ Booking.com, Agoda หรือ Airbnb API, ARI push หรือ booking webhook อัตโนมัติ หากจะเปิด scope ดังกล่าวต้องเพิ่ม service credential boundary, webhook verification, idempotency, audit log และ RLS policy เป็นงานแยกต่างหาก

## Verification status

Permission matrix, route scope, backend guards, Admin Users role picker, identity parsing และ regression tests ผ่าน TypeScript check, Vitest และ production build ในรอบล่าสุด รวม **133 tests passed และ 3 skipped** (อีก 7 ตัวที่ fail เป็นของเดิม ต้องการ `.env` และไฟล์เทมเพลต TM.30 ที่ยังไม่มีในเครื่องนี้)

`20260824_add_admin_role_and_platform_admin.sql` ถูก apply กับ Supabase project จริงเมื่อ 2026-08-24 และรายงานผล `Success. No rows returned` ซึ่งพิสูจน์เพียงว่า DDL รันผ่าน ยังไม่ได้พิสูจน์พฤติกรรมของ gatekeeper ต้องรัน `verify_20260824_platform_admin.sql` ให้ครบห้ารายการเป็น PASS และทดสอบด้วยบัญชี `admin` จริงในเบราว์เซอร์ก่อน จึงจะถือว่าสัญญา read-only ของ `admin` ได้รับการยืนยัน การยืนยัน browser flow ของ Hotel Owner production ยังต้องใช้บัญชีทดสอบที่เข้าสู่ระบบได้จริง; บัญชีเดิมตอบกลับ `Invalid login credentials` จึงไม่ควรสรุปว่า property-scoped browser evidence ผ่านจนกว่าจะมีบัญชีที่ใช้งานได้
