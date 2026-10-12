# คู่มือทดสอบระบบ: ตั้งแต่ลูกค้าเริ่มจองจนถึงเช็คเอาต์

อัปเดตล่าสุด: 12 กันยายน 2026  
ขอบเขต: ทดสอบแบบ End-to-End (E2E/UAT) บนระบบ Channel Manager เวอร์ชันปัจจุบัน  
กลุ่มผู้ทดสอบ: เจ้าของที่พัก (`hotel_owner`), พนักงานต้อนรับ (`front_desk`) และลูกค้าที่ไม่ล็อกอิน
ตรวจเทียบกับซอร์สโค้ด: `main` commit `50bbb62`

> สถานะสำคัญของระบบปัจจุบัน: เส้นทางจองและชำระเงินทดสอบได้ถึงสถานะ `confirmed` แต่ยังไม่มีปุ่มหรือ tRPC mutation สำหรับเปลี่ยนสถานะ `confirmed → checked_in → checked_out` ผ่านหน้าเว็บ ดังนั้นการทดสอบครบถึงเช็คเอาต์ต้องจบด้วยผล `BLOCKED` ที่ขั้นตอน Check-in/Check-out จนกว่าจะพัฒนาส่วนนี้เพิ่ม ห้ามแก้สถานะด้วย SQL บน production เพียงเพื่อทำให้ผลทดสอบผ่าน

## 1. เป้าหมาย

คู่มือนี้ใช้ตรวจว่า:

1. ที่พักเตรียมห้อง ราคา บริการ และช่องทางรับเงินได้
2. ลูกค้าเห็นห้องว่าง เลือกวัน พัก เลือกบริการ และกรอกข้อมูลได้
3. ระบบกันห้องชั่วคราว (`held`) และปล่อยห้องเมื่อหมดเวลา
4. ระบบเปลี่ยนเป็นรอชำระ (`pending_payment`) และตรวจสลิปได้
5. พนักงานเห็นรายการและจัดการกรณีรอตรวจ (`pending_verification`) ได้
6. Booking ที่ชำระสำเร็จเปลี่ยนเป็น `confirmed`
7. ตรวจความพร้อมของขั้นตอนก่อนเข้าพัก, Check-in, Check-out และงานแม่บ้าน
8. บันทึกช่องว่างของระบบตามสิ่งที่เกิดขึ้นจริง ไม่ปรับผลให้ผ่านด้วยการแก้ฐานข้อมูล

## 2. ข้อควรระวังก่อนทดสอบ

- แนะนำให้ใช้ staging หรือโรงแรมทดสอบโดยเฉพาะ หลีกเลี่ยงโรงแรมที่รับจองจริง
- ตั้งชื่อข้อมูลให้ค้นหาได้ เช่น `UAT-20260912-SOMCHAI` และใช้วันที่ในอนาคต
- ห้ามใช้ข้อมูลส่วนบุคคลจริง เลขบัตรจริง หรือเอกสาร TM.30 จริง
- การทดสอบ SlipOK บน production อาจเรียกบริการภายนอกและมีค่าใช้จ่าย
- QR PromptPay เป็นการสร้าง QR รับเงิน ไม่พบ webhook จากธนาคารในระบบปัจจุบัน การสแกน QR อย่างเดียวจึงไม่ใช่หลักฐานว่าระบบจะเปลี่ยนเป็น `paid` อัตโนมัติ เส้นทางที่ตรวจสอบได้คือการอัปโหลดสลิปให้ SlipOK ตรวจ
- ระบบยังไม่มีการลบ/ยกเลิก Booking ทดสอบผ่าน UI อย่างสมบูรณ์ จึงไม่ควรสร้างข้อมูลทดลองจำนวนมากบน production
- หน้า Availability ของพนักงานเป็น snapshot ที่แก้ตัวเลขเอง และยังไม่เชื่อมกับ Booking จริง ให้ใช้หน้าจองสาธารณะและรายการ Booking เป็นหลักในการตรวจ inventory

## 3. บัญชีและข้อมูลที่ต้องเตรียม

### 3.1 ผู้ใช้งาน

| ผู้แสดง | สิทธิ์/บัญชี | หน้าที่ในการทดสอบ |
|---|---|---|
| เจ้าของที่พัก | `hotel_owner` | ตั้งค่าโรงแรม ห้อง บริการ PromptPay และ SlipOK |
| พนักงานต้อนรับ | `front_desk` | ตรวจ Booking และอนุมัติ/ปฏิเสธกรณีรอตรวจ |
| ลูกค้า | ไม่ล็อกอิน | จองผ่าน `/<hotel-slug>` |

### 3.2 ชุดข้อมูลตัวอย่าง

| รายการ | ค่าแนะนำ |
|---|---|
| ชื่อโรงแรม | `UAT Hotel` |
| Slug | `uat-hotel-<วันที่>` |
| ประเภทห้อง | `Deluxe UAT` |
| จำนวนห้อง | 2 ห้อง |
| ราคาฐาน | 1,000 บาท/คืน |
| วันเข้าพัก | พรุ่งนี้ หรือวันที่ในอนาคตที่ไม่มี Booking |
| วันออก | หลังวันเข้าพัก 2 คืน |
| บริการเสริม | `Breakfast UAT`, 150 บาท/คน/คืน |
| ชื่อลูกค้า | `UAT SOMCHAI <เวลา>` |
| เบอร์โทร | `0800000000` |
| อีเมล | `uat+<เวลา>@example.com` |
| คำขอพิเศษ | `UAT TEST - Late arrival 20:00` |

บันทึกค่าต่อไปนี้ก่อนเริ่ม: Hotel ID, Slug, Room Type, วันที่เข้าพัก/ออก, ราคาคาดหวัง และเวลาที่เริ่มทดสอบ

## 4. แผนผังสถานะที่คาดหวัง

| เหตุการณ์ | สถานะก่อน | สถานะหลัง | ทดสอบผ่าน UI ได้หรือไม่ |
|---|---|---|---|
| ลูกค้าเลือกห้อง | ไม่มี Booking | `held` | ได้ |
| ลูกค้ายืนยันข้อมูล | `held` | `pending_payment` | ได้ |
| ลูกค้าอัปโหลดสลิป | `pending_payment` หรือ `payment_rejected` | `pending_verification` | ได้ |
| SlipOK ตรง | `pending_verification` | `confirmed` | ได้ |
| SlipOK ใช้งานไม่ได้ | `pending_verification` | `pending_verification` รอคนตรวจ | ได้ แต่พนักงานต้องตรวจจากหลักฐานภายนอก |
| พนักงานอนุมัติ | `pending_verification` | `confirmed` | ได้ |
| พนักงาน Check-in | `confirmed` | `checked_in` | **ยังไม่ได้** |
| พนักงาน Check-out | `checked_in` | `checked_out` | **ยังไม่ได้** |

## 5. ขั้นตอนทดสอบหลัก (Golden Path)

### TC-00 — ตรวจความพร้อมของโรงแรม

ผู้ทดสอบ: เจ้าของที่พัก

1. ล็อกอิน แล้วเลือกโรงแรมทดสอบจาก Workspace switcher
2. ไปที่ `Properties → โรงแรม → Room Types`
3. ยืนยันว่ามีประเภทห้อง ราคา จำนวนห้อง และอย่างน้อยหนึ่งห้องมีสถานะ `available`
4. ถ้ายังไม่มี ให้สร้าง `Deluxe UAT` จำนวน 2 ห้อง ราคา 1,000 บาท
5. ตรวจว่าโรงแรมเปิด Public site และจด slug จาก URL ที่แสดงในหน้าโรงแรม
6. ไปที่แท็บ `Services` (`/hotels/:id/services`) และสร้าง `Breakfast UAT` ถ้าต้องการทดสอบบริการเสริม
7. ไปที่ `Financials` (`/dashboard/financials`) และตรวจ PromptPay ID กับเวลาหมดอายุการชำระ
8. ไปที่ `Security` (`/settings/security`) และตรวจว่า SlipOK Branch ID/API key ถูกตั้งค่าแล้ว การเปิดหรือบันทึกส่วนนี้อาจบังคับ MFA
9. เปิดหน้าสาธารณะ `/<slug>` ใน Incognito/Private window โดยไม่ล็อกอิน

ผลที่คาดหวัง:

- หน้าโรงแรมสาธารณะเปิดได้
- เห็นประเภทห้องและส่วนจอง
- ไม่มีข้อมูลของโรงแรมอื่นปะปน
- ถ้า PromptPay/SlipOK ไม่พร้อม ให้หยุดและบันทึก `BLOCKED — payment configuration`

### TC-01 — ลูกค้าเลือกวันและกันห้อง

ผู้ทดสอบ: ลูกค้า

1. ในหน้าสาธารณะ เลือกวัน Check-in
2. เลือกวัน Check-out ที่อยู่หลัง Check-in
3. ไปขั้นตอนเลือกห้อง
4. ตรวจชื่อประเภทห้อง จำนวนคืน ราคาต่อคืน และสถานะว่าง
5. เลือก `Deluxe UAT`
6. จับภาพหน้าจอทันทีที่เห็นเวลานับถอยหลังการกันห้อง
7. เปิดหน้ารายการ Booking ของพนักงานในอีกหน้าต่าง แล้วค้นหาสถานะ `held`

ผลที่คาดหวัง:

- ระบบสร้าง Booking สถานะ `held`
- มีห้องจริงถูก assign ให้ Booking
- มีเวลาหมดอายุ (`expires_at`) และ countdown ลดลงตามเวลา
- ราคาเริ่มต้นเท่ากับจำนวนคืน × ราคาที่ resolve แล้ว
- การกดซ้ำหรือเปิดลูกค้าคนที่สองไม่ควรจองห้องเดียวกันในช่วงวันที่ทับซ้อน

หลักฐานที่ต้องเก็บ: Booking ID 8 ตัวหน้า, ห้อง, เวลาเริ่ม hold, เวลา expires และภาพ countdown

### TC-02 — เลือกบริการและกรอกข้อมูลลูกค้า

ผู้ทดสอบ: ลูกค้า

1. เลือก `Breakfast UAT` จำนวน 1
2. ตรวจยอดบริการตาม pricing model
3. ไปขั้นตอนข้อมูลผู้เข้าพัก
4. กรอกชื่อ เบอร์โทร อีเมล และคำขอพิเศษตามชุดข้อมูลตัวอย่าง
5. กดถัดไป ระบบจะบันทึกข้อมูลและเปลี่ยน Booking เป็น `pending_payment`
6. ที่หน้าสรุป ตรวจโรงแรม ห้อง วันที่ จำนวนคืน บริการ และยอดรวม
7. กด `ยืนยันและชำระเงิน` เพื่อสร้าง Payment session และไปขั้นตอนชำระเงิน

ผลที่คาดหวัง:

- Booking เปลี่ยนจาก `held` เป็น `pending_payment`
- ระบบสร้างเวลาหมดอายุการชำระใหม่
- ยอดรวม = ค่าห้อง + ค่าบริการ ตาม pricing model
- ชื่อลูกค้าถูกบันทึก

ข้อจำกัดที่ต้องบันทึก:

- เวอร์ชันปัจจุบันรับ `guest_email`, `guest_phone` และ `special_requests` แต่ยังไม่บันทึกลง Booking ดังนั้นการค้นไม่พบข้อมูลสามช่องนี้หลังส่งฟอร์มเป็น Known Gap ไม่ใช่ผลผ่าน

### TC-03 — สร้าง QR และอัปโหลดสลิป

ผู้ทดสอบ: ลูกค้า

1. ตรวจว่ายอดเงินบน QR ตรงกับหน้าสรุป
2. ตรวจ countdown การชำระเงิน
3. เปิดแท็บ `อัปโหลดสลิป`
4. เลือกรูปสลิปทดสอบที่ถูกต้องสำหรับยอด โรงแรม และรายการนี้
5. กด `ยืนยันการชำระเงิน` เพียงครั้งเดียว
6. รอผลตรวจโดยไม่ refresh หน้า

ผลแบบ A — SlipOK ตรวจผ่าน:

- Payment session เปลี่ยนเป็น `paid`
- Booking เปลี่ยนเป็น `confirmed`
- ลูกค้าเห็นข้อความยืนยันและ Booking reference
- รายการ Booking ฝั่งพนักงานแสดงยอดและสถานะ `confirmed`

ผลแบบ B — SlipOK ตอบว่าไม่ตรง:

- Booking เปลี่ยนเป็น `payment_rejected`
- ลูกค้าเห็นข้อความปฏิเสธที่เข้าใจได้
- สลิปเดิมไม่สามารถใช้ยืนยัน Booking อื่นได้

ผลแบบ C — SlipOK/API ใช้งานไม่ได้:

- Booking คงสถานะ `pending_verification`
- ไม่ควรแสดงว่า “ชำระไม่สำเร็จ” แบบเด็ดขาด
- พนักงานเห็นปุ่ม Approve/Reject ในหน้ารายการ Booking

ข้อควรทราบ:

- ระบบ UI ปัจจุบันไม่ได้แสดงรูปสลิปหรือหลักฐานธุรกรรมให้พนักงานในแถว Booking การกด Approve ต้องอาศัยการตรวจยอดจากบัญชีธนาคารหรือ SlipOK dashboard ภายนอก ห้ามอนุมัติโดยเดา
- การสแกน QR เพียงอย่างเดียวไม่มีเส้นทาง webhook ที่พบในโค้ดปัจจุบัน จึงไม่ควรใช้เป็น Golden Path ของการทดสอบ

### TC-04 — พนักงานตรวจ Booking และกรณี Manual Review

ผู้ทดสอบ: พนักงานต้อนรับหรือเจ้าของที่พัก

1. ไปที่ `/hotels/:id/bookings`
2. ค้นหาด้วยชื่อ `UAT SOMCHAI` หรือ Booking ID
3. ตรวจโรงแรม ห้อง วันที่ ยอด Source และสถานะ
4. ถ้าสถานะเป็น `pending_verification` ให้ตรวจหลักฐานจากธนาคาร/SlipOK dashboard ก่อน
5. ถ้าหลักฐานถูกต้อง กด Approve; ถ้าไม่ถูกต้อง กด Reject
6. Refresh และค้น Booking เดิมอีกครั้ง

ผลที่คาดหวัง:

- Approve เปลี่ยนเป็น `confirmed` และ payment status เป็น `verified`
- Reject เปลี่ยนเป็น `payment_rejected` และ payment status เป็น `failed`
- ผู้ใช้ที่ไม่มี `operations.manage_bookings` ต้องไม่สามารถอนุมัติหรือปฏิเสธได้
- Booking ต้องอยู่ในโรงแรมที่เลือกเท่านั้น

### TC-05 — ก่อนวันเข้าพัก

ผู้ทดสอบ: พนักงานต้อนรับ

1. เปิด `/communications?bookingId=<booking-id>`
2. ตรวจว่าระบบเปิด thread ที่ผูกกับ Booking ถูกตัว
3. ส่งข้อความทดสอบ เช่น `UAT PRE-ARRIVAL MESSAGE`
4. ตรวจว่าข้อความยังอยู่หลัง refresh
5. ตรวจหน้า Notification bell

ผลที่คาดหวังตามระบบปัจจุบัน:

- ข้อความในระบบควรถูกบันทึกและแสดงใน thread
- ไม่ควรคาดหวังว่าลูกค้าจะได้รับ Email/SMS/WhatsApp เพราะเวอร์ชันนี้เป็นข้อความภายในระบบ
- Pre-arrival message ยังไม่ถูก schedule อัตโนมัติ แม้มี helper ฝั่ง server
- Notification UI อาจว่าง เพราะยังไม่พบ call site ที่สร้าง notification จากเหตุการณ์ Booking

### TC-06 — Check-in

ผู้ทดสอบ: พนักงานต้อนรับ

1. เปิด Booking สถานะ `confirmed`
2. มองหาคำสั่ง `Check in`
3. ตรวจ network/UI ว่ามีการส่งคำขอเปลี่ยนสถานะหรือไม่

ผลที่คาดหวังในผลิตภัณฑ์ที่สมบูรณ์:

- ผู้มีสิทธิ์ `operations.manage_checkin_checkout` เปลี่ยน `confirmed → checked_in` ได้
- บันทึกผู้ดำเนินการและเวลา Check-in
- ผู้ไม่มีสิทธิ์ทำไม่ได้

ผลที่คาดว่าจะพบในเวอร์ชันปัจจุบัน:

- **BLOCKED:** หน้า Booking แสดงสถานะ `checked_in` ได้เมื่อข้อมูลมีสถานะนี้อยู่แล้ว แต่ไม่มีปุ่มและไม่มี mutation สำหรับทำ Check-in
- บันทึก Defect ID และหยุด Golden Path ที่จุดนี้ ห้ามเปลี่ยน DB production ด้วย SQL เพื่อทำให้ผ่าน

### TC-07 — Check-out และส่งงานแม่บ้าน

ทำขั้นตอนนี้ได้หลัง TC-06 ถูกพัฒนาและผ่านแล้วเท่านั้น

ผลที่คาดหวังในผลิตภัณฑ์ที่สมบูรณ์:

1. Booking สถานะ `checked_in` มีปุ่ม `Check out`
2. กดแล้วเปลี่ยนเป็น `checked_out`
3. บันทึกผู้ดำเนินการและเวลา Check-out
4. ห้องไม่ถูกนับว่าครอง inventory สำหรับช่วงหลังวันออก
5. สร้างหรือเสนอ Housekeeping task สำหรับห้องที่เพิ่ง Check-out
6. พนักงานแม่บ้านเห็นงานใน `/housekeeping` และเปลี่ยน `pending → in_progress → done` ได้
7. เมื่อทำความสะอาดเสร็จ ห้องกลับพร้อมขายตามกติกาของระบบ

ผลที่คาดว่าจะพบในเวอร์ชันปัจจุบัน:

- **BLOCKED:** ไม่มี Check-out action
- Housekeeping board มีงานแบบจัดการแยก แต่ไม่พบการสร้างงานอัตโนมัติจาก Check-out
- หน้า Availability ของพนักงานยังไม่คำนวณจาก Booking lifecycle

## 6. กรณีทดสอบเสริมที่ควรรัน

### TC-N01 — Hold หมดอายุ

1. เลือกห้องให้เกิด `held`
2. ไม่กรอกต่อจน countdown หมด
3. ค้น Booking และลองจองห้อง/วันที่เดิมใหม่

คาดหวัง: Booking เดิมเป็น `expired` เมื่อมี read/write ที่เรียก lazy expiry และห้องกลับมาจองได้

### TC-N02 — เวลาชำระเงินหมด

1. ไปถึง `pending_payment`
2. ไม่ชำระจนหมดเวลา
3. ตรวจหน้า Payment และลองค้นห้องเดิมอีกครั้ง

คาดหวัง: session หมดอายุ, Booking ไม่ควรครอง inventory ต่อ และลูกค้าต้องเริ่มใหม่

### TC-N03 — ใช้สลิปซ้ำ

1. ใช้สลิปที่ผ่านแล้วกับ Booking แรก
2. พยายามใช้สลิปเดียวกันกับ Booking ที่สอง

คาดหวัง: ระบบปฏิเสธด้วย duplicate transaction reference และ Booking ที่สองไม่เป็น `confirmed`

### TC-N04 — แข่งจองห้องสุดท้าย

1. สร้าง Room Type ที่มีห้องว่างเพียง 1 ห้อง
2. เปิด Incognito สองหน้าต่าง เลือกวันที่เดียวกัน
3. กดเลือกห้องเกือบพร้อมกัน

คาดหวัง: สำเร็จเพียงหนึ่ง Booking อีกฝั่งเห็นข้อความว่าห้องไม่ว่างแล้ว

### TC-N05 — แยกข้อมูลระหว่างโรงแรม

1. สร้าง/ใช้ Booking ของ Hotel A
2. เปลี่ยน Workspace เป็น Hotel B
3. เปิด Bookings, Communications, Financials และ Notifications

คาดหวัง: ไม่เห็นหรือแก้ Booking/ข้อความ/การเงินของ Hotel A

## 7. เกณฑ์สรุปผล

| ระดับ | ความหมาย |
|---|---|
| PASS | ทำตามขั้นตอนได้และผลตรงทั้งหมด พร้อมหลักฐาน |
| FAIL | ระบบมีฟังก์ชันแต่ผลผิด, error หรือข้อมูลไม่ถูกต้อง |
| BLOCKED | ฟังก์ชัน/สิทธิ์/การตั้งค่าที่ต้องใช้ยังไม่มี จึงทดสอบต่อไม่ได้ |
| NOT RUN | ยังไม่ได้ทดสอบ |

Golden Path จะถือว่า “ผ่านตั้งแต่จองถึงเช็คเอาต์” ได้เมื่อ TC-00 ถึง TC-07 เป็น PASS ทั้งหมด ปัจจุบันห้ามสรุป PASS ทั้งระบบ เพราะ TC-06 และ TC-07 ยัง BLOCKED โดยการขาด Check-in/Check-out workflow

## 8. แบบฟอร์มบันทึกผล

| Test Case | ผล | Booking ID | เวลา | ผู้ทดสอบ | หลักฐาน/หมายเหตุ |
|---|---|---|---|---|---|
| TC-00 Setup | NOT RUN | — | — | — | — |
| TC-01 Hold | NOT RUN | — | — | — | — |
| TC-02 Guest details | NOT RUN | — | — | — | — |
| TC-03 Payment | NOT RUN | — | — | — | — |
| TC-04 Staff review | NOT RUN | — | — | — | — |
| TC-05 Pre-arrival | NOT RUN | — | — | — | — |
| TC-06 Check-in | BLOCKED | — | — | — | ไม่มี action/mutation ในเวอร์ชันปัจจุบัน |
| TC-07 Check-out | BLOCKED | — | — | — | ไม่มี action/mutation ในเวอร์ชันปัจจุบัน |

## 9. รายการ Defect ที่ควรเปิดก่อนทดสอบซ้ำ

| ลำดับ | ความสำคัญ | ช่องว่าง |
|---|---|---|
| 1 | Blocker | เพิ่ม server-authoritative mutation และ UI สำหรับ `confirmed → checked_in → checked_out` พร้อม permission และ audit log |
| 2 | High | เชื่อม Availability ของพนักงานกับ Booking inventory เพื่อไม่ให้ตัวเลขสองระบบขัดกัน |
| 3 | High | บันทึก `guest_email`, `guest_phone`, `special_requests` ลงฐานข้อมูลและแสดงให้พนักงานที่มีสิทธิ์ |
| 4 | High | แสดงหลักฐานที่จำเป็นสำหรับ Manual Review หรือกำหนดขั้นตอนตรวจจากแหล่งภายนอกอย่างชัดเจน |
| 5 | Medium | เชื่อม Check-out กับ Housekeeping task และสถานะห้อง |
| 6 | Medium | เพิ่ม event producers สำหรับ Notification และ schedule pre-arrival messages |
| 7 | Medium | ถ้าต้องการตรวจ QR อัตโนมัติ ให้เพิ่ม payment-provider webhook/idempotency; อย่าใช้ polling DB อย่างเดียว |

## 10. ไฟล์อ้างอิงสำหรับผู้พัฒนา

- Public booking wizard: `client/src/pages/PublicHotel.tsx`
- Payment QR/Slip upload: `client/src/components/PaymentQR.tsx`
- Staff booking list/manual review: `client/src/pages/Bookings.tsx`
- Booking router: `server/routers/bookingRouter.ts`
- Payment router: `server/routers/paymentRouter.ts`
- Booking database flow: `server/db/booking.ts`
- Booking state model: `shared/bookingLifecycle.ts`
- Availability snapshot: `server/db/availability.ts`, `client/src/pages/Calendar.tsx`
- Communications helper: `server/messaging.ts`
- Housekeeping board: `client/src/pages/Housekeeping.tsx`
