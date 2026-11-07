# Hotel profile page

Status: DONE (2026-11-07, local worktree; not committed or deployed)

## Owner request

Move the hotel information editor from the room-types dialog to `/hotels/:id/profile`.
Keep the existing fields, validation, mutation and permissions. Link the sidebar and
guided tour to the page, and redirect the former `?edit=profile` URL.

## Acceptance

- The page requires `property.manage_profile` for the selected hotel.
- Basic information, map location and public contact channels are separate panels.
- Save stays on the page, reports success or error inline, and preserves edits on refetch.
- The tour highlights basic information and continues to room types.
- Thai and English copy use i18n. The page works at 320px, 375px and desktop widths.
