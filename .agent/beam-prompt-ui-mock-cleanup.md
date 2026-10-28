# Beam prompt — UI mock / dead-control / dev-jargon cleanup (ticket UI-01)

Audit done by the orchestrator on 2026-10-27 against `agent-a/next` + Beam's working tree.
Send this to Beam ONLY after the 14-03a fixes are committed and reviewed.

---- PASTE BELOW THIS LINE ----

Ticket UI-01: remove mock UI, dead controls and developer jargon from the hotel-facing web app.

Folder: C:\WORK\channel-manager-a   Branch: agent-a/next
Scope: `client/src/` ONLY. Do not touch `.sql`, `server/`, `worker/`, `shared/`, `wrangler.toml`, `vercel.json`, `.env`.
Do not add new direct supabase-js calls. Do not touch Login/MfaEnroll auth logic (it is replaced later by the Cloudflare migration) — only their display strings.

Goal: everything a hotel owner sees must either work for real or not be shown. "Coming soon" placeholders, buttons that only show a toast, and status badges that are always green are removed. Do NOT build the missing features — remove the placeholder.

## 0. Follow-ups from the 14-03a review (do first, separate commit)
1. `client/src/components/auth/PrivateRoute.tsx` (pending-signup effect):
   - After `completeHotelOwnerSignup` succeeds, invalidate `channelManager.hotels` (and `auth.me`). Otherwise a newly confirmed owner lands on a workspace with no hotel until they refresh.
   - On failure, do not silently discard the token. Show a toast with the error (i18n key) and keep the token only if the error is retryable (network); remove it on a validation/expired-token error.
2. `client/src/pages/Financials.tsx` handleSave: the hard-coded English "MFA enrollment required…" must become an i18n key (th + en).
3. Tests:
   - A PrivateRoute test proving `hotels.invalidate` is called after the pending token completes.
   - A test proving an expired-token error removes the token and shows the error.

## A. Room operations page — `client/src/pages/HotelDetail.tsx` (line ~286, one long JSX line)
1. Delete the whole quick-links panel: `<div className="panel quick-panel">…</div>` (keys `hotelDetail.quickLinks`, `commonTasks`, `updateAvailability*`, `reviewBookings*`). It duplicates the `detail-tabs` nav. Keep the `detail-tabs` nav.
2. Delete the whole checklist panel `<div className="panel checklist-panel">…</div>`: all three rows render `<Check>` unconditionally (fake). Keys: `propertySetup`, `publiclyAvailable`, `privateWorkspace`, `checkMembership*`, `checkInventory*`, `checkPublic`. If `detail-bottom-grid` is then empty, delete the section.
3. In `detail-tabs`, delete the two dead tabs `<a href="#" …>{t('hotelDetail.tabImages')}</a>` and `tabDomains`.
4. Delete the disabled "Edit property" button and the `…` property-actions menu (its only item is the same disabled button + "Coming soon"). Remove the now-unused `propertyActionsOpen` state and imports.

## B. Hotel services page — `client/src/pages/HotelServices.tsx:197-210`
Same as A3 and A4: remove dead Images/Domains tabs, the disabled Edit-property button and the property-actions menu.

## C. Availability calendar — `client/src/pages/Calendar.tsx` (~line 270)
Delete the disabled "View settings" button (`availability.viewSettings`, `viewSettingsTooltip`).

## D. Dashboard — `client/src/pages/Home.tsx`
1. Line ~122: delete the "more quick actions" icon button whose onClick is `toast.info(t('home.moreQuickActionsToast'))`.
2. Line ~138: delete the `task-footer` ("Connected to Supabase" + "Live query" signal). It is a fake status indicator.

## E. Topbar — `client/src/components/layout/Topbar.tsx:104-108`
Delete the `topbar-search` label/input. It has no onChange/onSubmit — typing does nothing. (Bookings page has its own working search; leave that.)

## F. Sidebar — `client/src/components/layout/Sidebar.tsx`
1. Line ~149: delete the super-admin "Payments" button that only shows `sidebar.paymentsComingSoon`.
2. Line ~207: delete the "Exports" `<a href="#">` that only shows `sidebar.exportsPrompt` (TM.30 export already lives on each hotel's Bookings page).

## H. Remove the Channel analytics page (owner decision 2026-10-28)
It is a cross-hotel portfolio view; super admin must not see hotel-internal data, and hotel owners don't need it now.
1. `client/src/components/layout/Sidebar.tsx:81`: delete the `/dashboard/channels` nav item (keep the Overview `/dashboard` item).
2. `client/src/App.tsx:44-46`: delete the `/dashboard/channels` route and the `ChannelPerformance` import.
3. `client/src/components/layout/Topbar.tsx:22`: delete the `/dashboard/channels` breadcrumb entry.
4. Delete `client/src/pages/ChannelPerformance.tsx` and its tests/contract tests, plus the `channelPerformance` / `sidebar.channelAnalytics` / `breadcrumb.channelAnalytics` i18n keys in th.ts and en.ts.
5. Do NOT touch `server/` (the `channelPerformance` procedure is handled in the Cloudflare migration).
6. Contract test: App.tsx and Sidebar.tsx no longer contain `/dashboard/channels`. If an existing test asserted the route exists, list it in the handoff as obsolete because of this owner decision.

## G. Developer jargon in UI strings — `client/src/lib/i18n/th.ts` and `en.ts`
Rewrite every user-visible string that mentions implementation details into plain hotel-owner language, or delete the string (and its usage) if it carries no information for the user. Examples to fix: "สดจาก Supabase", "ปกป้องด้วย RLS", "บัญชีรายชื่อสมาชิก RLS", "ผู้ใช้ Supabase", Login `securityNote`, Hotels `stripCaption`/`footnote`, WebsiteBuilder `lede` (mentions saveHotelSiteConfig/getHotelSiteConfig, hero_copy, accent_color, visible_sections) and `publicHotelFallbackNote` (mentions PublicHotel.tsx).
EXCEPTION: skip `client/src/pages/WebsiteBuilder.tsx` and the `websiteBuilder.*` keys entirely. That page will be replaced by a theme picker (spec 16), so do not spend time on it. Exclude those keys from the acceptance rg by running it with `| grep -v websiteBuilder`. If grep is unavailable, list the remaining websiteBuilder hits in your report.
Good replacement style: "ข้อมูลของโรงแรมคุณเห็นได้เฉพาะทีมของคุณ" instead of "ปกป้องด้วย Supabase RLS". Do not mention any vendor or table/function name.
Change values only; keep keys unless you also delete the usage. Delete keys that become unused in BOTH th.ts and en.ts.

Acceptance check (must print nothing):
  rg -n -i "supabase|\brls\b|row level|hotel_site_config|saveHotelSiteConfig|getHotelSiteConfig|PublicHotel\.tsx|hero_copy|accent_color|visible_sections|hotel_users|postgres" client/src/lib/i18n
  rg -n "href=\"#\"|comingSoon|ComingSoon|toast\.info\(t\(['\"](home\.moreQuickActionsToast|sidebar\.paymentsComingSoon|sidebar\.exportsPrompt)" client/src --glob "!**/*.test.*"

## Tests (required)
- Add string-contract tests (pattern: `client/src/pages/Financials.contract.test.ts`) asserting the removed markers are GONE:
  HotelDetail (`quick-panel`, `checklist-panel`, `tabImages`, `tabDomains`, `editPropertyTooltip`), HotelServices (`tabImages`, `tabDomains`, `editPropertyTooltip`), Calendar (`viewSettingsTooltip`), Home (`moreQuickActionsToast`, `connectedToSupabase`), Topbar (`topbar-search`), Sidebar (`paymentsComingSoon`, `exportsPrompt`), and an i18n test that fails if any th.ts/en.ts value outside the `websiteBuilder` group contains `Supabase` or `RLS`.
- Each new test must FAIL before your change. Run it once before editing and paste that failing output.
- The passing test count must rise above the count after 14-03a (paste before/after numbers).
- If an existing test asserts something you removed, do NOT loosen it silently: list the test, the assertion and why it is obsolete in the handoff.

## NOT A BUG escape hatch
If any item above is actually wired to a real feature (e.g. a button really calls a mutation), do not remove it. Write "NOT A BUG: <file:line> — <what it really does>" in your report and skip it.

## Definition of done
- `pnpm test` and `pnpm check` pass; paste the real output (pass counts).
- `pnpm build` passes.
- Both acceptance `rg` commands print nothing (paste).
- One commit per section is fine (A–G), conventional messages, e.g. `fix(ui): remove fake setup checklist from room operations (UI-01)`.
- `.agent/handoff.md` entry. Do not push. Do not merge.
