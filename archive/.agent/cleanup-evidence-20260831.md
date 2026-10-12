# Repository Cleanup — Evidence Check Report
**Repo:** `D:\system make\channel-manager-mvp-latest` | **Date:** 2026-08-31 | **Mode:** EVIDENCE ONLY — ห้ามลบ/ย้าย/แก้/commit/push

**หลักฐาน 7 ด้านต่อไฟล์:** Reference / Runtime / Build / Test / Script / Git history / Purpose
**กฎ:** TRACKED ≠ SAFE TO DELETE · UNTRACKED ≠ JUNK · ครบทุกหลักฐานเท่านั้นถึงเสนอ DELETE

---

## A. SAFE-CANDIDATE (หลักฐานครบ — รอ operator approval ก่อนลบ)

```
FILE: build.log … typecheck5.log (29 ไฟล์ *.log ที่ root — รายการด้านล่าง)
STATUS: SAFE-CANDIDATE
EVIDENCE:
- Reference:  grep ทั้ง repo (ยกเว้น node_modules/.git/dist) → (none); "build.log"
  ที่ match คือคำว่า "historical build log" ในเอกสาร (todo.md) ไม่ใช่ไฟล์นี้
- Runtime:    ไม่มี — ไม่ถูก import/require/open ในโค้ดใด
- Build:      ไม่มี — ไม่อยู่ใน package.json scripts, vite.config, esbuild
- Test:       ไม่มี — vitest.config ไม่อ้างอิง
- Script:     ไม่มี — scripts/*.mjs (14 ไฟล์) ไม่มีตัวไหนอ้างอิง
- Git history: untracked, ไม่เคยถูก commit (git log --all → none)
- Purpose:    transient output ของ pnpm install/build/test/typecheck เมื่อ 2026-08-25
  (น่าจะเกิดจาก run ครั้งเดียว — ดู timestamp ต่อเนื่อง 22:40→23:14)
REASON: ไฟล์ log ชั่วคราว ไม่ถูกอ้างอิง ไม่มีประวัติ git ไม่มีผลต่อ runtime/build/test
  **ข้อควรระวัง:** .gitignore มี `*.log` อยู่แล้ว → ไฟล์พวกนี้ untracked โดยตั้งใจ;
  ลบได้ปลอดภัย แต่ถ้าไม่ลบ git ก็ไม่เห็นอยู่แล้ว (priority ต่ำ)
```

รายการ 29 ไฟล์: `build.log, crossenv.log, crossenv2.log, diffcheck.log, final-build.log, final-build2.log, final-install.log, final-prettier.log, final-test.log, final-test2.log, final-typecheck.log, final-typecheck2.log, install.log, install2.log, install3.log, install4.log, lock-update.log, prettier-check.log, prettier-write.log, smoke-server.err.log, smoke-server.out.log, test.log, test2.log, test3.log, typecheck.log, typecheck2.log, typecheck3.log, typecheck4.log, typecheck5.log`

```
FILE: .agent/logs/opencode-run-20260831.log, .agent/logs/opencode-run-ollama-20260831.log
STATUS: SAFE-CANDIDATE
EVIDENCE:
- Reference: (none) | Runtime: none | Build: none | Test: none | Script: none
- Git history: untracked, none | Purpose: run logs ของ opencode orchestration วันนี้
REASON: เหมือนกลุ่มข้างบน แต่อยู่ใต้ .agent/ — เก็บไว้ช่วย debug run ล่าสุดก่อนได้
```

```
FILE: CLAUDE.md.bak
STATUS: SAFE-CANDIDATE (ยืนยัน backup ปัจจุบันก่อน)
EVIDENCE:
- Reference: (none — grep พบเฉพาะ CLAUDE.md.bak ไม่มีใครอ้างถึง)
- Runtime/Build/Test/Script: none | Git history: untracked, none
- Purpose: backup ของ CLAUDE.md (timed model switch procedure, per channel-manager-ops skill)
REASON: มีวัตถุประสงค์จริง (rollback path สำหรับ model switch) — แต่ถ้า CLAUDE.md
  ปัจจุบัน stable แล้ว .bak ลบได้; **หมายเหตุ:** .gitignore มี `*.bak` → untracked ตามเจตนา
```

---

## B. REVIEW-REQUIRED (หลักฐานไม่ครบ / ขัดกัน — ต้องตัดสินใจก่อน)

```
FILE: .gitkeep (root, 0 bytes, TRACKED)
STATUS: REVIEW-REQUIRED
EVIDENCE:
- Reference: (none) | Runtime/Build/Test/Script: none
- Git history: เพิ่มใน d9c5a62 "chore: remove Manus runtime dependencies"
- Purpose: เก็บ dir ว่าง — แต่อยู่ที่ repo ROOT ซึ่งมีไฟล์อยู่แล้ว → ไม่มีผลใดๆ
REASON: หลักฐานชี้ว่าไม่จำเป็น แต่ถูกเพิ่มโดยเจตนาใน commit ใหญ่ — operator ยืนยัน
```

---

## C. KEEP (หลักฐานชัดว่ากำลังใช้งาน)

```
FILE: client/src/contexts/HotelContext.tsx (+ .test.tsx), server/channelManager.dashboard.test.ts
STATUS: KEEP — untracked ≠ junk
EVIDENCE:
- Reference: ถูกเรียกใช้โดย App.tsx, DashboardCalendarView, Bookings, Calendar,
  Financials, Home (ทั้งหมดอยู่ใน working tree ที่ modified อยู่)
- Runtime: ใช่ — เป็นส่วนหนึ่งของ React tree | Test: ใช่ — มี test file คู่
- Git history: ไฟล์ใหม่ (untracked) ของ feature ที่กำลังทำอยู่
REASON: งานค้างใน working tree (12 modified files + 3 untracked) = feature ที่ยัง
  ไม่ commit — ห้ามแตะเด็ดขาด
```

```
FILE: vitest.setup.ts, patches/wouter@3.7.1.patch, scripts/*.mjs (14), drizzle/, api/, dist/
STATUS: KEEP
EVIDENCE: vitest.setup.ts ถูกอ้างใน vitest.config.ts:17; patches/ ใช้โดย pnpm
  patchedDependencies; scripts/ มี runPhase10Oneshot.mjs ที่ commit ล่าสุดอ้างถึง;
  dist/ = build output (gitignored แต่จำเป็นต่อ vercel serverless api/index.ts)
```

```
FILE: *.md ทั้ง 18 ไฟล์ที่ root (TRACKED ทั้งหมด — AGENTS/CLAUDE/DECISIONS/todo/specs …)
STATUS: KEEP
REASON: เป็นเอกสาร governance ของ workflow นี้ (AGENTS.md อ้างถึง todo.md,
  .agent/handoff.md อ้าง specs) — ลบ = ทำลาย institutional memory
```

---

## D. SECURITY / MIGRATION — DO NOT TOUCH

| ไฟล์ | เหตุ |
|---|---|
| `.env` | BANNED_ZONE — มี real secrets |
| `vercel.json` | BANNED_ZONE — เคยทำ production down 2 ครั้ง |
| `pnpm-lock.yaml` | BANNED_ZONE |
| `2026*.sql` (10 migrations) + `verify_*.sql` (10) | BANNED_ZONE — applied migrations = historical record |
| `supabase_migration_production.sql` (35KB) | production migration record |
| `PHASE10_*.sql`, `PHASE10_PRODUCTION_SECURITY_REPORT.md` | RLS/security closure — commit ล่าสุด (6e7b429) |
| `.agent/BANNED_ZONE.md` ทั้งรายการ | — |
| `node_modules/`, `dist/` | generated — แต่ dist จำเป็นต่อ deploy, ห้ามลบมือ |

---

## Cleanup Manifest สรุป

| กลุ่ม | จำนวน | การกระทำที่เสนอ |
|---|---|---|
| **A. SAFE-CANDIDATE** | 31 ไฟล์ (29 root *.log + 2 .agent/logs) + CLAUDE.md.bak | ลบได้เมื่อ operator approve (priority ต่ำ — git ไม่เห็นอยู่แล้วเพราะ .gitignore) |
| **B. REVIEW-REQUIRED** | 1 ไฟล์ (.gitkeep) | operator ยืนยัน |
| **C. KEEP** | ที่เหลือทั้งหมด | ห้ามแตะ |
| **D. SECURITY/MIGRATION** | ตามตาราง | ห้ามแตะเด็ดขาด |

**คำเตือนระดับ repo:** working tree มี 12 modified + 3 untracked ที่ยังไม่ commit —
cleanup ใดๆ ควรรอจน feature ปัจจุบันถูก commit ก่อน เพื่อให้ git diff ของ cleanup สะอาด

**STOP — รอ Operator Approval**
