# ตั้งค่าการเข้าสู่ระบบด้วย Google, Facebook และ LINE

เอกสารนี้สำหรับเจ้าของระบบ ทำทีละเจ้าได้ เจ้าไหนยังไม่ใส่ค่า ปุ่มของเจ้านั้นจะไม่แสดง และระบบส่วนอื่นใช้งานได้ตามปกติ

## Callback URL ที่ต้องใช้

| เจ้า | Staging | Production |
| --- | --- | --- |
| Google | `https://hayhost-stage.lannatc.workers.dev/api/auth/callback/google` | `https://www.hayhostth.com/api/auth/callback/google` |
| Facebook | `https://hayhost-stage.lannatc.workers.dev/api/auth/callback/facebook` | `https://www.hayhostth.com/api/auth/callback/facebook` |
| LINE | `https://hayhost-stage.lannatc.workers.dev/api/auth/callback/line` | `https://www.hayhostth.com/api/auth/callback/line` |

ระบบสร้าง callback จากโดเมนที่ผู้ใช้เปิดอยู่ ถ้าเปิดผ่าน `https://hayhostth.com` (ไม่มี www) จะไม่ตรงกับตารางนี้ และผู้ให้บริการจะปฏิเสธ ให้ตั้ง redirect จากโดเมนนั้นไป `www` ก่อนเปิดปุ่มบน production

## Google

1. เปิด [Google Cloud Console](https://console.cloud.google.com/) แล้วสร้างหรือเลือกโปรเจกต์
2. ไปที่ Google Auth Platform ตั้งค่าหน้าขอความยินยอม เลือกแบบ External ใส่ชื่อแอป hayhost และอีเมลติดต่อ
3. ที่ Data Access เลือกเฉพาะ `openid`, `email`, `profile`
4. ไปที่ Clients แล้วสร้าง OAuth client แบบ Web application
5. ใส่ Authorized redirect URIs ทั้งสองแถวของ Google จากตารางข้างบน
6. เก็บ Client ID และ Client secret
7. เมื่อทดสอบผ่าน ให้กด Publish app เพื่อให้คนทั่วไปใช้ได้

## Facebook

1. เปิด [Meta for Developers](https://developers.facebook.com/) แล้วสร้างแอปแบบ Facebook Login สำหรับผู้บริโภค
2. เพิ่มผลิตภัณฑ์ Facebook Login ในแอป
3. ที่ Settings ของ Facebook Login ใส่ Valid OAuth Redirect URIs ทั้งสองแถวของ Facebook จากตารางข้างบน
4. ที่ App settings > Basic ใส่ลิงก์นโยบายความเป็นส่วนตัวและคัดลอก App ID กับ App secret
5. เปลี่ยนแอปเป็นโหมด Live เมื่อทดสอบผ่าน

ระบบขอแค่ `public_profile` ไม่ขออีเมล ดูเหตุผลใน `specs/18-social-signup.md`

## LINE

1. เปิด [LINE Developers Console](https://developers.line.biz/console/) แล้วสร้าง Provider
2. สร้าง Channel แบบ LINE Login เลือก Web app
3. ที่แท็บ LINE Login ใส่ Callback URL ทั้งสองแถวของ LINE จากตารางข้างบน
4. ที่แท็บ Basic settings คัดลอก Channel ID และ Channel secret
5. เปลี่ยนสถานะ Channel เป็น Published เมื่อทดสอบผ่าน

ไม่ต้องขอสิทธิ์อีเมลจาก LINE ระบบใช้แค่ `openid` กับ `profile`

## ใส่ค่าใน Worker

รันคำสั่งเองในเครื่องของคุณ ใส่เฉพาะเจ้าที่พร้อม และเปลี่ยน `staging` เป็น `production` เมื่อจะเปิดจริง แต่ละคำสั่งจะถามค่าให้วางลงไป

```bash
pnpm exec wrangler secret put GOOGLE_CLIENT_ID --env staging
```

```bash
pnpm exec wrangler secret put GOOGLE_CLIENT_SECRET --env staging
```

```bash
pnpm exec wrangler secret put FACEBOOK_CLIENT_ID --env staging
```

```bash
pnpm exec wrangler secret put FACEBOOK_CLIENT_SECRET --env staging
```

```bash
pnpm exec wrangler secret put LINE_CLIENT_ID --env staging
```

```bash
pnpm exec wrangler secret put LINE_CLIENT_SECRET --env staging
```

ต้องมีครบทั้งคู่ของเจ้านั้น ปุ่มจึงจะแสดง งานนี้ไม่มี migration

## ทดสอบหลังใส่ค่า

1. เปิด `/signup` ในหน้าต่างไม่ระบุตัวตน แล้วกดสมัครด้วยเจ้าที่ตั้งค่า ต้องกลับมาที่ฟอร์มข้อมูลโรงแรมโดยไม่ถามรหัสผ่าน
2. กรอกข้อมูลโรงแรมให้จบ แล้วต้องไปถึง `/dashboard`
3. ออกจากระบบ แล้วเข้าใหม่ด้วยเจ้าเดิมที่ `/login` ต้องถึง `/dashboard` ทันที
4. ลองเข้าด้วย Google โดยใช้อีเมลที่สมัครด้วยรหัสผ่านไว้ ต้องเห็นข้อความให้เข้าด้วยรหัสผ่านก่อน
5. เข้าด้วยรหัสผ่าน ไปที่หน้าความปลอดภัย กดเชื่อม Google แล้วออกจากระบบและเข้าด้วย Google ต้องเข้าบัญชีเดิม
