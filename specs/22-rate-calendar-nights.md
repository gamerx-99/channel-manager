# Rate calendar night selection

Status: DONE (local worktree; not committed or deployed)

The first click selects the first night. The second click selects check-out; the calendar edits through the preceding night. Clicking the same date twice selects one night. Clicking an earlier date reverses the range. The month view and timeline highlight only edited nights and outline check-out separately. The save mutation receives the last night as its inclusive `end_date`.

`ASSUMPTION:` This booking-style selection follows the owner's provisional decision. It does not change stored availability or server read semantics.
