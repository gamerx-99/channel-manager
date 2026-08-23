# CMG Phase 1.5 — Manus OAuth Audit

**Status:** AUDIT ONLY. No files modified, deleted, or refactored during this pass.
**Scope:** Manus OAuth / Manus Authentication remnants only (the wider "Manus WebDev Template" SDK — Forge LLM proxy, Manus storage proxy, heartbeat, notification service — is out of scope; flagged briefly at the end for a future audit).

---

## Executive Summary

The application has **two independent, non-interacting authentication systems** living in the codebase side by side:

1. **Supabase Auth** — the system that is actually live. It powers the real login page (`Login.tsx`), the real `useAuth` hook, the tRPC context (`createContext` → `getSupabaseIdentity`), every `protectedProcedure`/`adminProcedure`, and by extension all RBAC and RLS enforcement.
2. **Manus OAuth** — a full authorization-code-flow OAuth client (`sdk.ts` + `oauth.ts` + `manusTypes.ts` + `ManusDialog.tsx`) inherited from the original Manus WebDev project template. It is wired together internally and *would* function as a login mechanism if triggered, but its trigger point (`DashboardLayout.tsx`) is not mounted anywhere in the real app, and even if it were triggered, the session it produces is never read by the authorization layer that actually matters (`server/_core/context.ts`).

**Bottom line:** Manus OAuth is **not load-bearing**. Every route, permission check, and RLS policy in the live app depends on Supabase Auth. Manus OAuth is dead code from the perspective of the running application, but it is *reachable* dead code (a live Express route, a live client function, a rendered-if-imported dialog) — not simply unused source. See §7 for why that distinction matters for the removal plan.

---

## 1. Manus OAuth Components — Full Trace

```
ManusDialog.tsx                 client/src/components/ManusDialog.tsx
        ↓  (NOT imported by any live file — orphaned)
manusTypes.ts                   server/_core/types/manusTypes.ts
        ↓  (imported by sdk.ts only)
sdk.ts                          server/_core/sdk.ts
        ↓  (imported by oauth.ts only)
oauth.ts                        server/_core/oauth.ts
        ↓  (registerOAuthRoutes() called from index.ts)
index.ts                        server/_core/index.ts  →  app.get("/api/oauth/callback", ...)
        ↓
COOKIE "app_session_id" set on the response
        ↓  (nothing downstream ever reads this cookie)
✗ NOT connected to server/_core/context.ts
✗ NOT connected to server/_core/trpc.ts (protectedProcedure/adminProcedure)
✗ NOT connected to shared/authorization.ts (RBAC)
✗ NOT connected to Supabase / RLS
```

The client-side trigger for this whole chain:

```
client/src/const.ts:15   export const startLogin = () => { ... redirects to Manus OAuth server ... }
        ↑ called by
client/src/components/DashboardLayout.tsx:72   onClick={() => startLogin()}
        ↑ DashboardLayout is exported but…
✗ NOT imported by App.tsx (the real router / real app shell)
✗ NOT imported by Login.tsx (the real login page)
✗ NOT imported by any page under client/src/pages/
```

`grep -rn "DashboardLayout" client/src` returns exactly two hits: `DashboardLayout.tsx` itself and its sibling `DashboardLayoutSkeleton.tsx`. Neither is referenced by `App.tsx`, `main.tsx`, or any routed page. `App.tsx`'s actual `Router()`/`PrivateRoute`/`AppShell` (defined inline in `App.tsx`, unrelated to `DashboardLayout.tsx`) redirect unauthenticated users to `/login` → `Login.tsx`, which calls `supabase.auth.signInWithPassword` directly. `startLogin()` — the only caller of the Manus OAuth flow — is therefore unreachable from the live UI.

---

## 2. ManusDialog.tsx

| Question | Answer |
|---|---|
| 1. Imported where? | Nowhere. `grep -rn "ManusDialog" .` (excluding the file's own definitions) returns **zero** matches outside `ManusDialog.tsx` itself. |
| 2. Rendered where? | Nowhere — it is never imported, so it can never be rendered. |
| 3. Called in practice? | No. |
| 4. Dependency on Authentication? | Structurally yes — it's a "Please login with Manus to continue" modal that takes an `onLogin` callback prop, presumably meant to be wired to `startLogin()`, but no call site actually does that wiring. |
| 5. Impact if removed? | **None.** No import graph edge points at it. TypeScript build, tests, and runtime bundle would be unaffected (Vite tree-shaking already drops it from the production bundle since it's unreferenced). |
| 6. Active / Dead / Legacy / Unknown? | **DEAD** |

**Evidence:** `client/src/components/ManusDialog.tsx` defines and exports `ManusDialog`/`ManusDialogProps`; a repo-wide grep for the identifier `ManusDialog` matches only lines 12 and 21 of that same file (the interface and function declarations). No `import { ManusDialog }` exists anywhere in `client/src`.

---

## 3. manusTypes.ts

File: `server/_core/types/manusTypes.ts` — 7 interfaces, header comment says "Auto-generated from protobuf definitions."

| Type | Imported by | Actually used? | Tied to live Auth? |
|---|---|---|---|
| `ExchangeTokenRequest` | `sdk.ts` | Yes, inside `OAuthService.getTokenByCode` (dead-chain, see §1) | No — only the orphaned Manus chain |
| `ExchangeTokenResponse` | `sdk.ts` | Yes, same as above | No |
| `GetUserInfoResponse` | `sdk.ts` | Yes, `getUserInfoByToken`/`getUserInfo` | No |
| `GetUserInfoWithJwtRequest` | `sdk.ts` | Yes, `getUserInfoWithJwt` | No |
| `GetUserInfoWithJwtResponse` | `sdk.ts` | Yes, `getUserInfoWithJwt`, `authenticateRequest`, `buildCronUser` | No |
| `AuthorizeRequest` / `AuthorizeResponse` | *(none)* | **No** — not imported by `sdk.ts` or anything else | No |
| `GetUserInfoRequest` | *(none)* | **No** — `sdk.ts` builds the request object inline instead of using this type | No |
| `CanAccessRequest` / `CanAccessResponse` | *(none)* | **No** — no `CanAccess` RPC call exists anywhere in the codebase | No |

- **Used by:** `server/_core/sdk.ts` only, for 5 of the 9 exported types.
- **Used with real Auth?** No. Every consumer (`sdk.ts`) sits inside the orphaned Manus OAuth chain traced in §1; none of it is reachable from `context.ts`/`trpc.ts`.
- **Types safe to remove in future:** `AuthorizeRequest`, `AuthorizeResponse`, `GetUserInfoRequest`, `CanAccessRequest`, `CanAccessResponse` are unused even *within* the dead chain — removing them has zero blast radius beyond `manusTypes.ts` itself, whenever removal is approved.
- **Types that need care:** the 5 types actually consumed by `sdk.ts` — removing them requires removing (or refactoring) `sdk.ts`'s use of them first, in the same change.
- **No migration is implied.** Nothing here maps to a Supabase Auth equivalent that needs porting — it's a parallel system, not a partial implementation of the current one.
- **Not removed in this pass**, per instructions.

---

## 4. server/_core/sdk.ts — Detailed Breakdown

`sdk.ts` (350 lines) is entirely a **Manus OAuth client + a bespoke JWT session layer for that OAuth flow**. There is no "generic application logic" mixed in — the whole file exists to serve the Manus login flow.

| Block | Lines | Classification | KEEP / REPLACE / REMOVE / REFACTOR | Reasoning |
|---|---|---|---|---|
| `OAuthService` class (`getTokenByCode`, `getUserInfoByToken`) | 31–76 | Manus-specific | **REMOVE** (future phase) | Talks to the Manus WebDev OAuth server (`ENV.oAuthServerUrl`) exclusively; no generic abstraction here. |
| `createOAuthHttpClient` | 78–82 | Manus-specific | **REMOVE** | Builds an axios client pointed at `ENV.oAuthServerUrl`. |
| `SDKServer.exchangeCodeForToken` / `getUserInfo` | 120–145 | Manus-specific | **REMOVE** | Thin passthroughs to `OAuthService`. |
| `SDKServer.deriveLoginMethod` | 93–113 | Manus-specific (shapes Manus platform-enum data: `REGISTERED_PLATFORM_EMAIL` etc.) | **REMOVE** | The enum values are Manus's OAuth server vocabulary, not a generic concept. |
| `createSessionToken` / `signSession` / `verifySession` (JWT session cookie) | 161–232 | Generic *mechanism*, Manus-specific *payload* (`openId`, `appId`) | **REFACTOR if kept, else REMOVE** | The JWT-signing pattern itself (`jose`, `SignJWT`/`jwtVerify`) is reusable, but today it only signs Manus's `{openId, appId, name}` shape and nothing reads the resulting cookie. Supabase Auth already provides equivalent session handling (its own JWT, `supabase.auth.getSession()`), so this is redundant, not complementary. |
| `authenticateRequest` | 258–320 | Manus-specific (reads Manus cookie, falls back to Manus Authorization header, calls `db.getUserByOpenId`/`db.upsertUser`) | **REMOVE** | Not called from anywhere in the app (`grep` confirms zero call sites for `sdk.authenticateRequest` outside its own definition and a docstring comment). The real request-auth path is `getSupabaseIdentity` in `server/supabase.ts`, used by `context.ts`. |
| `buildCronUser` / `CRON_OPEN_ID_PREFIX` | 323–348 | Manus-specific (cron callback identity tied to `openId`) | **REMOVE or MIGRATE** | If any scheduled/cron job in production actually depends on this cron-user shape, it needs a Supabase-Auth-equivalent replacement before removal — flagged as a migration risk in §7, not confirmed either way by static analysis. `grep` finds no other file constructing or consuming `AuthenticatedUser.isCron`/`taskUid`, suggesting it's also unused, but this warrants a runtime/log check, not just source inspection. |
| `SessionPayload` type, `EXCHANGE_TOKEN_PATH` / `GET_USER_INFO_PATH` / `GET_USER_INFO_WITH_JWT_PATH` constants | 21–29 | Manus-specific | **REMOVE** | Manus WebDev Auth protobuf-service paths. |
| Cookie/JWT plumbing helpers (`parseCookies`, `getSessionSecret`) | 147–159 | Generic mechanism, Manus-specific usage | **REMOVE with the rest** | Only consumer is the Manus session flow described above. |

**Nothing in `sdk.ts` needs to be `KEEP`ed as-is.** There is no generic "auth helper" or "API client" abstraction layer here worth preserving independently — it's a single-purpose Manus OAuth client. The one open question is the cron-callback identity (`buildCronUser`), which needs a runtime check (are there active scheduled jobs hitting `/api/trpc` with a `cron_*` openId and an Authorization header?) before it can be marked safe to remove — see §7 Option B.

---

## 5. Supabase Auth vs. Manus OAuth — Which One Is Actually Live?

**Answer: Supabase Auth exclusively, for everything that matters to authorization.** Traced end-to-end from source:

| Concern | Implementation | File:Line |
|---|---|---|
| Login | `supabase.auth.signInWithPassword({ email, password })` | `client/src/pages/Login.tsx:17` |
| Client session / user state | `supabase.auth.getSession()`, `supabase.auth.onAuthStateChange(...)` | `client/src/_core/hooks/useAuth.ts:44,52` |
| Logout | `supabase.auth.signOut()` | `client/src/_core/hooks/useAuth.ts:22` |
| Server-side identity resolution | `getSupabaseIdentity(req)` — reads `Authorization: Bearer <token>`, calls `supabase.auth.getUser(accessToken)` | `server/supabase.ts:61-86` |
| tRPC context | `createContext` calls `getSupabaseIdentity`, nothing else | `server/_core/context.ts:10-27` |
| tRPC protected/admin gates | `requireUser` middleware checks `ctx.user` (the Supabase identity); `adminProcedure` checks `ctx.user.appMetadata.role === 'super_admin'` | `server/_core/trpc.ts:13-45` |
| Role / hotel membership (RBAC) | `shared/authorization.ts` operates on roles sourced from the Supabase-derived `ctx.user` | confirmed in prior review of `shared/authorization.ts` |
| RLS | Postgres RLS policies (`is_hotel_member`, `can_manage_rates`, etc.) key off the Supabase JWT forwarded per-request via `rlsClient()` | `server/routers.ts:120`, `supabase_migration_production.sql` |

**Manus OAuth touches none of the above.** Its cookie (`app_session_id`, set in `oauth.ts:57`) is written but never parsed by `context.ts`. Its user-sync calls (`db.upsertUser`/`db.getUserByOpenId`) are explicit no-ops — confirmed by the function bodies themselves:

```ts
// server/db.ts:71-94
/**
 * Compatibility surface for the unused template OAuth SDK. Channel Manager
 * authentication is now Supabase Auth; no user record is read from or written
 * to the template MySQL/TiDB database.
 */
export async function getUserByOpenId(_openId: string): Promise<LegacyTemplateUser | undefined> {
  return undefined;
}
export async function upsertUser(_user: Partial<LegacyTemplateUser> & { openId: string }): Promise<void> {
  // Intentionally no-op: Supabase Auth owns Channel Manager identity.
}
```

This comment is not my inference — it's an existing, explicit admission in the codebase that the Manus OAuth compatibility surface is unused. It corroborates every other finding in this audit.

**One more corroborating data point:** `drizzle/schema.ts` defines a `users` MySQL table (`mysqlTable`) with an `openId` column, commented "Manus OAuth identifier." This table targets a MySQL/TiDB database via Drizzle ORM. The live database is Postgres via Supabase (confirmed in `supabase_migration_production.sql`, which has no `users`/`open_id` table — only `hotel_users` for RBAC). The Drizzle `users` table is therefore also orphaned: a schema for a database connection that isn't the one the app actually uses.

---

## 6. Dependency Chain — Actual, as Found in Code

The chain requested in the brief (`Manus OAuth → sdk.ts → context → router → authorization → Supabase`) **does not exist**. The real picture is two disconnected chains:

```
LIVE CHAIN (everything that matters):
  Login.tsx (Supabase signInWithPassword)
        ↓
  supabase-js client session (browser)
        ↓
  Authorization: Bearer <supabase-jwt>  (sent with every tRPC call)
        ↓
  server/supabase.ts:getSupabaseIdentity()
        ↓
  server/_core/context.ts:createContext()  →  ctx.user
        ↓
  server/_core/trpc.ts:requireUser / adminProcedure middleware
        ↓
  server/routers.ts procedures  (shared/authorization.ts RBAC checks)
        ↓
  rlsClient(ctx.user token) → Supabase PostgREST  →  Postgres RLS policies


ORPHANED CHAIN (Manus OAuth — reachable but never triggered, and inert even if it were):
  DashboardLayout.tsx "Sign in" button → startLogin()   [component never mounted]
        ↓ (if it were mounted and clicked)
  Manus OAuth server (external, ENV.oAuthServerUrl)
        ↓
  GET /api/oauth/callback  (server/_core/oauth.ts, registered in index.ts)
        ↓
  sdk.exchangeCodeForToken / sdk.getUserInfo / sdk.createSessionToken (sdk.ts)
        ↓
  db.upsertUser(...)   [confirmed no-op]
        ↓
  Set-Cookie: app_session_id=<manus-jwt>
        ↓
  ✗ dead end — no code path reads this cookie
  ✗ sdk.authenticateRequest exists but has zero callers
  ✗ never reaches context.ts, trpc.ts, authorization.ts, or Supabase
```

---

## 7. Removal Feasibility

### Option A — Safe Removal: **Mostly yes, with one carve-out**

Evidence-based, not speculative:

- `ManusDialog.tsx`: **zero import references anywhere in the repo.** Safe to remove outright — no code path is affected.
- `DashboardLayout.tsx` + `DashboardLayoutSkeleton.tsx`: **zero import references from `App.tsx` or any routed page.** Safe to remove outright.
- `client/src/const.ts` (`startLogin`, `encodeOAuthState`) and `shared/const.ts` (`OAUTH_STATE_COOKIE`, `decodeOAuthState`, `COOKIE_NAME`, `ONE_YEAR_MS`, `AXIOS_TIMEOUT_MS`): safe to remove **once** `DashboardLayout.tsx` (their only caller) is gone — but `COOKIE_NAME` and `ONE_YEAR_MS` are also imported by `sdk.ts`/`oauth.ts`, so their removal must happen together with those files, not independently.
- `server/_core/oauth.ts`: safe to remove — its only effect is setting a cookie nothing reads, and its only "protection" (CSRF nonce check) protects a flow with no live entry point.
- `server/_core/sdk.ts`, `server/_core/types/manusTypes.ts`, `server/_core/cookies.ts`: safe to remove as a unit — `cookies.ts`'s only consumer is `oauth.ts`.
- `db.getUserByOpenId` / `db.upsertUser` (`server/db.ts:88-94`) and the `LegacyTemplateUser` type: safe to remove once `sdk.ts`/`oauth.ts` (their only callers) are gone.
- `drizzle/schema.ts` `users` table and the `drizzle-orm`/`drizzle-kit`/`pg` toolchain around it: safe to remove — it targets a database the app doesn't use. (Confirms and sharpens a finding from the earlier general codebase review.)

**The one carve-out — not safe to assume:** `sdk.ts`'s `buildCronUser`/cron-openId handling (§4). Static analysis shows zero live callers of `sdk.authenticateRequest`, but if any deployed scheduled job or external cron caller currently authenticates against `/api/trpc` using a Manus-issued `cron_*` session, removing this without checking would break it silently — and that can't be confirmed from source alone (would need deployment/runtime configuration or logs). **This is the only genuine Option-B item; everything else in this audit is Option A.**

### Option B — Migration Required: **Only the cron-callback path, and only if it turns out to be live**

If a runtime check confirms a scheduled task actually depends on Manus cron-session auth, that one code path needs a Supabase-Auth-equivalent (e.g., a service-role/API-key-based mechanism, matching the existing `api_service` role pattern already present in `server/supabase.ts:82`) before `sdk.ts` can be removed. Nothing else in the traced chain requires migration — Supabase Auth already fully covers login, session, RBAC, and RLS; there is no functional gap for Manus OAuth to be "migrated out of."

### Option C — Keep Temporarily: **Not supported by evidence**

No code, test, or documentation found during this audit indicates Manus OAuth is intentionally kept as a fallback, a feature flag, or a staged migration path. `db.ts`'s own comment states the opposite explicitly: Supabase Auth already owns identity. There is no evidence-based reason to keep this system beyond resolving the single cron carve-out above.

---

## 8. Environment Variables

| Variable | Read at | Used by | Necessary? | Prod or Dev? | Removable? |
|---|---|---|---|---|---|
| `OAUTH_SERVER_URL` | `server/_core/env.ts:5` (`ENV.oAuthServerUrl`) | `sdk.ts`'s `OAuthService` constructor and `createOAuthHttpClient` (base URL for the Manus OAuth HTTP client) | No — only the orphaned chain reads it | Would only matter in prod if the dead flow were ever triggered | Yes, once `sdk.ts`/`oauth.ts` are removed |
| `VITE_APP_ID` | `server/_core/env.ts:2` (`ENV.appId`) | `sdk.ts` (`ExchangeTokenRequest.clientId`, `SessionPayload.appId`) | No — same chain | n/a | Yes, same condition |
| `JWT_SECRET` | `server/_core/env.ts:3` (`ENV.cookieSecret`) | `sdk.ts`'s `getSessionSecret()`, used only to sign/verify the Manus session cookie | No — same chain | n/a | Yes, same condition. **Caveat:** confirm no other JWT usage in the codebase secretly reuses `JWT_SECRET` before deleting it from deployment secrets — a repo-wide check found only `sdk.ts` reading it, but a shared-secrets vault could have other non-code consumers. |
| `OWNER_OPEN_ID` | `server/_core/env.ts:6` (`ENV.ownerOpenId`) | **Nobody.** `grep` for `ownerOpenId`/`OWNER_OPEN_ID` across the repo finds only the `env.ts` declaration itself — no consumer at all. | No | n/a | Yes — already fully dead, independent of the rest of this audit |

None of these were found in `.env`, `.env.example`, or any committed env file (none exist in the repo — consistent with `.gitignore`), so this table is sourced entirely from `server/_core/env.ts`'s `process.env.*` reads. Per instructions, no `.env` file was inspected or modified.

---

## Security Impact

- **No active vulnerability found.** The Manus OAuth flow, even though reachable as an Express route, cannot grant access to any protected resource: its session cookie is never consulted by `context.ts`, so an attacker completing this flow would receive a cookie the app ignores entirely. It cannot be used to bypass Supabase Auth, RBAC, or RLS.
- **Residual attack surface, not a live exploit:** `/api/oauth/callback` is a live, unauthenticated Express endpoint that talks to an external OAuth server (`ENV.oAuthServerUrl`) and writes a signed cookie using `JWT_SECRET`. If `OAUTH_SERVER_URL` is unset or misconfigured in production (the code already logs an error in that case — `sdk.ts:34-38`), the endpoint still accepts requests and fails at request time rather than being absent. This is best characterized as unnecessary surface area, not a demonstrated vulnerability.
- **Secret hygiene note:** `JWT_SECRET` is a live production secret with a single real consumer (the dead Manus session signer). Removing that consumer is a chance to also rotate/retire the secret, but that's a deployment action, out of scope for this audit.

## Migration Risk

**Low**, with one explicit exception. Because Supabase Auth already independently covers every authorization concern in the live app (§5), there is no feature to "migrate" — this is a removal of a parallel, disconnected system, not a cutover. The sole residual risk is the cron-callback identity path in `sdk.ts` (§4, §7 Option B), which needs a one-time runtime/ops check, not a code migration, before it can be safely deleted.

---

## Files That Can Be Safely Removed
*(pending approval — nothing removed in this audit)*

- `client/src/components/ManusDialog.tsx`
- `client/src/components/DashboardLayout.tsx`
- `client/src/components/DashboardLayoutSkeleton.tsx`
- `server/_core/oauth.ts`
- `server/_core/sdk.ts` *(after the cron-callback check in §7 clears it)*
- `server/_core/types/manusTypes.ts`
- `server/_core/cookies.ts`
- `drizzle/schema.ts` `users` table definition (and, separately, the unused `drizzle-orm`/`drizzle-kit`/`mysql2`/`pg` toolchain — already flagged in the prior general codebase review)

## Files That Require Refactoring

- `server/db.ts` — remove `getUserByOpenId`, `upsertUser`, and `LegacyTemplateUser` (lines 71-94) once their only callers (`sdk.ts`, `oauth.ts`) are gone. Small, isolated edit.
- `client/src/const.ts` / `shared/const.ts` — remove `startLogin`, `encodeOAuthState`/`decodeOAuthState`, `OAUTH_STATE_COOKIE`, `COOKIE_NAME`, `ONE_YEAR_MS`, `AXIOS_TIMEOUT_MS` only after confirming (via grep, already done here) that nothing besides the Manus chain imports them.
- `server/_core/index.ts` — remove the `registerOAuthRoutes(app)` call (line 18) and its import.
- `server/_core/env.ts` — remove `oAuthServerUrl`, `appId`, `cookieSecret`, `ownerOpenId` fields once nothing reads them.
- `package.json` — `axios`, `jose`, `cookie` currently have real consumers, but *only* inside the Manus OAuth chain; once that chain is removed these become removable too (correcting/sharpening a finding from the earlier general review, which listed `axios`/`jose` as simply "unused" — they are used, just exclusively by dead code).

## Files That Must Be Preserved

- `client/src/pages/Login.tsx`, `client/src/_core/hooks/useAuth.ts`, `server/supabase.ts`, `server/_core/context.ts`, `server/_core/trpc.ts`, `shared/authorization.ts` — this is the entire live Supabase Auth / RBAC / RLS path. None of it references Manus and none of it should be touched by a Manus-removal change.

---

## Out of Scope, Flagged for a Future Audit

A repo-wide `manus` search also surfaced a broader "Manus WebDev Template" SDK unrelated to authentication: `server/_core/llm.ts` (proxies to `forge.manus.im`), `server/_core/storageProxy.ts` / `server/storage.ts` (`/manus-storage/*` file storage), `server/_core/heartbeat.ts` and `server/_core/notification.ts` (Manus platform services), `server/_core/map.ts` (comment references "Manus WebDev Templates"), and `scripts/role-flow-*.mjs` (E2E scripts hardcoded to a `*.manus.space` base URL). None of this touches authentication and none of it was analyzed for this audit — noted here only so it isn't mistaken for having been cleared.

---

## Recommended Removal Plan (for approval, not executed)

1. **Confirm the cron carve-out** (§7 Option B / §4) — check deployment config/logs for any scheduled job hitting `/api/trpc` with a Manus `cron_*` session before touching `sdk.ts`.
2. Remove the three orphaned client components (`ManusDialog.tsx`, `DashboardLayout.tsx`, `DashboardLayoutSkeleton.tsx`) — zero risk, zero callers.
3. Remove `server/_core/oauth.ts` and its registration in `index.ts`.
4. Remove `server/_core/sdk.ts`, `manusTypes.ts`, `cookies.ts` as one unit.
5. Trim `server/db.ts` (`getUserByOpenId`, `upsertUser`, `LegacyTemplateUser`) and `server/_core/env.ts` (Manus-only fields).
6. Trim `client/src/const.ts` / `shared/const.ts` of the now-unused OAuth helpers.
7. Drop `axios`, `jose`, `cookie` from `package.json` once step 4 is done and nothing else imports them (re-verify with a fresh grep at that point, since this audit only confirms today's state).
8. Separately (different phase, per the "out of scope" note above): decide the fate of the Drizzle/MySQL `users` schema and toolchain.

**No step above has been executed. Awaiting approval before Phase 1.5 removal work begins.**
