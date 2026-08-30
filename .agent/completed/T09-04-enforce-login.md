# T09-04 — Enforce MFA ที่ Login สำหรับ platform roles
Status: TODO
Spec: specs/09-authenticator-mfa.md
Owner-tier: worker-code

## Goal
super_admin/admin ถ้าไม่มี factor → block login และพาไป enroll (ไม่ bypass)

## Acceptance
- [ ] Login หลัง verify password เช็ค MFA factor — ถ้าขาด → enroll flow
- [ ] Test: super_admin ไม่มี factor → redirect enroll
- [ ] pnpm test/check/build ผ่าน
