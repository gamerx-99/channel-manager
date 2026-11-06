import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
describe("staff tasks page contract", () => {
  it("registers the page and named permission route with key task markers", () => {
    const app = read("client/src/App.tsx"); const scope = read("client/src/lib/routeScope.ts"); const page = read("client/src/pages/StaffTasks.tsx"); const hook = read("client/src/components/staff-tasks/useStaffTasks.ts"); const manager = read("client/src/components/staff-tasks/StaffTaskManagerPanel.tsx"); const mine = read("client/src/components/staff-tasks/StaffTaskMyList.tsx"); const item = read("client/src/components/staff-tasks/StaffTaskItem.tsx"); const styles = read("client/src/components/staff-tasks/staff-tasks.css");
    expect(app).toContain('path="/staff-tasks"'); expect(scope).toContain('pathname.startsWith("/staff-tasks")'); expect(scope).toContain('return "staff.view_own_tasks"'); expect(hook).toContain('"staff.manage_tasks"'); expect(page).toContain("StaffTaskManagerPanel"); expect(page).toContain("staffTasks.addTask"); expect(page).toContain('className="page-content staff-tasks-page"'); expect(manager).toContain("StaffTaskItem"); expect(mine).toContain("staffTasks.complete"); expect(page).toContain("window.confirm"); expect(mine).toContain("waitingForShiftStart"); expect(mine).toContain("staff-task-before-shift"); expect(mine).toContain("staffTasks.noOwnTasks"); expect(item).toContain('status-pill ${done ? "done" : "pending"}'); expect(styles).toContain(".staff-task-item.is-done"); expect(styles).toContain(".staff-task-dialog-body");
  });
});
