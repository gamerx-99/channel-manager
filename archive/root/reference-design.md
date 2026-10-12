# Master Reference Design Specification: Editorial Warm Canvas ("Quiet Ledger")

> **วัตถุประสงค์ของเอกสารนี้:**  
> เอกสารฉบับนี้รวบรวม **Design System, Layout Architecture, Component Patterns และ UX Standards** จากระบบจริงของโปรเจกต์ เพื่อใช้เป็นพิมพ์เขียว (Master Blueprint) กลางสำหรับนำไปใช้เป็นมาตรฐาน UX/UI ในการสร้างระบบอื่น ๆ (SaaS, Dashboard, ERP, CRM, Internal Tools) โดยดึงเฉพาะ **Design Language** ที่เป็นกลาง (Domain-Agnostic) ไม่ผูกติดกับ Business Logic เดิม

---

## 1. ปรัชญาการออกแบบ (Design Philosophy & Aesthetic)

ระบบออกแบบภายใต้แนวคิด **"Quiet Ledger" (สมุดบัญชีหรูสไตล์นิตยสาร)** ผสมผสาน **"Modern Craft & Editorial Warmth"**:
* **Warm Paper Canvas**: หลีกเลี่ยงพื้นหลังสีขาวสว่างจ้าหรือสีมืดนีออน โดยเลือกใช้สี **กระดาษอุ่น (`#fbf9f8`)** ให้ความรู้สึกนุ่มนวล สบายตา และมีสมาธิในการอ่านข้อมูลปริมาณมากต่อเนื่อง
* **Charcoal Ink Contrast**: ใช้สีหมึกถ่านชาร์โคลเข้ม (`#1b1c1c`) แทนสีดำสนิท เพื่อลดความกระด้างของตัวหนังสือ
* **Terracotta / Rust Accent**: ใช้สีดินเผาธรรมชาติ (`#954831`) เป็นจุดดึงดูดสายตาหลัก (Primary Call-to-Action) และสภาวะ Active
* **Sage & Amber Telemetry**: สื่อสารสถานะความพร้อมสมบูรณ์ด้วยสีเขียวเสจ (`#56815c`) และสถานะที่ต้องติดตามด้วยสีส้มอำพันอบอุ่น (`#a86a43`)
* **Generous Whitespace & Soft Geometry**: ใช้ระยะเว้นวรรคที่โปร่งสบายตาคู่กับรัศมีความโค้งมนขนาดใหญ่ (Radius 17–18px) และเงาสีน้ำตาลโปร่งแสงที่นุ่มนวล

---

## 2. Design System Tokens (พื้นฐานการออกแบบ)

### 2.1 โทนสีและหน้าที่ (Color Palette & Semantic Roles)

```css
:root {
  /* Canvas & Surfaces */
  --paper: #fbf9f8;             /* พื้นหลังหลักของหน้าจอทั้งหมด (Warm Canvas) */
  --paper-deep: #f0eded;        /* พื้นหลังรอง, สีพื้นแถบตัวกรอง, Avatar พื้นหลัง */
  --white: #ffffff;             /* พื้นหลังการ์ดลอย (Card Surface), Sidebar, Popover */

  /* Ink / Typography */
  --ink: #1b1c1c;               /* สีข้อความหลัก, หัวเรื่อง H1-H3, ตัวเลข KPI */
  --ink-soft: #625d5a;          /* ข้อความคำอธิบาย, Lede, Label ทั่วไป */
  --ink-muted: #8b8582;         /* ข้อความ Meta, วันเวลา, Header ตาราง, Eyebrow */

  /* Primary Brand & Interactive Actions */
  --primary: #954831;           /* ปุ่ม CTA หลัก, เมนูที่ Active, เส้น Focus Ring (Terracotta) */
  --primary-dark: #77311c;      /* ปุ่มตอน Hover / Active */
  --primary-soft: #f7e8e4;      /* พื้นหลังอ่อนของไอคอนปุ่ม, Tag ที่ถูกเลือก */

  /* Strokes & Dividers */
  --rule: #ece8e7;              /* เส้นขอบตาราง, เส้นแบ่งคอลัมน์, เส้นแบ่ง Header */
  --rule-strong: #d9d2ce;       /* เส้นขอบเมื่อต้องการ Contrast ชัดเจน */

  /* Status Tokens */
  --status-live-text: #56815c;  /* สีข้อความสถานะปกติ/เปิดใช้งาน (Sage Green) */
  --status-live-bg: #e8f3e9;    /* พื้นหลังสถานะปกติ */
  --status-warn-text: #a86a43;  /* สีข้อความสถานะรอตรวจ/เตือนล่วงหน้า (Warm Amber) */
  --status-warn-bg: #f8eee5;    /* พื้นหลังสถานะเตือน */
  --status-error-text: #ba1a1a; /* สีข้อความสถานะยกเลิก/ผิดพลาด/จุดแจ้งเตือน (Crimson) */
  --status-error-bg: #fffaf4;   /* พื้นหลังสถานะผิดพลาด */

  /* Elevation & Geometry */
  --shadow: 0 10px 28px rgba(60, 45, 40, 0.055);       /* เงาอบอุ่นนุ่มนวล */
  --shadow-hover: 0 16px 32px rgba(60, 45, 40, 0.1);   /* เงาเมื่อเม้าส์ชี้ */
  --radius-card: 18px;          /* รัศมีการ์ดและพาเนล */
  --radius-button: 11px;        /* รัศมีปุ่มกดและช่องฟอร์ม */
  --radius-pill: 999px;         /* รัศมีแคปซูล (Search bar, Status Badges) */
}
```

### 2.2 ตัวอักษร (Typography)

* **Display & Headings**:
  * ตัวเลือกที่ 1 (Editorial): **`'Fraunces', serif`** (น้ำหนัก 500/600) — เหมาะสำหรับชื่อหน้า Page Header, สถิติ Hero
  * ตัวเลือกที่ 2 (Modern Clean): **`'DM Sans', sans-serif`** (น้ำหนัก 700, `letter-spacing: -0.055em`)
* **Body Text & General UI**:
  * **`'DM Sans', sans-serif`** (หรือ Inter / Sukhumvit / IBM Plex Sans Thai)
  * ขนาด 14px (Line-height 1.5) สำหรับเนื้อหา
  * ขนาด 12px–13px สำหรับตารางข้อมูลและปุ่มกด
* **Eyebrow & Telemetry Labels**:
  * ตัวพิมพ์ใหญ่ เคาะวรรคตัวอักษร: `text-transform: uppercase; letter-spacing: 0.1em - 0.16em; font-size: 10px - 11px; font-weight: 700;`
  * เอกลักษณ์พิเศษ: คั่นด้วยเครื่องหมายปีกกา `[ SECTION · SUBTITLE ]`

### 2.3 ระยะห่างและระบบกริด (Spacing & Grid)
* **Sidebar**: ความกว้างคงที่ `236px` บนหน้าจอเดสก์ท็อป
* **Topbar**: ความสูงคงที่ `76px`
* **Page Content**: ความกว้างสูงสุด `1,420px` จัดกึ่งกลางหน้า Padding ด้านข้าง `44px`
* **Card Internal Padding**: มาตรฐาน `24px` รอบด้าน เพื่อรักษาความโปร่งสบายตา

### 2.4 การตอบสนองตามขนาดหน้าจอ (Responsive Breakpoints)
* **Desktop (> 1120px)**: Sidebar แสดงเต็มความกว้าง, Metric Row 4 คอลัมน์, Content แบ่งสัดส่วน 1.72fr : 0.82fr
* **Tablet (760px – 1120px)**: Metric Row ยุบเป็น 2 คอลัมน์, Content ยุบรวมเป็นคอลัมน์เดี่ยว
* **Mobile (< 760px)**:
  * Sidebar ถูกเลื่อนซ่อนออกนอกหน้าจอ (`transform: translateX(-100%)`)
  * แสดงปุ่ม Hamburger Menu บน Topbar
  * เมื่อกดเปิด เมนูจะสไลด์ออกมาทับหน้าจอพร้อมฉากหลังบังสายตา (`.mobile-scrim`)
  * ตารางข้อมูลยาวเปิด Scroll แนวนอนอัตโนมัติ (`overflow-x: auto`)

---

## 3. Layout System (โครงสร้างระบบหน้าจอ)

### 3.1 สถาปัตยกรรม "Rail-and-Canvas"
```
┌────────────────────────────────────────────────────────────────────────┐
│  SIDEBAR (236px fixed)   │  TOPBAR (Sticky 76px, Blur 14px)            │
│  ──────────────────────  │  [Logo] [Breadcrumbs]   [Search] [+] [🔔] [👤]│
│  [Brand Logo]            ├─────────────────────────────────────────────┤
│  [Workspace Switcher ▾]  │  MAIN CANVAS (Warm Paper #fbf9f8)           │
│                          │  ┌─────────────────────────────────────────┐│
│  • Overview              │  │ Page Header & Eyebrow                   ││
│  • Analytics             │  ├─────────────────────────────────────────┤│
│  • Records               │  │ 4-Column Metric KPI Cards               ││
│  • Operations            │  ├────────────────────────────┬────────────┤│
│  • Settings              │  │ Primary Work Area (1.72fr) │ Side Panel ││
│  ──────────────────────  │  │ (Data Table / Form / Grid) │ (0.82fr)   ││
│  [User Profile Chip]     │  └────────────────────────────┴────────────┘│
└──────────────────────────┴─────────────────────────────────────────────┘
```

1. **Left Sidebar (Navigation Rail)**:
   * **Brand Mark**: ตราสัญลักษณ์สี่เหลี่ยมมนสี Terracotta พร้อมตัวย่อระบบ
   * **Workspace Switcher**: ปุ่มเลือกสาขา/บริบทการทำงานทรงมน มีไอคอนลูกศรชี้ลง
   * **Navigation Links**: เมนูแบ่งเป็นหมวดหมู่ มี Label เล็กสีเทาตัวพิมพ์ใหญ่ เมนูที่เลือกจะมีพื้นหลังสีส้มอ่อน `#f8ebe7` และตัวอักษรสี Terracotta
   * **Bottom User Chip**: ข้อมูลผู้ใช้และปุ่ม Logout อยู่ที่ส่วนล่างสุดของแถบ
2. **Top Utility Bar**:
   * ตรึงอยู่ด้านบนตลอดเวลา (`position: sticky; top: 0; backdrop-filter: blur(14px)`)
   * มี **Breadcrumbs Navigation** แสดงลำดับชั้นของหน้า
   * ฝั่งขวาประกอบด้วย:
     * Capsule Search: ช่องค้นหาแคปซูลขอบมน ค้นหาได้ทันที
     * `+ Add New` Dropdown: ปุ่มด่วนสำหรับสร้างข้อมูลใหม่
     * Notification Bell: กระดิ่งแจ้งเตือนพร้อม Dropdown
     * Language Switcher: สวิตช์สลับภาษา `EN | TH` ทรงแคปซูล
     * User Mini Avatar: รูปโปรไฟล์ย่อสำหรับเปิด Account Menu

---

## 4. Component Patterns (มาตรฐานชิ้นส่วน UI)

### 4.1 Buttons (ปุ่มกด)
* **Primary CTA (`.button-primary`)**:
  * พื้นหลังสีดินเผา Terracotta (`#954831`) ตัวอักษรสีขาว
  * ความสูง 40px, ขอบมน 11px, เงาสีส้มจาง `box-shadow: 0 4px 12px rgba(149, 72, 49, 0.15)`
  * เมื่อ Hover เปลี่ยนเป็นสีเข้ม `#77311c`
* **Quiet / Secondary Button (`.button-quiet`)**:
  * พื้นหลังสีขาว ขอบเส้นบาง `#d9d2ce` ตัวอักษรสีหมึก สำหรับ Action รอง
* **Icon Button (`.icon-button`)**:
  * ปุ่มสี่เหลี่ยมมนขนาด 30x30px ไร้พื้นหลัง สำหรับปุ่ม Action ในแถวตาราง

### 4.2 Metric KPI Cards (การ์ดสถิติ)
* การ์ดสีขาว ขอบมน 18px เงาสีน้ำตาลอ่อน
* มุมขวาบนมีไอคอนขนาด 38x38px ในกรอบพื้นหลังสีอ่อน (Soft Tint)
* ตัวเลขสถิติขนาดใหญ่เด่นชัด (38px–40px, Bold) สี Terracotta
* ป้ายกำกับตัวพิมพ์ใหญ่ เคาะวรรคตัวอักษร
* ด้านล่างมีข้อความสรุปเทรนด์ (เช่น `+12.4% vs last week` สีเขียวเสจ)

### 4.3 Data Table Pattern (ตารางข้อมูลแบบสบายตา)
* **หัวตาราง (`th`)**: ตัวอักษรพิมพ์ใหญ่เคาะวรรค (`letter-spacing: .1em`), สีเทาหมุ่น `#8b8582`, มีเส้นคั่นบางบนและล่าง
* **แถวข้อมูล (`td`)**: มี Padding บน-ล่าง 16px ช่วยให้อ่านง่ายไม่แออัด
* **คอลัมน์สำคัญ**: รหัสรายการแสดงด้วยสี Terracotta ตัวหนา
* **Source Tag**: ป้ายกำกับแหล่งที่มาสีครีม ขอบมน 7px
* **Table Footer**: แถบล่างแสดงจำนวนรายการทั้งหมดและชุดปุ่มเปลี่ยนหน้า Pagination

### 4.4 Badges & Status Pills (ป้ายสถานะ)
* รูปทรงแคปซูลมนกว้าง (`border-radius: 999px; padding: 4px 10px; font-size: 11px;`)
* มี **Pulse Dot ขนาด 6px** อยู่ด้านหน้าข้อความ:
  * **Live / Success**: จุดเขียว พื้นเขียวเสจอ่อน `#e8f3e9` ตัวอักษรเขียว `#56815c`
  * **Pending / Warning**: จุดส้ม พื้นส้มอำพันอ่อน `#f8eee5` ตัวอักษรส้ม `#a86a43`
  * **Error / Closed**: จุดแดง พื้นแดงอ่อน `#fffaf4` ตัวอักษรแดง `#ba1a1a`

### 4.5 Unified Filter Bar (แถบตัวกรองรวมศูนย์)
* รวมช่อง Search, ตัวเลือก Date Range, และ Dropdown Filter ไว้ในพาเนลสีขาวผืนเดียวกัน
* เมื่อคลิกช่องค้นหา (Focus) มีวงแหวนเรืองแสงสีส้มบาง ๆ (`box-shadow: 0 0 0 3px rgba(149, 72, 49, 0.1)`)

---

## 5. UX Patterns & Interaction Guidelines

1. **Context/Workspace Switcher**:
   * สลับบริบทการทำงาน (สาขา, องค์กร, โรงแรม) ได้จากจุดเดียวบน Sidebar โดยระบบจะโหลดข้อมูลทั้งหน้าใหม่ตาม Context ที่เลือก
2. **Non-Intrusive Feedback**:
   * แจ้งผลการทำงานผ่าน Toast Notification (ใช้ Sonner) ที่มุมขวาบน ไม่บล็อกการทำงานของผู้ใช้
3. **Keyboard Accessibility**:
   * ทุก Interactive element มี `:focus-visible` ชัดเจนด้วยเส้นขอบสี Terracotta ห่างจากขอบ 2px
4. **Bilingual Ready**:
   * มี Language Switcher บน Topbar รองรับการสลับภาษาแบบ Dynamic โดยไม่ต้องรีเฟรชหน้าเว็บ

---

## 6. Ready-to-Use Code Artifacts (โค้ดสำหรับนำไปใช้ทันที)

### 6.1 โค้ด CSS Variables & Base Stylesheet (`theme.css`)
```css
@import url('https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,100..1000;1,9..40,100..1000&family=Fraunces:ital,opsz,wght@0,9..144,100..900;1,9..144,100..900&display=swap');

:root {
  --paper: #fbf9f8;
  --paper-deep: #f0eded;
  --white: #ffffff;
  --ink: #1b1c1c;
  --ink-soft: #625d5a;
  --ink-muted: #8b8582;
  --primary: #954831;
  --primary-dark: #77311c;
  --primary-soft: #f7e8e4;
  --rule: #ece8e7;
  --rule-strong: #d9d2ce;
  --status-live-text: #56815c;
  --status-live-bg: #e8f3e9;
  --status-warn-text: #a86a43;
  --status-warn-bg: #f8eee5;
  --status-error-text: #ba1a1a;
  --status-error-bg: #fffaf4;
  --shadow: 0 10px 28px rgba(60, 45, 40, 0.055);
  --shadow-hover: 0 16px 32px rgba(60, 45, 40, 0.1);
  --radius-card: 18px;
  --radius-button: 11px;
  --radius-pill: 999px;
  --font-sans: 'DM Sans', sans-serif;
  --font-serif: 'Fraunces', serif;
}

body {
  margin: 0;
  background-color: var(--paper);
  color: var(--ink);
  font-family: var(--font-sans);
  font-size: 14px;
  line-height: 1.5;
  -webkit-font-smoothing: antialiased;
}

button:focus-visible, a:focus-visible, input:focus-visible, select:focus-visible {
  outline: 2px solid var(--primary);
  outline-offset: 2px;
}

.app-shell { display: flex; min-height: 100vh; background-color: var(--paper); }
.sidebar { position: fixed; top: 0; bottom: 0; left: 0; width: 236px; background: var(--white); border-right: 1px solid var(--rule); padding: 28px 16px 20px; display: flex; flex-direction: column; z-index: 20; }
.main-canvas { width: calc(100% - 236px); margin-left: 236px; min-height: 100vh; }
.topbar { position: sticky; top: 0; height: 76px; padding: 0 44px; background: rgba(255, 255, 255, 0.92); backdrop-filter: blur(14px); border-bottom: 1px solid var(--rule); display: flex; align-items: center; z-index: 10; }
.page-content { padding: 48px 44px 72px; max-width: 1420px; margin: 0 auto; }

.button { display: inline-flex; align-items: center; justify-content: center; gap: 8px; padding: 0 16px; min-height: 40px; border-radius: var(--radius-button); font-size: 13px; font-weight: 600; cursor: pointer; border: 1px solid transparent; transition: all 0.18s ease; }
.button-primary { background-color: var(--primary); color: #fff; border-color: var(--primary); box-shadow: 0 4px 12px rgba(149, 72, 49, 0.15); }
.button-primary:hover { background-color: var(--primary-dark); border-color: var(--primary-dark); }
.button-quiet { background-color: var(--white); color: var(--ink); border-color: var(--rule-strong); }
.button-quiet:hover { background-color: var(--paper-deep); }

.metric-row { display: grid; grid-template-columns: repeat(4, 1fr); gap: 18px; margin-bottom: 36px; }
.metric-card { position: relative; background: var(--white); border-radius: var(--radius-card); padding: 24px; box-shadow: var(--shadow); transition: transform 0.2s ease, box-shadow 0.2s ease; }
.metric-card:hover { transform: translateY(-2px); box-shadow: var(--shadow-hover); }
.metric-icon { position: absolute; top: 24px; right: 24px; width: 38px; height: 38px; border-radius: 10px; background: var(--primary-soft); color: var(--primary); display: grid; place-items: center; }
.metric-label { margin-top: 48px; font-size: 11px; color: var(--ink-soft); text-transform: uppercase; letter-spacing: 0.1em; font-weight: 600; }
.metric-value { margin-top: 8px; font-size: 38px; font-weight: 700; letter-spacing: -0.05em; color: var(--primary); }

.status-pill { display: inline-flex; align-items: center; gap: 6px; padding: 4px 10px; border-radius: var(--radius-pill); font-size: 11px; font-weight: 600; }
.status-pill i { width: 6px; height: 6px; border-radius: 50%; display: inline-block; }
.status-pill.live { background: var(--status-live-bg); color: var(--status-live-text); }
.status-pill.live i { background: var(--status-live-text); }
.status-pill.pending { background: var(--status-warn-bg); color: var(--status-warn-text); }
.status-pill.pending i { background: var(--status-warn-text); }

.data-table-panel { background: var(--white); border-radius: var(--radius-card); box-shadow: var(--shadow); overflow: hidden; }
.data-table { width: 100%; border-collapse: collapse; text-align: left; font-size: 13px; }
.data-table th { padding: 14px 20px; color: var(--ink-muted); font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; font-weight: 600; border-bottom: 1px solid var(--rule); }
.data-table td { padding: 16px 20px; border-bottom: 1px solid var(--rule); color: var(--ink); }
.data-table tbody tr:hover { background-color: #fffaf8; }

@media (max-width: 1024px) {
  .metric-row { grid-template-columns: repeat(2, 1fr); }
  .topbar { padding: 0 24px; }
  .page-content { padding: 32px 24px; }
}

@media (max-width: 768px) {
  .sidebar { transform: translateX(-100%); transition: transform 0.25s ease; }
  .sidebar.is-open { transform: translateX(0); box-shadow: 20px 0 50px rgba(0,0,0,0.15); }
  .main-canvas { width: 100%; margin-left: 0; }
  .metric-row { grid-template-columns: 1fr; }
}
```

### 6.2 Tailwind CSS Configuration (`tailwind.config.ts`)
```typescript
import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        paper: "var(--paper)",
        "paper-deep": "var(--paper-deep)",
        ink: {
          DEFAULT: "var(--ink)",
          soft: "var(--ink-soft)",
          muted: "var(--ink-muted)",
        },
        brand: {
          DEFAULT: "var(--primary)",
          dark: "var(--primary-dark)",
          soft: "var(--primary-soft)",
        },
        rule: {
          DEFAULT: "var(--rule)",
          strong: "var(--rule-strong)",
        },
        status: {
          live: "var(--status-live-text)",
          "live-bg": "var(--status-live-bg)",
          warn: "var(--status-warn-text)",
          "warn-bg": "var(--status-warn-bg)",
          error: "var(--status-error-text)",
          "error-bg": "var(--status-error-bg)",
        },
      },
      fontFamily: {
        sans: ["'DM Sans'", "sans-serif"],
        serif: ["'Fraunces'", "serif"],
      },
      borderRadius: {
        card: "var(--radius-card)",
        button: "var(--radius-button)",
      },
      boxShadow: {
        warm: "var(--shadow)",
        "warm-hover": "var(--shadow-hover)",
      },
    },
  },
  plugins: [],
} satisfies Config;
```
