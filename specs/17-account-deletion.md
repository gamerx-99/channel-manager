# Spec 17 — Self-service account deletion (PDPA)

Status: DONE (reviewer approved 2026-10-31; not deployed, no migration needed)

A signed-in user can delete their own account from `/settings/security`. Guests have no
account, so guest requests are out of scope (see `.agent/OPEN_QUESTIONS.md`). No plan-based
quota is involved. No migration is needed.

## Server

`auth.accountDeletionStatus` (query) reports what blocks deletion. `auth.deleteAccount`
(mutation) takes `{ password, confirmEmail }` and deletes only the caller's own account.

Order of checks, cheapest and least revealing first:
1. A valid session, and `confirmEmail` equal to the account email.
2. With 2FA on: a recent MFA step-up for this session (`requireRecentMfaVerification`).
3. Nothing blocks deletion.
4. At most 5 password attempts in 15 minutes for this user, counted atomically in `verification` before the check.
5. The password, through Better Auth `verifyPassword`.
6. The deletion batch.

The password is never logged or stored. The input carries no hotel id, so the support audit
in `requireUser` writes nothing for this procedure.

## Refusals

- **Hotel owner**: `hotel_users` allows one `hotel_owner` per hotel, so every owner is the sole
  owner. Refuse and tell them to transfer on the hotel's staff page, or contact support to
  close the hotel. Hotel data and bookings are never deleted.
- **Last platform admin**: refuse. `ASSUMPTION:` no screen can create a super admin, so
  deleting the last one locks the platform.

Both rules also sit inside the batch's first statement, so a transfer racing with the
deletion cannot leave a hotel without an owner.

## Data handling

The batch is one D1 transaction. Its first statement deletes the `user` row under the
guards; every later statement runs only if that row is gone.

| Table / column | Action |
|---|---|
| `user`, `session`, `account`, `two_factor` | Delete |
| `verification`: value is the user id (reset tokens, 2FA, step-up) | Delete |
| `verification`: `account-delete-attempts:` row | Delete |
| `verification`: `invite:`, `support-invite:`, `platform-invite:` for this email | Delete |
| `verification`: `hotel-invite:` sent to this email or by this user | Delete |
| `hotel_users` | Delete memberships |
| `support_accounts`, `platform_admins` own row | Delete |
| `support_accounts`, `platform_admins` `invited_by` of others | `deleted-user` |
| `support_access_grants` where user is support or granter | Revoke if active, then `deleted-user` |
| `support_access_log.support_user_id` | `deleted-user` |
| `support_access_log.action` containing the id or email | Replace the JSON part with `{"redacted":true}` |
| `hotel_admin_audit_logs` ids | `deleted-user`; `actor_email` null; `details` `{}` |
| `bookings.created_by` | `deleted-user` |
| `booking_status_log.changed_by` | `deleted-user` |
| `messages.sender_user_id` | `deleted-user` |
| `housekeeping_tasks.assigned_to` | Null (unassigned) |
| `room_housekeeping_status.updated_by` | Null |
| `hotel_signup_links` | Expire unused links this user created; ids become `deleted-user` |
| `hotels.owner_contact` equal to the account email | Empty text |

`deleted-user` (`DELETED_USER_ID` in `shared/accountDeletion.ts`) is fixed, so no value
remains that links rows to the person. It is used instead of null where null has a meaning
of its own: `booking_status_log.changed_by IS NULL` marks an automatic OTA cancellation and
`ota.ts` revives those rows, so a staff cancellation must never become null. A null message
sender renders as "System", and a null `bookings.created_by` means a public booking.

Kept, with no link to the person: bookings, guests, payments, messages' text, status history
and audit rows. They belong to the hotel, and some may be legally required.

`notifications` has no user column and no code writes a person's name into it today, so it
needs no change. `agents` holds sales agents, not accounts.

## Client

A "Delete account" panel in `SecuritySettings.tsx`: a warning of what goes and what stays, a
blocked state listing owned hotels with a link to each staff page, then a confirm step with
email, password, and the authenticator code when 2FA is on. On success it signs out, clears
the query cache and goes to `/login`. All text is in `en.ts` and `th.ts`. The staff audit,
support access and Communications screens label `deleted-user` as "Deleted user".

## Tests

- Unit: `server/d1/accountDeletion.test.ts`, on real SQLite with the migrations.
- Router: `server/accountDeletion.access.test.ts`.
- Contract: `client/src/pages/SecuritySettings.contract.test.ts`.
