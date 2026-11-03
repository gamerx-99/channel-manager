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
| AdvancedPricing.tsx | Missing page-intro / panel-heading vocabulary; UI uses card components | Yes — added the shared intro, headed outer panels, and responsive labelled form grid while retaining inner Cards. |
| Bookings.tsx | Existing intro and table wrapper; content panels lack consistent panel-heading | Yes — added house-style headings and status pills to the TM.30 and booking panels. |
| Calendar.tsx | Existing intro; content panels lack consistent panel-heading | Yes — grouped calendar controls, month calendar, and guidance into headed panels. |
| Communications.tsx | Missing page-intro and house-style panel headings | No |
| Financials.tsx | Missing page-intro / panel-heading vocabulary; card-based layout | Yes — added the shared intro, headed summary/report panels, and a responsive PromptPay settings panel with labelled fields. |
| HotelDetail.tsx | Missing page-intro; form/panel heading structure inconsistent | Yes — added the page intro, house-style loading/error states, and headings for the quick-task and setup panels |
| HotelServices.tsx | Missing page-intro; panel headings inconsistent | Yes — added a translated page intro and house-style loading/error panels; property and service sections now have panel headings |
| HotelStaff.tsx | Existing intro, panels, table wrappers and empty states | Yes, already compliant |
| Hotels.tsx | Existing intro; record list does not consistently use table-wrap | Yes — added a directory panel heading and placed the responsive records list inside table-wrap |
| Housekeeping.tsx | Missing page-intro / panel-heading vocabulary | Yes — added the shared intro and headed panels around the date controls, summary, task board, and create form; status uses status pills. |
| OtaSync.tsx | Missing page-intro / panel-heading vocabulary | No |
| PlatformOverview.tsx | Bare h1, hard-coded labels, no wrapper/empty state | Yes |
| SecuritySettings.tsx | Intro exists; settings children have inconsistent panel heading markup | Yes — verified the page intro and existing MFA/linked-account panels; the SlipOK panel heading is now consistent, gates retained |
| SupportAccess.tsx | Loose Tailwind layout, no table, bespoke status colours | Yes |
| WebsiteBuilder.tsx | Missing page-intro / panel-heading vocabulary | Yes — added the shared intro and headed outer panels around hotel actions, selection, summaries, and builder cards; config uses the shared form grid. |
| Login.tsx, Signup.tsx, HotelOwnerSignup.tsx, ForgotPassword.tsx, ResetPassword.tsx, AcceptInvite.tsx, MfaEnroll.tsx | Auth layouts are intentionally separate from back-office page patterns; no changes in this pass | Yes, unchanged |
| PrivateRoute.tsx | Two raw English loading/error messages | Yes, moved to i18n |
| DeleteAccountSettings.tsx, LinkedAccountsSettings.tsx, MfaSettings.tsx | Panel patterns present; MFA is feature-gated | Yes — delete form uses shared form layout; linked accounts and MFA already compliant |
| SlipOkSettings.tsx | Panel heading pattern missing | Yes — added panel heading and shared form grid/submit patterns |
| SupportAccountsPanel.tsx | Existing panel heading and table pattern | Yes, already compliant |

This pass prioritised the two owner-listed items, PlatformOverview, and the identified raw English in PrivateRoute. The remaining rows marked No still need a follow-up styling pass; the full 375px audit is not complete.
