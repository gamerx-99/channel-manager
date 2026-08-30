# T09-03 — Step-up check สำหรับ SlipOK settings
Status: TODO
Spec: specs/09-authenticator-mfa.md
Owner-tier: worker-code

## Goal
requireRecentMfaVerification() เช็ค AAL2 / เวลาล่าสุด — ใช้กับ Phase 01 SlipOK settings

## Acceptance
- [ ] ถ้าไม่มี factor → พาไป enroll
- [ ] ถ้า expired → challenge TOTP ใหม่
- [ ] เตรียม hook ให้ Phase01 เรียก
