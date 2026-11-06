import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
describe("staff tasks page contract", () => {
  it("registers the page and named permission route with key task markers", () => {
    const app = read("client/src/App.tsx"); const scope = read("client/src/lib/routeScope.ts"); const page = read("client/src/pages/StaffTasks.tsx"); const hook = read("client/src/components/staff-tasks/useStaffTasks.ts");
    expect(app).toContain('path="/staff-tasks"'); expect(scope).toContain('pathname.startsWith("/staff-tasks")'); expect(scope).toContain('return "staff.view_own_tasks"'); expect(hook).toContain('"staff.manage_tasks"'); expect(page).toContain('staffTasks.myTasks'); expect(page).toContain('staffTasks.assignTask'); expect(page).toContain('staffTasks.complete'); expect(page).toContain('staffTasks.beforeShift');
  });
});
