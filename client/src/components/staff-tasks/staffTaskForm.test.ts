import { describe, expect, it } from "vitest";
import { formatStaffTaskDate, staffTaskFormToInput } from "./staffTaskForm";

describe("staff task form helpers", () => {
  it("converts form values to the task input shape", () => {
    const data = new FormData();
    data.set("assigned_to", "member-1"); data.set("task_date", "2026-11-06"); data.set("title", "  Check rooms  "); data.set("details", "  Bring towels  "); data.set("room_id", "");
    expect(staffTaskFormToInput(data)).toEqual({ assigned_to: "member-1", task_date: "2026-11-06", title: "Check rooms", details: "Bring towels", room_id: null });
  });

  it("turns blank details into null", () => {
    const data = new FormData(); data.set("assigned_to", "member-1"); data.set("task_date", "2026-11-06"); data.set("title", "Task"); data.set("details", "   "); data.set("room_id", "");
    expect(staffTaskFormToInput(data).details).toBeNull();
  });

  it("formats dates in the selected calendar", () => {
    expect(formatStaffTaskDate("2026-11-06", "en")).toContain("November 6, 2026");
    expect(formatStaffTaskDate("2026-11-06", "th")).toContain("2569");
  });
});
