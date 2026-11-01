# 18. Social signup and sign-in

Status: code complete on `feat/social-signup`; OAuth apps and real provider logins not tested yet.

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
  invited or provider-verified account.
- A password signup is unverified today, so it does not join automatically: `account_not_linked`
  tells the person to sign in with the password and press Connect in Security settings. Joining it
  would leave a working password with whoever registered the address.
- Facebook and LINE state no verified email, so they never join by email. Connect in Security
  settings (`/link-social`) works for them while signed in. A provider account already owned by
  someone else is refused.
- Only an email the provider states is verified is stored. In practice that is Google. Facebook
  and LINE accounts get `<provider>.<id>@no-email.hayhost.invalid`, which works when the provider
  shares no email and stops an unverified address being claimed. Those addresses cannot sign up
  by email and no reset mail is sent to them.
- OAuth tokens are encrypted at rest.

## Two-factor
Better Auth's plugin challenges only credential sign-ins. `requireTwoFactorOnSocialCallback` runs
in the `session.create.before` hook on `/callback/*`. For a 2FA account it creates the plugin's
challenge, redirects to `/login?two_factor=1` and no session row is written.

## Out of scope
See the 2026-11-01 entries in `.agent/OPEN_QUESTIONS.md`: linking from settings, 2FA for accounts
without a password, a contact email for LINE and Facebook accounts, and account deletion for them.
