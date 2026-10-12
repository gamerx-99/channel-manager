# UI Reference Findings

แหล่งอ้างอิง: `/home/ubuntu/upload/stitch_siam_stay_manager(3).zip`

## Dashboard reference

หน้า dashboard ใช้ layout แบบ fixed left sidebar สีขาวกว้างประมาณ 210–220px และ canvas หลักพื้นขาวอมเทาอ่อน มี header ด้านบนที่มี hotel switcher, search, add new, notification และ system admin profile. Typography เป็น sans rounded/soft สำหรับ body และ heading หนักแต่เรียบง่าย. Accent หลักเป็น terracotta/rust (#954831 หรือโทนใกล้เคียง) ควบคู่กับ sage/olive สำหรับ status. Metric cards มีพื้นที่ว่างสูง, ไอคอนเล็กใน soft tint, ตัวเลขใหญ่ และ label แบบ uppercase letter-spaced. รายการ recent arrivals เป็น white rounded cards ที่มี thumbnail/avatar, guest, booking ID, property, status pill และเวลา. มี quick access card ฝั่งขวาและ footer links.

## Bookings reference

หน้า bookings คง sidebar เดิมและใช้ header ที่มี brand, hotel switcher, add new, notification และ profile. Content มี heading ใหญ่, subtitle, ปุ่ม `Export TM.30` แบบ neutral และ `Add Booking` แบบ terracotta. Search/filter bar เป็นแถบ white rounded ขอบบาง แยก search, date range และ status selector ด้วย vertical dividers. ตารางใช้ header ตัวพิมพ์ใหญ่ letter-spaced และแต่ละ booking เป็น card/row สีขาว มี radius มากขึ้น, shadow เบา, guest + booking ID, room, date range, status pill, source และ actions. Footer มีจำนวนรายการและ pagination.

## Design tokens from reference

Professional variant ใช้ background `#f4fafd`, on-surface `#161d1f`, primary teal `#00535b`, secondary terracotta `#8c4e35`, soft surface containers `#eef5f7`–`#dde4e6`. Dashboard Het Jom Gun variant ใช้ background `#fbf9f8`, primary rust `#954831`, secondary sage `#516350`, surface containers `#f0eded`–`#e4e2e1`, outline `#87726d`. Current project Quiet Ledger already has compatible paper/pine tokens, so visual refactor should preserve the editorial language while shifting key interactive accents toward terracotta and using larger, softer rounded cards.

## Implementation direction

ปรับ `App.tsx` ให้ header/sidebar ใช้คำและลำดับ navigation ตาม reference โดยไม่เปลี่ยน routing. ปรับ `index.css` เป็น token-driven hybrid ของ Quiet Ledger + Het Jom Gun reference: warm paper canvas, white sidebar/panels, terracotta primary actions, sage status, rounded controls, responsive collapse. ปรับ `Home.tsx`, `Hotels.tsx`, `HotelDetail.tsx`, `Bookings.tsx`, `Calendar.tsx`, `Login.tsx` ตามความจำเป็น โดยคงข้อมูล mock, auth hooks และเส้นทางเดิม.
