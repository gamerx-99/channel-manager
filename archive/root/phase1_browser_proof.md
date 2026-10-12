# Phase 1 browser proof notes

Authenticated super-admin: `cm-040bd2-admin-sa@msn.com`.

On the live preview dashboard, the workspace switcher now opens as an accessible button (`aria-label="เลือก workspace และโรงแรม"`, `aria-expanded`) and displays `Support console`, `All properties overview`, and the RLS-visible `Little Bro` workspace linking to `/hotels/1bc4d9a3-f786-4fbf-b3b6-f17da5a9831b`.

On the Little Bro room operations route, the House room type ellipsis trigger opens a menu containing `Edit room type` and `Delete room type`. The trigger is visible in the desktop layout after the reusable `RoomTypeActions` extraction.

Automated evidence: focused RoomTypeActions jsdom test passes with accessible-name, keyboard focus, Enter/Escape state, mouse click, and rerender assertions. Full suite previously passed 44 tests with 2 production integration tests skipped; TypeScript check and production build pass.

Remaining browser checks: click the workspace hotel link, verify Add new and profile menus, and navigate each Quick Access destination from dashboard.

Additional browser proof: selecting `Little Bro /little-bro` from the workspace dropdown navigated to the real Little Bro hotel operations route. On returning to `/dashboard`, the `Add new` button opened links for `Add new hotel / property` and `Invite team member`.

Quick Access proof: clicking `Review today's bookings` navigated to `/hotels/1bc4d9a3-f786-4fbf-b3b6-f17da5a9831b/bookings`. The destination rendered live Supabase bookings UI and the `Export TM.30` button remained present.

Profile-menu proof: clicking the header account button displayed the signed-in super-admin email `cm-040bd2-admin-sa@msn.com`, `Admin Users & Access`, `Manage Properties`, and `Sign out`.

Quick Access proof: clicking `Complete guest details` also navigated to the live Little Bro bookings route, where persisted guest details feed the TM.30 workflow and `Export TM.30` remains visible.

Final Quick Access proof: clicking `Review hotel access` navigated to `/settings/admin-users`, rendering the live Admin users page with 2 Auth users, 2 hotel memberships, and the Little Bro membership ledger.
