import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("Housekeeping board contract", () => {
  const component = readFileSync(resolve(process.cwd(), "client/src/pages/Housekeeping.tsx"), "utf8");
  const app = readFileSync(resolve(process.cwd(), "client/src/App.tsx"), "utf8");
  const appShell = readFileSync(resolve(process.cwd(), "client/src/components/layout/Sidebar.tsx"), "utf8");
  const routeScope = readFileSync(resolve(process.cwd(), "client/src/lib/routeScope.ts"), "utf8");

  it("registers the page route and gates sidebar link with housekeeping.view_room_status", () => {
    expect(app).toContain('path="/housekeeping"');
    expect(app).toContain("Housekeeping");
    expect(appShell).toContain('can("housekeeping.view_room_status")');
    expect(appShell).toContain('href="/housekeeping"');
    expect(routeScope).toContain('pathname.startsWith("/housekeeping")');
    expect(routeScope).toContain('return "housekeeping.view_room_status"');
  });

  it("no longer shows the placeholder toast for Housekeeping", () => {
    expect(app).not.toContain("Housekeeping task board module is coming soon");
  });

  it("includes day view grouped by room with status and assignee, create/assign form, and status update controls", () => {
    // Note: Updated per Rule 6 to match translation dictionary keys used in Housekeeping.tsx
    expect(component).toContain("Housekeeping");
    expect(component).toContain("housekeeping.dayViewGroupedByRoom");
    expect(component).toContain("housekeeping.groupedByRoom");
    expect(component).toContain("housekeeping.status");
    expect(component).toContain("housekeeping.assignee");
    expect(component).toContain("housekeeping.createTask");
    expect(component).toContain("housekeeping.update_room_status");
    expect(component).toContain("housekeeping.view_room_status");
    expect(component).toContain("due_date");
    expect(component).toContain("pending");
    expect(component).toContain("in_progress");
    expect(component).toContain("done");
    expect(component).toContain('role="status"');
    expect(component).toContain("housekeeping.loadingBoard");
  });

  it("is wired to the real tRPC housekeeping procedures, not local/mock state", () => {
    expect(component).toContain("trpc.channelManager.listHousekeepingTasks.useQuery");
    expect(component).toContain("trpc.channelManager.createHousekeepingTask.useMutation");
    expect(component).toContain("trpc.channelManager.updateHousekeepingTaskStatus.useMutation");
    expect(component).not.toContain("TODO(T03-02)");
    expect(component).not.toContain("seedTasks");
  });
});
