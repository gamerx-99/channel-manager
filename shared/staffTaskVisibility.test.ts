import { describe, expect, it } from "vitest";
import { isStaffTaskVisibleToAssignee } from "./staffTaskVisibility";

const task = { task_date: "2026-11-06", status: "pending" as const };
describe("staff task visibility", () => {
  it("reveals tasks at the earliest shift start in Thai time", () => {
    expect(isStaffTaskVisibleToAssignee(task, [{ start_time: "09:00" }, { start_time: "07:30" }], new Date("2026-11-06T00:29:00Z"))).toBe(false);
    expect(isStaffTaskVisibleToAssignee(task, [{ start_time: "09:00" }, { start_time: "07:30" }], new Date("2026-11-06T00:30:00Z"))).toBe(true);
  });
  it("uses midnight Thai time when there is no shift that day", () => {
    expect(isStaffTaskVisibleToAssignee(task, [], new Date("2026-11-05T17:00:00Z"))).toBe(true);
  });
  it("uses the scheduled start for an overnight shift", () => {
    expect(isStaffTaskVisibleToAssignee(task, [{ start_time: "22:00" }], new Date("2026-11-06T14:00:00Z"))).toBe(false);
  });
  it("hides future tasks and retains undone earlier tasks", () => {
    expect(isStaffTaskVisibleToAssignee({ ...task, task_date: "2026-11-07" }, [], new Date("2026-11-06T10:00:00Z"))).toBe(false);
    expect(isStaffTaskVisibleToAssignee({ ...task, task_date: "2026-11-05" }, [], new Date("2026-11-06T10:00:00Z"))).toBe(true);
    expect(isStaffTaskVisibleToAssignee({ task_date: "2026-11-05", status: "done" }, [], new Date("2026-11-06T10:00:00Z"))).toBe(false);
  });
  it("lets managers bypass the schedule rule", () => {
    expect(isStaffTaskVisibleToAssignee({ ...task, task_date: "2026-11-07" }, [], new Date("2026-11-06T10:00:00Z"), true)).toBe(true);
  });
});
