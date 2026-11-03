# Owner UI fix list (2026-11-03)

The owner is reviewing the pages themselves and sends items one by one. Collect them here and fix them as one batch when the owner says the list is done.

## Customer-facing / hotel owner pages

1. **Support access page** (`/hotels/:id/support-access`): fields, key list and history lacked the house structure.
   - Status: done in this working copy. Rebuilt using `page-intro`, panel headings, `form-grid`, status pills, empty states and a responsive history table. Known grant/revoke log actions are translated; other procedure codes stay in a muted tag.
2. **Hotel page footer credit:** Thai "จองผ่าน hayhost" should read "ให้บริการโดย hayhost".
   - Status: done in this working copy for Lanna Teak, Cafe Homestay and Minimal White. `PoweredByHayhost` still links hayhost; English is unchanged.

## Superadmin pages

- PlatformOverview: done in this working copy. Added page intro, panel heading, table wrapper, empty/error states, and dictionary copy for all table/loading/error labels.
- AdminUsers and SupportAccountsPanel: both already use the house-style table/panel patterns; no changes needed in this pass.

## Back-office page/component audit

| File(s) | Problems found | Fixed? |
|---|---|---|
| AccountOnboarding.tsx | Existing house-style page/form patterns | Yes, already compliant |
| AdminUsers.tsx | Existing house-style intro/panels/table/empty state | Yes, already compliant |
| AdvancedPricing.tsx | Missing page-intro / panel-heading vocabulary; UI uses card components | No |
| Bookings.tsx | Existing intro and table wrapper; content panels lack consistent panel-heading | No |
| Calendar.tsx | Existing intro; content panels lack consistent panel-heading | No |
| Communications.tsx | Missing page-intro and house-style panel headings | No |
| Financials.tsx | Missing page-intro / panel-heading vocabulary; card-based layout | No |
| HotelDetail.tsx | Missing page-intro; form/panel heading structure inconsistent | No |
| HotelServices.tsx | Missing page-intro; panel headings inconsistent | No |
| HotelStaff.tsx | Existing intro, panels, table wrappers and empty states | Yes, already compliant |
| Hotels.tsx | Existing intro; record list does not consistently use table-wrap | No |
| Housekeeping.tsx | Missing page-intro / panel-heading vocabulary | No |
| OtaSync.tsx | Missing page-intro / panel-heading vocabulary | No |
| PlatformOverview.tsx | Bare h1, hard-coded labels, no wrapper/empty state | Yes |
| SecuritySettings.tsx | Intro exists; settings children have inconsistent panel heading markup | No |
| SupportAccess.tsx | Loose Tailwind layout, no table, bespoke status colours | Yes |
| WebsiteBuilder.tsx | Missing page-intro / panel-heading vocabulary | No |
| Login.tsx, Signup.tsx, HotelOwnerSignup.tsx, ForgotPassword.tsx, ResetPassword.tsx, AcceptInvite.tsx, MfaEnroll.tsx | Auth layouts are intentionally separate from back-office page patterns; no changes in this pass | Yes, unchanged |
| PrivateRoute.tsx | Two raw English loading/error messages | Yes, moved to i18n |
| DeleteAccountSettings.tsx, LinkedAccountsSettings.tsx, MfaSettings.tsx | Panel patterns present; MFA is feature-gated | Yes, already compliant |
| SlipOkSettings.tsx | Panel heading pattern missing | No |
| SupportAccountsPanel.tsx | Existing panel heading and table pattern | Yes, already compliant |

This pass prioritised the two owner-listed items, PlatformOverview, and the identified raw English in PrivateRoute. The remaining rows marked No still need a follow-up styling pass; the full 375px audit is not complete.
