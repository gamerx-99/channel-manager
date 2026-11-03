# Spec 19: Retention archive, scheduled purge and guest data masking

Status: NOT STARTED. Not built. The legal pages already describe parts A and B, so
they must ship before the legal pages leave draft.

Source: the owner's decisions of 2026-11-01. The legal basis needs a lawyer's
confirmation, see `.agent/OPEN_QUESTIONS.md`.

## A. Retention archive (Privacy clause 6, 90 days)

- On account deletion or end of service, anonymise the main database as today, and copy
  only `user_id`, `registered_email`, `created_at`, `terminated_at` and `last_known_ip`
  into a separate `retention_archive` table.
- A cron purges each row 90 days after `terminated_at`.
- Nothing else about the hotel or its guests goes into the archive.
- `audit_user_identities` and `access_logs` are the owner's names for where identity and
  access records live. The system stores no traffic data today, so `access_logs` is a
  decision to take at design time: what to log, for how long, and how it fits the same
  90-day period.

Conflicts to resolve when building:
- `deleteAccount` removes identity at once. This spec keeps the five fields for 90 days.
- Hotel closure deletes data on day 66 from the request. The archive row for a user
  of a closed hotel must outlive that delete.
- `last_known_ip` today exists only on a live session, so it must be read before
  the session is removed.

## B. Scheduled purge (Privacy clause 6, 3 and 5 years)

- A cron destroys or anonymises audit and support access logs older than 3 years.
- Fee records are kept 5 years. Fee billing is not built yet, so this applies once
  spec 12 stores them.
- Privacy clause 6 says "on the system's processing cycle". That cycle must exist before
  the page leaves draft, or the sentence is untrue.

## C. Guest data masking

- Show passport numbers masked (`AB***678`) with an eye control to reveal the full value.
  Card data is out of scope: the system stores no card numbers.
- Log `timestamp` and `user_id` each time a masked value is revealed.
- Show a light watermark with hotel name or user ID and timestamp on guest data screens.
- Follow the permission rules in `CLAUDE.md`. TM.30 export needs its own decision,
  because it must contain the full number.

## Definition of done

As in `CLAUDE.md`, plus: the migration applied by the owner, and clause 6 re-read against
the code. The screenshot-blocking idea stays out: a web page cannot do it.
