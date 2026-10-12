# T09-02 — MFA Enroll/Unenroll UI (ทุก role)
Status: TODO
Spec: specs/09-authenticator-mfa.md
Owner-tier: worker-code

## Goal
ให้ทุก user enroll/unenroll TOTP ได้จาก Profile Settings — super_admin/admin เห็น nag ถ้ายังไม่ enroll

## Acceptance
- [ ] ใช้ supabase.auth.mfa.enroll/challenge/verify/unenroll
- [ ] UI ใน ProfileMenu/Settings — ใช้งานได้
- [ ] Test mock Supabase client (vi.mock)
