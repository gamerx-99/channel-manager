# Next phase — waiting for development

Ideas the owner has parked for the next phase (owner, 2026-11-07: "เขียนลิสไว้ไฟล์ใหม่ว่ารอพัฒนาเฟสถัดไป").
Nothing here is started. Before building one, turn it into a spec in `specs/` and get the owner's go-ahead.

| # | Item | Why | Notes so far |
|---|---|---|---|
| 1 | **Sample picture instead of an icon on hotel sites that have no photos yet** | A new hotel's site looks empty (e.g. Postcard theme shows only a building icon, Warm Wood shows a blank hero). | Owner supplied two illustrations on 2026-11-07: a white line drawing on brick red (calm, clearly decorative, can take each theme's colour) and a full-colour room with plants (warmer, but could be mistaken for the real room). Open: which picture per theme, and a hint in the website builder: "ตอนนี้ใช้รูปตัวอย่างอยู่ อัปโหลดรูปจริงเพื่อให้ลูกค้าจองง่ายขึ้น". The full-colour room picture is already used in the hayhost landing hero (`client/public/landing/hero-theme-preview.jpg`). |
| 2 | **hayhost promotion on the booking confirmation page + referral tracking** | Owner wants guests who book through a hotel site to notice hayhost ("จะได้โปรโมท เผื่อลูกค้าจองโรงแรมสนใจผลิตภัณฑ์"). | Done already: the booking page footer shows the hayhost logo linking to hayhostth.com. Parked: a small promotion card on the confirmation step, and a `?ref=` tag on that link so we can count sign-ups that came from hotel booking pages. |
