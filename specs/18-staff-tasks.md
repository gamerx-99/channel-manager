# Spec 18 — Staff daily tasks

Status: implemented; `staff_tasks` migration awaits application.

Hotel owners and staff with `staff.manage_tasks` assign short tasks to a hotel staff membership for a Thai calendar date. Managers can list, edit, delete, and change status across dates. Staff with `staff.view_own_tasks` see only their own tasks after the earliest shift start for that date; without a shift they appear from 00:00 Thai time. Future tasks remain hidden from staff. `ASSUMPTION:` undone tasks from earlier dates remain visible until done.

Tasks may include optional details and a room. Room deletion clears the room reference. Task visibility and completion authorization are enforced server-side. The staff task page is `/staff-tasks` under the “พนักงาน” sidebar group; the existing housekeeping implementation remains in place.
