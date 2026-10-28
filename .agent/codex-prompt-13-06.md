# Codex #1: 13-06 platform services (split into 13-06a, 13-06b and 13-06c)

Folder: `C:\WORK\channel-manager-c`. Branch: `agent-c/d1-schema`. Work only in this folder.
- No push, merge or deploy. Do not run `wrangler deploy`.
- Do not read or print `.env` or any secret values.

13-04b (4148a3c) is verified: 696 passed / 7 env-only, check OK, build OK. Good work.

## Scope
Spec 13's 13-06 line covers several concerns, so do it as three tickets, in order. Each ticket is one concern per commit, with a handoff entry and a spec checkbox. Stop after 13-06b and report back. 13-06c is described only so you know where those concerns go: do NOT start it.

### 13-06a: iCal fetch + URL guard + Cron (Workers runtime)
1. `server/icalUrl.ts` uses `node:dns` and `node:net`, which do not exist on Workers. Add a Workers-safe guard, for example `server/d1/icalUrl.ts`, and keep the existing Node version for the live app until cutover.
   - Accept only `http:` and `https:` URLs. Reject:
     - credentials in the URL;
     - non-default ports other than 443 and 80;
     - IP-literal hosts in private, reserved or loopback ranges. Reuse the same ranges, including IPv4-mapped IPv6 and the hex form.
   - Reject hostnames that are `localhost`, end in `.local`/`.internal`, or have no dot.
   - Do NOT add DNS-over-HTTPS. Workers cannot reach private networks, so the literal and hostname checks are enough.
     - ASSUMPTION: write this in a code comment and in OPEN_QUESTIONS.
   - Redirects: follow at most 3 manually (`redirect: "manual"`), re-validating every `Location`.
   - Limits: abort after 10 s; cap the body at 2 MB (stream and count bytes). Require `text/calendar` or `text/plain`, or a body that starts with `BEGIN:VCALENDAR`.
2. Add `fetchAndSyncOtaConnection(db, systemCaller, connectionId, fetchImpl = fetch)`.
   - It loads the connection, validates the stored import URL, fetches it, and calls `syncOtaIcalBlocks`.
   - On a guard or fetch failure, set the connection's `last_error` to a short client-safe message, and set `status` the way the Postgres version does. Never leave a raw error or the URL in a log.
3. Add a Cron handler in the Worker entry, using the `scheduled` export.
   - It runs every 15 minutes for all non-disconnected connections that have an import URL.
   - Use `createD1SystemCallerContext()`. Process connections sequentially, or with concurrency ≤ 4.
   - One connection failing must not stop the others.
   - Add `[triggers] crons = ["*/15 * * * *"]` to `wrangler.toml` for staging and production only.
     - `wrangler.toml` is deploy-critical. Show me the exact diff in your report.
4. Tests:
   - The guard: private IPv4 and IPv6 literals, mapped IPv6, hex-mapped, `localhost`, credentials, bad ports, too many redirects, a redirect to a private IP, oversize bodies, timeouts, wrong content type.
   - Fetch-and-sync with a fake `fetch`.
   - Cron: one failing connection does not block the rest, and it uses only the system caller.

### 13-06b: R2 media upload/serve
1. Port hotel media upload and delete to R2.
   - Same rules as `server/storage.ts` / `hotelMedia`: permission `property.manage_profile` via the scoped layer; the same size and type limits; keys `<hotel_id>/<random>.<ext>`.
   - Never trust a client-supplied key or hotel_id for the object path.
2. Serve objects with a Worker route such as `GET /media/<hotel_id>/<file>`.
   - Correct `Content-Type`, `Cache-Control: public, max-age=31536000, immutable`, and `ETag`; 404 for a missing object.
   - Public read is fine, because the public hotel page shows these images.
3. Deleting a media row deletes its R2 object, and only an object under that hotel's prefix.
4. Hero auto-promotion on delete must behave like today (see `server/hotelMedia.test.ts`).
5. Tests: a cross-hotel delete or upload is refused; key traversal (`..`, an absolute path, another hotel's prefix) is refused; the size/type limits; the serve headers.
   - Use an in-memory R2 fake or Miniflare, whichever the repo already uses.
6. Do not copy the Supabase objects yet. That is 13-08.

### 13-06c (later, not now): SlipOK AES-GCM via WebCrypto, and TM.30 template as a bundled asset (no `node:fs`)

## Done means (paste real output)
- `pnpm test` (only the 7 known env-only failures allowed), `pnpm check`, and `pnpm build`.
- Commits listed, plus a handoff entry per ticket. Stop after 13-06b.
