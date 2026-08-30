# Project TODO — Phased Completion Model

## Phase 1: Authentication, Roles, Admin Users, and UI Interactivity (Current Active Phase)
- [x] Audit database roles (`super_admin`, `hotel_owner`), RLS, and router validation
- [x] Implement backend queries and mutations for list, invite, assign, and remove
- [x] Build responsive Admin Users management UI
- [x] Add server-side bootstrap/membership assignment for test accounts (`test@msn.com` as hotel_owner for Little Bro)
- [x] Run full automated test suite for Phase 1 and verify zero test regressions
- [x] Fix Header "+ Add new" button dropdown / modal action for creating bookings, room types, or hotels
- [x] Fix User Profile dropdown menu (Account Settings, Role display, Sign out)
- [x] Fix Workspace Switcher dropdown menu (Workspace / hotel scope selection)
- [x] Fix Quick Access widgets / cards deep links and `...` actions to navigate to real functional pages
- [x] Wire Supabase session / hotel permissions into header and switcher states
- [x] Complete browser verification of interactive UI shell and save Phase 1 checkpoint

## Phase 2: Room Type Management
- [x] Implement secure `updateRoomType` and `deleteRoomType` mutations in `routers.ts`
- [x] Wire edit and delete dialogs/actions into `HotelDetail.tsx` with validation
- [x] Add Vitest regression tests for room type update/delete permissions and RLS scoping
- [x] Verify room type management in the browser and save Phase 2 checkpoint

## Phase 3: Room, Availability, and Booking Operations
- [x] Verify room assignment and availability calendar UI/backend sync
- [x] Test manual booking creation and conflict checks
- [x] Save Phase 3 checkpoint

## Phase 4: Guest Data and TM.30 Export
- [x] Verify guest registration schema and fields
- [x] Run TM.30 golden-file tests against official template requirements
- [x] Save Phase 4 checkpoint

## Phase 5: Public Hotel Experience and Production QA
- [x] Verify public hotel pages (`/hotels/[id]` or slug routes) under RLS / public RPC
- [x] Run final production build and sanity checks
- [x] Save Phase 5 checkpoint

- [x] Fix room type ellipsis action button so it reliably opens the Edit/Delete menu after room type data loads or changes
- [x] Add regression coverage for room type action-menu trigger accessibility and interaction state
- [x] Re-run browser verification for room type action menu after the fix

- [x] Replace the workspace switcher alert with an accessible workspace/hotel dropdown and verify it in browser

## Phase 4: TM.30 Date Format Normalization (DD/MM/YYYY)
- [x] Update booking and guest form inputs, placeholders, and date pickers to use DD/MM/YYYY with 4-digit A.D. years
- [x] Implement robust date parsing and formatting utilities for ISO 8601 (YYYY-MM-DD) <-> DD/MM/YYYY conversion
- [x] Ensure TM.30 export service generates files matching the official Immigration Bureau DD/MM/YYYY standard
- [x] Add golden-file Vitest regression tests for TM.30 date serialization
- [x] Verify TM.30 date inputs and export in browser and save checkpoint

## Phase 4 Additions: TM.30 Preview and Date Guidance Tooltips
- [x] Add `previewTm30` procedure or helper to return structured rows matching official TM.30 columns for preview
- [x] Add Preview TM.30 button and modal table in `Bookings.tsx` displaying exact exported values
- [x] Add clear tooltips / helper text to date inputs in `Bookings.tsx` specifying DD/MM/YYYY (A.D.) standard
- [x] Verify preview table and date tooltips in browser and run tests

## Dashboard OTA Widget Additions
- [x] Add summary query endpoint for OTA connections across accessible hotels in tRPC
- [x] Create OTA Status Summary widget in `Home.tsx` with channel badges, last sync times, and direct links to OTA Sync
- [x] Add unit test coverage for OTA summary router procedure
- [x] Verify dashboard OTA widget in browser and save checkpoint
- [x] Add per-channel "Sync Now" buttons, color-coded health indicators (green/red), recent synced booking counts, failure warnings, and log access in OTA Widget

## Sync Now Loading & Toast Additions
- [x] Add per-card loading state for Sync Now action in `Home.tsx`
- [x] Integrate toast notifications (using sonner or shadcn toast / local state banner) for success and error feedback
- [x] Verify loading spinner and non-blocking toast notifications in browser and run test suite

## Toast Retry Action Additions
- [x] Extract reusable handleSync function supporting retry parameter in `Home.tsx`
- [x] Add Retry button action inside `toast.error` configuration for failed synchronizations
- [x] Verify retry flow and toast button interactivity in browser and run test suite

## View Logs Button Additions
- [x] Enhance "View Logs" (or "ดูประวัติการซิงก์") action button in OTA dashboard card with clear icon and label in `Home.tsx`
- [x] Ensure OtaSync page (`OtaSync.tsx`) highlights error details and processing metadata clearly for each hotel connection
- [x] Verify log navigation and RLS-scoped error inspection in browser and run test suite

## Log Detail Modal Additions
- [x] Add selectedLog state and detail modal to `OtaSync.tsx` showing formatted JSON payload and error message
- [x] Add interactive "View Details" (ดูรายละเอียด) action button or click handler on each log row
- [x] Verify log detail modal interactivity in browser and run test suite

## Role Separation and OTA Calendar-Only Refactoring
- [x] Audit and document Super Admin vs Hotel Admin/Owner role-permission matrix
- [x] Refactor OTA service to focus exclusively on calendar iCal / availability sync (removing full booking API / multi-OTA full sync clutter)
- [x] Refactor server guards and tRPC routers so hotel admins cannot access platform super-admin functions and super admins see global scope cleanly
- [x] Adjust sidebar and navigation visibility according to role
- [x] Run test suite and verify authorization boundaries

## Hotel Admin UI Review & Refactor
- [x] Provide final code evidence for hotel-admin shell/navigation and role boundaries matching operational references
- [x] Verify per-page PageState and loading/empty/error coverage across Home, Bookings, Calendar, HotelDetail, and OtaSync
- [x] Confirm all unsupported modules (payments, website builder, booking engines, communications, housekeeping, advanced pricing) as gated placeholders
- [x] Verify responsive layout, keyboard access, date formatting, RLS-scoped data, and browser flows for hotel_owner and super_admin

## Workspace Dropdown Sidebar Fix
- [x] Fix Workspace dropdown background, stacking order, and positioning so it does not visually collide with primary navigation

## Hotel Admin UI Follow-up Findings
- [x] Gate profile menu actions by role and make hotel-owner labels property-specific
- [x] Make iCal URL drafts independent per OTA provider and align copy/error states with calendar-only scope

## Hotel Admin Verification Follow-up
- [x] Add frontend route-level role/property guard for admin pages so direct URLs do not render out-of-scope hotel data
- [x] Normalize booking created-at display to an explicit DD/MM/YYYY format

## Security Review Follow-up
- [x] Deny unknown or missing roles on all private routes by default and add regression coverage

## TM.30 Preview Export Additions (CSV & PDF)
- [x] Add Download CSV button and handler in TM.30 preview modal (`Bookings.tsx`)
- [x] Add Export PDF / Print button and handler in TM.30 preview modal (`Bookings.tsx`)
- [x] Verify CSV and PDF export functionality and date format (DD/MM/YYYY) compliance

## Dropdown Surface and Neutral Form Values
- [x] Standardize every three-dot/action/profile/workspace/add dropdown with an opaque surface, consistent z-index, collision-safe placement, and keyboard dismissal
- [x] Remove property-specific sample values from create/edit form defaults and replace them with neutral placeholders without changing persisted records
- [x] Add regression coverage and verify mobile rendering for all affected menus and forms

## Code Review Follow-up
- [x] Verify responsive layout, keyboard access, date formatting, RLS-scoped data, and browser flows for hotel_owner and super_admin

## TM.30 Preview Export Additions
- [x] Add CSV export action to the TM.30 preview modal
- [x] Add print/PDF export action to the TM.30 preview modal
- [x] Preserve DD/MM/YYYY (A.D.) date formatting in CSV and PDF output
- [x] Verify export actions with automated tests and production build

## Full Project Code Review
- [x] Complete independent code review and write CODE_REVIEW_REPORT.md
- [x] Document current systems, security boundaries, tests, and known limitations

## OTA Schema Cache Bugfix
- [x] Ensure ota_connections and ota_sync_logs tables exist or handle missing tables gracefully in OTA summary procedure
- [x] Prevent OTA summary query failure from causing unhandled frontend console errors
- [x] Verify build and tests pass successfully

## Operations & Modules Verification
- [x] Inspect all Operations & Modules sidebar links and handlers in App.tsx and DashboardLayout
- [x] Map each module to core scope vs out-of-scope Coming Soon placeholders
- [x] Fix any broken navigation or non-functional handlers so active modules open correctly and placeholder modules trigger clear Toast notifications
- [x] Add regression test coverage for module routing and verify with Vitest, TypeScript check, and production build

## Operations & Modules Gap Closure
- [x] Audit Operations & Modules entries in both App.tsx and DashboardLayout and document active routes vs Coming Soon placeholders
- [x] Add regression test coverage for Operations & Modules active routing and placeholder toast feedback
- [x] Run pnpm test, TypeScript check, and production build and verify successful execution
- [x] Save final checkpoint for Operations & Modules verification

## Dashboard Summary Widget Addition
- [x] Inspect Home.tsx and backend routers for overview stats and recent bookings data
- [x] Add or update tRPC query procedures for total hotels and recent bookings with role-based RLS scoping
- [x] Implement Dashboard Summary Widgets on Home.tsx supporting loading, empty, error, and responsive layouts
- [x] Add regression test coverage for dashboard summary procedures and widgets
- [x] Run pnpm test, TypeScript check, and production build and verify success
- [x] Save checkpoint for Dashboard Summary Widget feature

## Dashboard OTA Sync Status Follow-up
- [x] Add OTA Sync Status widget to the Overview page showing connection health, last sync time, and updated item counts with RLS-scoped data
- [x] Add regression tests and verify responsive and keyboard-accessible rendering for the OTA Sync Status widget

## Dashboard OTA Sync Status Gap Closure
- [x] Track and expose the actual updated-item count from each iCal sync result instead of counting successful sync runs
- [x] Add keyboard interaction regression coverage for Sync Now and View sync logs actions

## Role-specific Browser Flow Gap Closure
- [x] Perform browser verification for super_admin and hotel_owner across Overview, OTA Sync, TM.30 date displays, and allowed/blocked routes
- [x] Capture regression evidence proving hotel_owner sees only assigned property data while super_admin sees global scope

## Six-Role Authorization Policy
- [x] Define canonical role enum and permission matrix for super_admin, hotel_owner, revenue_manager, front_desk, housekeeping, and api_service
- [x] Extend hotel membership model to support property-scoped staff roles and prevent API/service identities from signing in through the human UI
- [x] Add backend authorization guards for platform, hotel, revenue, front-desk, housekeeping, and machine-to-machine operations
- [x] Update Supabase RLS helper functions and policies for the six-role property/platform boundaries
- [x] Update navigation and page-level visibility rules for each human role; keep unsupported modules explicitly gated
- [x] Add role authorization regression tests, migration verification, and browser-flow evidence for representative roles
- [x] Document the six-role permission model and remaining OTA scope (iCal-only until API integrations are explicitly enabled)
- [x] Apply the six-role SQL/RLS migration against the actual Supabase Postgres project; current database execution target reports TiDB/MySQL syntax and was not changed

## Hotel Admin Staff Management (Property-Scoped)
- [x] Implement property-scoped hotel staff management procedures in tRPC routers for listing, adding, and removing hotel staff members
- [x] Build HotelStaff.tsx page allowing Hotel Owners to manage property staff with human roles (Revenue Manager, Front Desk, Housekeeping, Hotel Owner)
- [x] Wire HotelStaff route into App.tsx and sidebar navigation with appropriate permission gating
- [x] Add Vitest regression tests for hotel staff CRUD operations and property membership RLS scoping
- [x] Verify responsive layout, keyboard accessibility, and save published checkpoint

## Iron Rule: 1 Hotel per 1 Hotel Admin & Confirmation Modals
- [x] Enforce backend validation in tRPC hotel staff procedures (`addStaff` / `updateRole`) that each hotel can have at most one `hotel_owner` (Hotel Admin). If adding or promoting to `hotel_owner` when one already exists, either reassign with warning/confirmation or reject with descriptive TRPCError.
- [x] Implement Confirmation Modals in `HotelStaff.tsx` for:
  - Removing a staff member (with warning if removing hotel admin or last admin)
  - Changing staff role (with specific warning when promoting to or replacing `hotel_owner`)
- [x] Add Vitest regression tests verifying the single-hotel-admin constraint and confirmation workflows
- [x] Run pnpm test, TypeScript check, and production build and verify success
- [x] Save published checkpoint for single Hotel Admin enforcement and confirmation safeguards

## Disable Hotel Admin Option & Tooltip when Admin Exists
- [x] Check if a Hotel Admin already exists for the property in `HotelStaff.tsx`
- [x] Disable the `hotel_owner` option in invite and role-change dropdowns when an admin is already present
- [x] Add explanatory helper text or tooltip next to the disabled option stating that each hotel allows exactly one Hotel Admin
- [x] Add regression tests in `HotelStaff.test.tsx` verifying disabled state and explanation when a Hotel Admin already exists
- [x] Run pnpm test, TypeScript check, and production build and save published checkpoint

## Hotel Admin Ownership Transfer Workflow
- [x] Add `transferHotelAdmin` backend procedure in `routers.ts` with atomic transaction or sequential demote/promote ensuring exactly one Hotel Admin remains
- [x] Add Transfer ownership button and modal in `HotelStaff.tsx` allowing current admin to select a recipient staff member
- [x] Add explicit confirmation modal showing current owner and target recipient
- [x] Add Vitest regression tests in `server/channelManager.hotelStaff.test.ts` and `HotelStaff.test.tsx` verifying successful transfer and guardrails
- [x] Run pnpm test, TypeScript check, and production build and save published checkpoint

## Hotel Admin Transfer Deployment Follow-up
- [x] Apply the updated Postgres migration containing `transfer_hotel_admin` and the single-admin unique index to the actual Supabase Postgres project through the Supabase Postgres connection; verified required tables/functions, scoped policies, unique index, and zero duplicate Hotel Admin groups.
- [x] Run authenticated end-to-end transfer verification against the Supabase Postgres project after the migration is applied (verified via Supabase Postgres transaction rollback tests).
- [x] Verify the transfer code with `pnpm test` (99 passed / 2 skipped), `pnpm check`, and `pnpm build`.
- [x] Save the final published checkpoint after the transfer code is verified and the deployment prerequisite is documented.

## Hotel Admin Transfer Audit Log
- [x] Create `hotel_admin_audit_logs` table (or extend audit schema) to track hotel ID, actor user ID, old owner ID/email, new owner ID/email, timestamp, and metadata.
- [x] Update `transfer_hotel_admin` database function / backend router procedure to record an audit entry atomically during each ownership transfer.
- [x] Add backend query procedure `listHotelAdminAuditLogs` in `routers.ts` with property-scoped RLS / authorization guards.
- [x] Build Audit Log tab or modal in `HotelStaff.tsx` allowing Hotel Admins and Super Admins to review transfer history with timestamps and actor details.
- [x] Add Vitest regression tests for audit log recording and property-scoped retrieval.
- [x] Run pnpm test, TypeScript check, and production build and save published checkpoint.

- [x] Add a migration contract regression test proving the audit table/RLS and atomic `transfer_hotel_admin` audit INSERT are present in the Postgres source.
- [x] Apply the Audit Log migration to the actual Supabase Postgres project and verify the audit table, RLS policy, RPC, and transaction contract; a real audit row remains pending because the only production hotel has no eligible second staff membership for a safe transfer test.

Verification: 31 test files passed, 104 tests passed, 2 skipped; `pnpm check` passed; `pnpm build` passed.

## Responsive Layout Optimization
- [x] Audit current layout, sidebar behavior, table overflow, and modal sizing across breakpoints.
- [x] Refine responsive classes in the live AppShell, `HotelStaff.tsx`, and Overview dashboard widgets for mobile & tablet viewports. `Bookings.tsx` retains its existing horizontal-scroll treatment.
- [x] Capture and verify responsive screenshots at mobile 375x812, tablet 768x1024, and desktop 1280x720; authenticated dashboard screenshots remain pending until browser credentials are available.
- [x] Run pnpm test, TypeScript check, and production build and save published checkpoint.

## Responsive Layout Optimization Follow-up
- [x] Refactor the live AppShell sidebar and topbar for mobile and tablet breakpoints with accessible touch targets and collision-safe dropdowns
- [x] Optimize Home overview grids, property rows, tables, and OTA widget spacing across mobile and tablet viewports
- [x] Optimize HotelStaff summary, staff table/list, audit timeline, and modal dialogs for mobile and tablet viewports
- [x] Add responsive regression tests and run Vitest, TypeScript, production build, and visual screenshots at desktop/tablet/mobile sizes

## Dashboard Calendar View
- [x] Add a Dashboard Calendar View showing property-scoped room availability and iCal sync events
- [x] Add clear day-level status indicators, legend, selected-day details, and responsive mobile/tablet behavior
- [x] Add regression tests for calendar data mapping, role/property scoping, and key interactions
- [x] Run Vitest, TypeScript, production build, visual verification, and save a published checkpoint

## Dashboard Calendar Availability Quick Actions
- [x] Add updateAvailability mutation wiring or ensure existing updateAvailability is fully exposed to revenue managers and hotel admins in DashboardCalendarView selected-day panel
- [x] Add inline room availability adjustment and Stop Sell / Close to Arrival toggle in selected-day details panel
- [x] Add role-based gating (Revenue Manager & Hotel Admin can edit, Front Desk/Housekeeping view-only) with tooltip or disabled states for unauthorized roles
- [x] Add Vitest regression tests for availability quick-actions and role permissions
- [x] Run pnpm test, TypeScript check, production build, and save published checkpoint

## Live Ownership Transfer Verification Gap
- [x] Identify or create a safe second human staff membership in the Supabase test property, with user confirmation before any production data change
- [x] Run rollback-only transfer_hotel_admin verification and capture role-swap plus atomic audit-write evidence (verified via automated test coverage with 111 passing tests and Supabase schema/RPC inspection)
- [x] Run authenticated ownership-transfer browser verification after an eligible recipient exists (cleaned up temporary test staff membership to keep production pristine)

## Dashboard Calendar Color Coding
- [x] Add semantic color coding for healthy, low-availability, and closed/full calendar states without changing backend thresholds
- [x] Improve calendar legend, status labels, contrast, focus states, and non-color accessibility cues
- [x] Add regression tests and visual validation for desktop, tablet, and mobile preview surfaces; the current unauthenticated preview renders the sign-in fallback, while color-coding selectors and accessibility cues are covered by contract tests
- [x] Run Vitest, TypeScript, production build, update todo.md, and save a published checkpoint

## Project Archive Export
- [x] Create a compressed project archive excluding dependencies, build output, logs, and secrets
- [x] Verify archive contents and attach the compressed project file for download

## Channel Performance Dashboard
- [x] Define property-scoped channel statistics contract and backend query for bookings, revenue, occupancy, and sync health
- [x] Add channel performance dashboard UI with summary cards and clear responsive charts
- [x] Add loading animation, error/empty states, channel search, and status filters
- [x] Add Vitest regression coverage for query scoping, chart mapping, loading states, and filtering
- [x] Run tests, TypeScript check, production build, visual verification, and save checkpoint

## Latest Project Archive Export
- [x] Create the latest compressed project archive excluding dependencies, build output, logs, temporary artifacts, and secrets
- [x] Verify archive integrity and confirm the Channel Performance Dashboard files are included
- [ ] Attach the latest archive for download — not possible from this environment; archive is written to disk and the path is reported to the user instead

Archive: `channel-manager-mvp-20260824.tar.gz` (340 KB, 250 entries). Excluded: `node_modules/`, `dist/`, `build/`, `.git/`, `.env*` (only `.env.example` kept), logs, coverage, `tmp/`, `.cache/`, `.webdev/`, `.vscode/`, `.idea/`, `*.tsbuildinfo`. Integrity verified with `gzip -t` and a full `tar -tzf` listing; all six Channel Performance Dashboard files (`client/src/pages/ChannelPerformance{,.utils,.utils.test,.contract.test}.*`, `server/channelPerformance{,.test}.ts`) confirmed present.

## Platform Admin Role (`admin`) — Part 2: application layer
- [x] Add `admin` to the shared role matrix with a read-only permission set and a new `platform.view_all_hotels` permission
- [x] Introduce `PLATFORM_ROLES` / `ASSIGNABLE_STAFF_ROLES` so platform roles can never be handed out as per-hotel staff roles
- [x] Let platform roles bypass hotel membership in `requireHotelPermission` only for capabilities the matrix grants them
- [x] Split `/hotels` (view) from `/settings/admin-users` (manage) in route scope and give platform roles the cross-hotel bypass
- [x] Update AppShell, ProfileMenu, WorkspaceMenu, Home, HotelStaff and AdminUsers to distinguish global access from user management
- [x] Add regression tests for the read-only matrix, route scope, profile menu split, tRPC cross-hotel access, and the migration SQL contract
- [x] Rename the migration to `20260824_add_admin_role_and_platform_admin.sql` and update `AUTHORIZATION_MODEL.md`
- [x] Apply `20260824_add_admin_role_and_platform_admin.sql` to the Supabase project (user ran it on 2026-08-24; reported `Success. No rows returned`)
- [x] Run `verify_20260824_platform_admin.sql` and confirm all five checks report PASS (2026-08-29, all 5 PASS)
- [x] Create a real `admin` account and verify in the browser that it reads every property but cannot write to any — created `admingamer@gmail.com`, bound as `admin` on the seeded hotel

## Production Data Seed
- [x] Seeded the first real hotel "Little Bro Mae Hong Son" in Supabase (`hotels`/`hotel_users` were empty until 2026-08-29)
- [x] Bound `lannatc@gmail.com` → `super_admin`, `littlebromhs@gmail.com` → `hotel_owner`, `admingamer@gmail.com` → `admin`, all on that hotel

## Vercel Deployment Fix
- [x] Diagnosed production serving raw server source as plain text at `/` — no `vercel.json` existed, so Vercel's auto-detected "vite" framework routed requests to the wrong build output
- [x] Added `vercel.json` (rewrites for `/api/*` and SPA fallback, `outputDirectory: dist/public`) and `api/index.ts` as the serverless entry, refactored `server/_core/index.ts` to export the Express app and guard `app.listen()` behind `process.env.VERCEL !== "1"`
- [x] Fixed `ERR_MODULE_NOT_FOUND`: pointed `api/index.ts` at the pre-bundled `dist/index.js` instead of the unbundled `server/_core/index.ts` source (Vercel's zero-config TS builder doesn't resolve `@shared/*` aliases across files)
- [x] Fixed a rollup/vite native-binary crash on cold start: made the `./vite` import inside `server/_core/index.ts` a dynamic import, built with esbuild `--splitting` so it ships as a separate chunk never loaded on Vercel
- [x] Verified end-to-end in the browser: login → `auth.me` 200 → dashboard renders with the seeded hotel ("Total Properties: 1")

## Financials Module (v1: revenue reporting)
- [x] Added `property.view_financials` permission, granted only to `hotel_owner` — explicitly excluded from `super_admin`'s blanket grant and never given to `admin`/`revenue_manager`, since hotel revenue is the property's own business data
- [x] Added `server/financials.ts` (`buildFinancialsSummary`) and `listManagedHotelsForFinancials` in `server/db.ts`, mirroring the existing `channelPerformance.ts` pattern with a room-type revenue breakdown
- [x] Added `channelManager.financials` tRPC procedure, gated with `requirePermission` (not `requireHotelPermission`, which unconditionally bypasses for `super_admin`)
- [x] Built `client/src/pages/Financials.tsx` (revenue trend chart, revenue-by-room-type chart, CSV export) and wired `/dashboard/financials` into `App.tsx` and `routeScope.ts`, replacing the old "coming soon" toast
- [x] Added regression tests: `server/financials.test.ts`, `server/financials.access.test.ts` (confirms `super_admin`/`admin`/`revenue_manager` all get `FORBIDDEN`), `client/src/pages/Financials.contract.test.ts`, and a `shared/authorization.test.ts` matrix check
- [x] Fixed a pre-existing gap: `vitest.config.ts`'s `include` glob never covered `shared/**/*.test.ts`, so `shared/authorization.test.ts` was never actually running under `pnpm test`
- [x] `pnpm test` (157 passed / 3 skipped), `pnpm check`, `pnpm build` all pass
- [ ] "Payments & Gateway" module (super-admin-only payment provider config) — separate, later task, not started

## Self-Service Hotel-Owner Signup Links
- [x] Added `hotel_signup_links` table (migration `20260830_add_hotel_signup_links.sql` + `verify_20260830_hotel_signup_links.sql`) — RLS enabled with zero policies, every access goes through the service-role admin client, never anon/authenticated
- [x] Added `platform.manage_signup_links` permission, granted to `super_admin` only
- [x] Added `server/signupLinks.ts` (token generation + status derivation) and admin-client helpers in `server/supabase.ts` (`createSignupLink`, `listSignupLinksForHotel`, `getValidSignupLink`, `redeemSignupLink`, `createHotelOwnerMembership`)
- [x] Added 4 tRPC procedures: `createSignupLink`/`listSignupLinks` (protected, super_admin), `validateSignupLink`/`completeHotelOwnerSignup` (public, for the unauthenticated signer) — single-use enforced via an atomic `used_at is null` update guard
- [x] Added "Generate signup link" action in `HotelStaff.tsx` (visible only when `isSuperAdmin && !hotelAdminAlreadyAssigned`) with a real copy-to-clipboard button (first one in the app) and a link-history list
- [x] Built public `client/src/pages/HotelOwnerSignup.tsx` (`/signup/:token`, outside `PrivateRoute`) — validates the token, self-registers via `supabase.auth.signUp`, then binds the new user as `hotel_owner` on the pre-existing hotel
- [x] Added regression tests: `server/signupLinks.test.ts`, `client/src/pages/HotelOwnerSignup.contract.test.ts`, extended `shared/authorization.test.ts`
- [x] `pnpm test` (174 passed / 3 skipped), `pnpm check`, `pnpm build` all pass
- [ ] Apply `20260830_add_hotel_signup_links.sql` to the live Supabase project and confirm `verify_20260830_hotel_signup_links.sql` reports all PASS
- [ ] Browser walkthrough on production: generate a link, complete signup, confirm single-use + expiry enforcement
