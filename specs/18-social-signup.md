# 18. Social signup and sign-in

Status: integrated on `feat/signup-integration`; OAuth apps and real provider logins not tested yet.

## Goal
Hotel owners can sign up and sign in with Google, Facebook or LINE from `/login`, `/signup`
and `/signup/:token`, using Better Auth's built-in providers (LINE included, no generic OAuth).

## Providers
- Credentials come from `GOOGLE_`, `FACEBOOK_` and `LINE_CLIENT_ID` / `_CLIENT_SECRET` Worker secrets.
- A provider missing either value is not registered, and `auth.socialProviders` leaves it out,
  so its button does not render.
- Setup steps and callback URLs: `docs/social-login-setup.md`.

## Finishing signup
- Public signup: the provider returns to `/signup`. The page already shows only the hotel
  details to a signed-in person, then calls `registerOwnHotel`. Someone who already has a hotel
  is sent to `/dashboard`.
- Login uses the same return path, so a person who left before adding a hotel can finish it.
- Signup link: the provider returns to `/signup/:token`, which offers one button that calls
  `completeHotelOwnerSignup`. The token stays the credential, as with email signup.

## Account safety
- One email is one account. A login joins an existing account by email only when the provider
  states the email is verified and the local account is verified too. That is Google against an
  confirmed password account, an accepted invite or another provider-verified account.
- A password signup that has not confirmed its email does not join automatically:
  `account_not_linked` tells the person to sign in and press Connect in Security settings. Joining
  it would leave a working password with whoever registered the address.
- Facebook and LINE state no verified email, so they never join by email. Connect in Security
  settings (`/link-social`) works for them while signed in. A provider account already owned by
  someone else is refused.
- Only an email the provider states is verified is stored. In practice that is Google. Facebook
  and LINE accounts get `<provider>.<id>@no-email.hayhost.invalid`, which works when the provider
  shares no email and stops an unverified address being claimed. Those addresses cannot sign up
  by email and no reset mail is sent to them.
- OAuth tokens are encrypted at rest.

## Email verification
- With `RESEND_API_KEY` set, signup sends a link, opens no session, and sign-in is refused until
  the email is confirmed. Without a real mail provider nothing is enforced, because the mock sender
  drops every message and accounts could never be confirmed.
- The check-email page has a resend button. A refused sign-in also sends a fresh link, so an old
  unverified account recovers by itself as long as mail is delivered.
- The link marks the email and returns to `/login?verified=1`. It does not log in, so it cannot
  skip the password or 2FA. Links last 24 hours.
- `/signup` now asks for the account first and the hotel after sign-in. An owner link resumes
  through `/login?next=/signup/:token`; `next` accepts only that path shape.
- Invites set `emailVerified` when accepted, so invited staff, support and platform admins sign in
  as before.

## Two-factor
Better Auth's plugin challenges only credential sign-ins. `requireTwoFactorOnSocialCallback` runs
in the `session.create.before` hook on `/callback/*`. For a 2FA account it creates the plugin's
challenge, redirects to `/login?two_factor=1` and no session row is written.

## Out of scope
See the 2026-11-01 entries in `.agent/OPEN_QUESTIONS.md`: linking from settings, 2FA for accounts
without a password, a contact email for LINE and Facebook accounts, and account deletion for them.
