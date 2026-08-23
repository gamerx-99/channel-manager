# สรุปผลการตรวจสอบสถาปัตยกรรมฐานข้อมูลและ TM.30 Export (Review & Compliance Report)

ตามที่คุณทักท้วงเกี่ยวกับข้อแตกต่างระหว่างแผนงานทางเทคนิคที่ตกลงกันไว้กับ SQL และฟังก์ชันที่นำเสนอไปก่อนหน้านี้ ทางเราได้ระงับการเปลี่ยนแปลงทั้งหมดและจัดทำรายงานการตรวจสอบเชิงลึกครบถ้วนทั้ง 5 ประเด็น ดังรายละเอียดต่อไปนี้

---

### 1. Row Level Security (RLS) Policies ตั้งแต่ Migration แรก
ในโครงสร้างฐานข้อมูลที่ถูกต้องตามแผนงาน ทุกตารางที่มีความเกี่ยวข้องกับโรงแรมจะต้องเปิดใช้งาน RLS ทันทีในสคริปต์ Migration แรก โดยผูกสิทธิ์ผ่านตาราง `hotel_users` เพื่อให้มั่นใจว่าบทบาท `hotel_owner` จะสามารถเข้าถึงได้เฉพาะข้อมูลใน `hotel_id` ของตนเองเท่านั้น ขณะที่ `super_admin` สามารถเข้าถึงได้ทุกโรงแรม

ตัวอย่างสคริปต์ RLS ที่ถูกต้องตามแผน:
```sql
-- เปิดใช้ RLS ทุกตาราง
alter table hotels enable row level security;
alter table hotel_users enable row level security;
alter table room_types enable row level security;
alter table rooms enable row level security;
alter table bookings enable row level security;
alter table guests enable row level security;
alter table availability enable row level security;
alter table hotel_domains enable row level security;

-- ตัวอย่างนโยบายสำหรับตาราง bookings
create policy "Hotel users can manage bookings for their hotels"
  on bookings
  for all
  using (
    auth.uid() in (
      select user_id from hotel_users where hotel_id = bookings.hotel_id
    )
    or
    auth.uid() in (
      select user_id from hotel_users where role = 'super_admin'
    )
  );
```

---

### 2. PostgreSQL Exclusion Constraint ป้องกันการจองห้องซ้อน
เพื่อป้องกันไม่ให้เกิดการจองห้องพักซ้ำซ้อนในช่วงเวลาเดียวกัน (Double booking) แผนงานกำหนดให้ใช้ PostgreSQL Exclusion Constraint ร่วมกับเอกเทนชัน `btree_gist` โดยสร้างช่วงเวลาการเข้าพักเป็น `tsrange` และกำหนดเงื่อนไขว่าห้ามมีห้องเลขที่เดียวกันถูกจองทับซ้อนในช่วงสถานะที่ยังใช้งานอยู่

ตัวอย่างสคริปต์ Exclusion Constraint:
```sql
create extension if not exists btree_gist;

-- กำหนดตาราง bookings ให้รองรับ exclusion constraint ผ่านช่วงเวลา (check_in ถึง check_out) และ room_id
alter table bookings
  add constraint prevent_double_booking
  exclude using gist (
    room_id with =,
    tsrange(check_in::timestamp, check_out::timestamp, '[)') with &&
  )
  where (status in ('confirmed', 'checked_in'));
```

---

### 3. ฟิลด์เว็บไซต์สาธารณะ (`hotels.slug`, `hotels.public_enabled`, `hotel_media`)
สำหรับรองรับสถาปัตยกรรมเว็บไซต์สาธารณะแยกรายโรงแรม (Fallback URL ผ่าน `/hotelname` และผูกโดเมนแยกผ่าน `hotel_domains`) ตารางฐานข้อมูลต้องมีฟิลด์และตารางสนับสนุนครบถ้วน ดังนี้:

- **`hotels.slug`**: คอลัมน์ข้อความระบุ URL-friendly identifier ของโรงแรม (เช่น `riverside-house`) มีเงื่อนไข `unique not null`
- **`hotels.public_enabled`**: คอลัมน์ `boolean default true` สำหรับเปิด/ปิดการแสดงผลหน้าเว็บสาธารณะ
- **`hotel_media`**: ตารางจัดเก็บรูปภาพแกลเลอรีและโลโก้ประจำโรงแรม
  ```sql
  create table hotel_media (
    id uuid primary key default gen_random_uuid(),
    hotel_id uuid references hotels(id) on delete cascade,
    url text not null,
    caption text,
    is_hero boolean default false,
    display_order int default 0,
    created_at timestamp with time zone default now()
  );
  ```

---

### 4. Unique Constraints และ Indexes สำคัญ
เพื่อประสิทธิภาพและความถูกต้องของข้อมูล ระบบต้องกำหนด Index และ Unique Constraint เพิ่มเติม ดังนี้:
- **`rooms`**: `unique (hotel_id, room_number)` ป้องกันไม่ให้ห้องเลขที่ซ้ำกันในโรงแรมเดียวกัน
- **`availability`**: `unique (room_type_id, date)` และ Index บน `(hotel_id, date)` สำหรับคิวรีปฏิทินห้องว่างรายวันได้อย่างรวดเร็ว

---

### 5. Golden-File Test สำหรับ TM.30 Export
ตามข้อกำหนดในการทดสอบความถูกต้องของไฟล์ส่งออก TM.30 ระบบจะจัดทำชุดทดสอบ (Golden-file test) ที่เปรียบเทียบผลลัพธ์ของไฟล์ `.xlsx` กับเทมเพลตทางการ (`Template-InformAccom-ImportExcel.xls`) โดยอัตโนมัติ เพื่อตรวจสอบ:
1. ลำดับและชื่อคอลัมน์ตรงกับ 8 หัวข้อทางการ (`First name`, `Middle name`, `Last name`, `Gender`, `Passport no.`, `Nationality code`, `Birth date`, `Phone no.`)
2. การตรวจสอบรหัสสัญชาติ ICAO 3 ตัวอักษร (เช่น USA, CHN, THA) เป็นตัวพิมพ์ใหญ่เสมอ
3. รูปแบบวันที่เกิดและช่วงเวลาเข้าพักถูกต้องตามมาตรฐานที่ ตม. กำหนด

---
รายงานชิ้นนี้จัดทำขึ้นเพื่อยืนยันความเข้าใจที่ตรงกันตามแผนงาน ทางเราพร้อมรอรับคำอนุมัติและข้อเสนอแนะเพิ่มเติมจากท่านก่อนดำเนินการในขั้นตอนถัดไป
