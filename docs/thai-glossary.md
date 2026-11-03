# Thai glossary for hayhost UI copy

Read this before writing or changing any Thai text in `client/src/lib/i18n/th.ts`. The owner approved it on 2026-11-03.
The reasoning behind it is in `docs/research/thai-language-study-2026-11-03.md`.

## Rules

1. Write for a small hotel owner, not a developer. Use words they actually say. Keep it short and direct.
2. Never translate a technical term word by word. First decide what it means on this screen.
3. Brand and product names stay as they are: hayhost, LINE, Google, SlipOK, OTA, iCal, TM.30, PromptPay / พร้อมเพย์.
4. Show dates to Thai readers with the Buddhist year (พ.ศ.).
5. When a new Thai string is added, show the owner a "before → after" table before committing.
6. `client/src/lib/i18n/thaiGlossary.test.ts` fails the build on any banned term below. Add a new banned term there when you add it here.

## Terms by context

| English | Context | Use | Do not use |
|---|---|---|---|
| Live | Website open to the public | เปิดใช้งานแล้ว, ออนไลน์แล้ว | สดแล้ว, ไลฟ์ |
| Live | Data updated immediately | ล่าสุด, อัปเดตทันที | ข้อมูลสด, แบบสด |
| Deploy | Owner makes the site public | เผยแพร่เว็บไซต์, เปิดเว็บไซต์ | ดีพลอย, ปรับใช้ |
| Host | hayhost runs the site for the owner | ดูแลเว็บไซต์ให้, ฝากเว็บ | โฮสต์ให้ |
| Host | The person running the property | เจ้าของที่พัก | โฮสต์ |
| Instance | Any user-facing meaning | รายการ, ครั้ง | อินสแตนซ์ |
| Property | Hotel / homestay | ที่พัก | พร็อพเพอร์ตี้, ทรัพย์สิน |
| Sync | Calendar with OTA | ซิงค์ | ประสานเวลา |
| Support key / grant | Temporary access for the hayhost team | สิทธิ์เข้าช่วยดูแล, อนุญาตให้ทีม hayhost เข้าช่วย | กุญแจ |
| Support team | hayhost staff who help the owner | ทีม hayhost | ทีมช่วยเหลือ (sounds generic) |
| Dashboard | Back-office home | ภาพรวม | แผงควบคุม |
| API | Anything the owner sees | Describe the result, e.g. รับจองจาก OTA โดยตรง | API |
