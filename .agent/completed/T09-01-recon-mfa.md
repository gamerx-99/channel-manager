# T09-01 — Recon + ตัดสินใจ MFA enforce model
Status: TODO
Spec: specs/09-authenticator-mfa.md
Owner-tier: worker-code
Depends on: —

## Goal
Recon Supabase MFA API จริง (supabase.auth.mfa.* + AAL) และตัดสินใจ blocking vs grace-period สำหรับ super_admin/admin

## Acceptance
- [ ] อ่าน supabase-js MFA docs/code + ตรวจสอบ Login.tsx ปัจจุบัน
- [ ] ตัดสินใจ blocking (prefer) และบันทึกใน DECISIONS.md
- [ ] อัปเดต OPEN_QUESTIONS.md ถ้ามี
- Files: DECISIONS.md, .agent/recon/REPORT.md (append) — ไม่แตะ production code
