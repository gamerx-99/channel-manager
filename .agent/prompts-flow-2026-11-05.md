# Codex prompts for Round 1 of the flow (2026-11-05)

Plan, owners and file lists: `.agent/flow-todo-2026-11-05.md`. Paste one prompt per agent. Each is self-contained.

Common rules (already inside each prompt): fresh clone of `main`, own branch, read `CLAUDE.md`, `.agent/DECISIONS.md` (top register and the 2026-11-05 product principle), `docs/thai-glossary.md`; edit only the files listed; `git add` named files only; whole `pnpm test`, `pnpm check` and `pnpm build` pass; Thai before/after table in the handoff entry; do not push `main`, do not deploy, do not apply migrations.

---

## Part 3: front desk can see which rooms are free

```text
งานนี้: ให้พนักงานหน้าฟร้อนดูห้องว่างในปฏิทินได้ (อ่านอย่างเดียว) โดยไม่เห็นราคารายวัน

เริ่มจาก clone ใหม่ของ GitHub main ล่าสุด: git clone https://github.com/gamerx-99/channel-manager.git hayhost-part3 && cd hayhost-part3
git checkout -b part-3/frontdesk-availability && corepack pnpm install
อ่านก่อนแก้: CLAUDE.md, .agent/DECISIONS.md (ตารางบนสุดและข้อ "Product principle" ของ 2026-11-05), docs/thai-glossary.md

ปัญหา: บทบาท front_desk มี property.view และ operations.view_bookings แต่ไม่มี revenue.manage_rates
ส่วน listAvailabilityForHotel (server/d1/availability.ts) ตรวจสิทธิ์ "revenue.manage_rates" ทำให้หน้าฟร้อนน่าจะโหลดข้อมูลปฏิทินไม่ได้
(ยังไม่ได้ลองบนระบบจริง: เขียน test จำลองบทบาท front_desk ยืนยันก่อนแก้)

ทำ:
1) เขียน test ที่ล้มก่อน: front_desk (สิทธิ์ตาม shared/authorization.ts) เรียก availability แล้วถูกปฏิเสธ
2) แก้ให้คนที่มี revenue.manage_rates หรือ operations.view_bookings อ่านรายการห้องว่างได้
   แต่ถ้าไม่มี revenue.manage_rates ให้ส่งค่า price เป็น null (ห้ามรั่วราคารายวัน)
   ใช้ authorizeHotelAction แบบเดิมของโปรเจกต์ ห้ามตรวจชื่อ role ตรง ๆ
3) หน้า Calendar.tsx: ถ้า price เป็น null ให้ซ่อนราคา ไม่แสดง "฿NaN" หรือ "฿0"
4) ผู้ใช้ที่ไม่มีทั้งสองสิทธิ์ (เช่น housekeeping) ต้องยังถูกปฏิเสธเหมือนเดิม และโรงแรมอื่นต้องยังถูกปฏิเสธ (test ครบ)

แก้ได้เฉพาะ: server/d1/availability.ts, server/d1/availability.test.ts (เพิ่มได้ ห้ามลดความเข้ม),
server/routers/availabilityRouter.ts (เฉพาะ procedure availability), server/channelManager.availability.d1.test.ts,
client/src/pages/Calendar.tsx และ Calendar.test.tsx
ห้ามแตะ: updateAvailability*, rate overrides, bookingService.ts, booking.ts, drizzle/**, wrangler.toml, ไฟล์ i18n (ไม่ควรต้องมีข้อความใหม่)

กฎ: ห้ามลบจุดท้ายหัวข้อ (title-mark) และป้าย eyebrow; ห้ามแก้ test ให้ผ่านโดยไม่บอกเหตุผล; git add เฉพาะไฟล์ที่แก้
เสร็จเมื่อ: pnpm check, pnpm test (ทั้งชุด), pnpm build ผ่าน (วางผลจริง), เพิ่ม entry บนสุดของ .agent/handoff.md,
push เฉพาะ branch part-3/frontdesk-availability ห้าม push main ห้าม deploy
```

---

## Part 10: dates in Thai time for guests

```text
งานนี้: หน้าจองสาธารณะต้องใช้ "วันนี้" ตามเวลาไทย ไม่ใช่วัน UTC

เริ่มจาก clone ใหม่ของ GitHub main ล่าสุด: git clone https://github.com/gamerx-99/channel-manager.git hayhost-part10 && cd hayhost-part10
git checkout -b part-10/thai-today && corepack pnpm install
อ่านก่อนแก้: CLAUDE.md, .agent/DECISIONS.md, shared/finance.ts (มีฟังก์ชัน bangkokDate ให้ใช้แล้ว)

ปัญหา: client/src/components/public-hotel/BookingStepDates.tsx (minDateIso), usePublicHotelPage.ts และ useBookingWizard.ts
สร้าง "วันนี้" จาก new Date().toISOString().slice(0, 10) ซึ่งเป็นวัน UTC
ช่วง 00:00-07:00 เวลาไทย แขกจึงเลือกเช็คอินเป็น "เมื่อวาน" ได้

ทำ:
1) เขียน test ที่ล้มก่อน (ใช้ fake timer ตั้งเวลา 2026-11-04T17:30:00Z = 00:30 วันที่ 5 พ.ย. เวลาไทย)
   แล้วยืนยันว่า minDateIso และค่าเริ่มต้นของวันเช็คอินเป็น 2026-11-05
2) แก้ให้ใช้ bangkokDate() จาก @shared/finance (ห้ามเขียนสูตรเวลาซ้ำ)
3) ตรวจ server ฝั่งจองสาธารณะว่าปฏิเสธ check_in ที่เป็นวันก่อนวันนี้ (เวลาไทย) หรือไม่
   ถ้าไม่ปฏิเสธ ให้เขียนไว้ใน handoff เป็นข้อเสนอ ห้ามแก้ server ในงานนี้

แก้ได้เฉพาะ: client/src/components/public-hotel/BookingStepDates.tsx, usePublicHotelPage.ts, useBookingWizard.ts (เฉพาะฟังก์ชันวันที่),
และ test ของไฟล์เหล่านั้น
ห้ามแตะ: server/**, shared/**, drizzle/**, i18n, ไฟล์อื่นใน public-hotel/ ที่ไม่ใช่สามไฟล์ข้างบน

กฎ/เสร็จเมื่อ: เหมือน Part 3 (pnpm check, pnpm test ทั้งชุด, pnpm build, handoff entry, push เฉพาะ branch part-10/thai-today)
```

---

## Part 4a: room type details (text only), with a migration written but not applied

```text
งานนี้: เพิ่มรายละเอียดของประเภทห้อง (ตัวหนังสืออย่างเดียว) เพื่อให้แขกเห็นก่อนเลือกห้อง

เริ่มจาก clone ใหม่ของ GitHub main ล่าสุด: git clone https://github.com/gamerx-99/channel-manager.git hayhost-part4a && cd hayhost-part4a
git checkout -b part-4a/room-type-details && corepack pnpm install
อ่านก่อนแก้: CLAUDE.md (กฎ Migrations: เขียนไฟล์ได้ แต่ห้ามรันกับฐานข้อมูลจริง), .agent/DECISIONS.md,
docs/thai-glossary.md, specs/ui-house-style.md, client/src/components/public-hotel/BookingStepRooms.tsx

หลักผลิตภัณฑ์: hayhost ให้เครื่องมือ โรงแรมกรอกเอง ห้ามใส่ข้อความ/ตัวเลือกเริ่มต้นแทนโรงแรม
(ไม่มี description, ชนิดเตียง หรือสิ่งอำนวยความสะดวกที่ตั้งไว้ให้ล่วงหน้า ช่องว่างต้องว่าง)

ทำ:
1) ฐานข้อมูล: เพิ่มคอลัมน์ใน room_types (drizzle/d1-schema.ts) แล้วสร้างไฟล์ migration ใหม่ 1 ไฟล์ใน drizzle/d1/ ตามรูปแบบเดิม
   (ใช้ pnpm exec drizzle-kit generate --config drizzle.d1.config.ts ถ้าทำได้ ถ้าไม่ได้ให้เขียนมือและบอกใน handoff)
   - description: text ไม่เกิน 600 ตัวอักษร ว่างได้
   - bed_type: text ไม่เกิน 80 ว่างได้ (โรงแรมพิมพ์เอง ไม่ใช่รายการตายตัว)
   - size_sqm: integer 1-1000 ว่างได้
   - amenities: json array ของข้อความ ไม่เกิน 12 รายการ แต่ละรายการไม่เกิน 40 ตัวอักษร ค่าเริ่มต้น []
   ห้ามรัน migration กับ production หรือ staging
2) server: server/d1/hotel.ts และ server/routers/hotelRouter.ts (createRoomType / updateRoomType) รับและตรวจค่าเหล่านี้
   การอ่านสาธารณะ (หน้าจอง) ต้องส่งค่าเหล่านี้ออกด้วย ตรวจสิทธิ์เดิม (property.manage_room_structure) ห้ามเปลี่ยน
3) หน้า HotelDetail.tsx: ฟอร์มประเภทห้องเพิ่มช่องเหล่านี้ (ใช้คลาส form-grid ของ house style)
4) หน้าจองสาธารณะ BookingStepRooms.tsx: แสดงรายละเอียดเมื่อโรงแรมกรอก ถ้าว่างให้ไม่แสดงอะไรเลย
5) test: ค่ายาวเกิน/จำนวนรายการเกิน ถูกปฏิเสธ, ข้อมูลโรงแรมอื่นถูกปฏิเสธ, ห้องเดิมที่ไม่มีค่าแสดงผลได้เหมือนเดิม, render test หน้าจอง
6) ข้อความใหม่ทุกข้อ ทั้ง th และ en ผ่าน thaiGlossary.test และ developerText.test พร้อมตาราง ก่อน → หลัง ใน handoff

แก้ได้เฉพาะ: drizzle/d1-schema.ts (เฉพาะ room_types), drizzle/d1/ (ไฟล์ใหม่ 1 ไฟล์) และ drizzle/meta ถ้า drizzle-kit สร้าง,
server/d1/hotel.ts, server/routers/hotelRouter.ts (เฉพาะ room type procedures), shared/ (type ประเภทห้อง),
client/src/pages/HotelDetail.tsx (เฉพาะฟอร์มประเภทห้อง), client/src/components/public-hotel/BookingStepRooms.tsx,
test ของไฟล์เหล่านี้, และคีย์ i18n ที่เพิ่ม (ใน section ของหน้าห้อง/หน้าจอง เท่านั้น)
ห้ามแตะ: ห้องรายตัว (rooms), รูปภาพ/hotel_media, website-builder/**, booking*.ts, availability*, wrangler.toml, components/layout/**

กฎ: ห้ามลบจุดท้ายหัวข้อ (title-mark) และป้าย eyebrow; ห้ามแก้ test ให้ผ่านโดยไม่บอกเหตุผล; git add เฉพาะไฟล์ที่แก้
เสร็จเมื่อ: pnpm check, pnpm test (ทั้งชุด), pnpm build ผ่าน (วางผลจริง), เพิ่ม entry บนสุดของ .agent/handoff.md
(ระบุชื่อไฟล์ migration และบอกว่ายังไม่ได้ apply), push เฉพาะ branch part-4a/room-type-details ห้าม push main ห้าม deploy
```
