import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("OTA sync page contract", () => {
  const component = readFileSync(resolve(process.cwd(), "client/src/pages/OtaSync.tsx"), "utf8");
  const app = readFileSync(resolve(process.cwd(), "client/src/App.tsx"), "utf8");
  const routeScope = readFileSync(resolve(process.cwd(), "client/src/lib/routeScope.ts"), "utf8");
  const sidebar = readFileSync(resolve(process.cwd(), "client/src/components/layout/Sidebar.tsx"), "utf8");

  it("registers the page and gates access with ota.view_status", () => {
    expect(app).toContain('<OtaSync hotelId={params.id} />');
    expect(routeScope).toContain('return "ota.view_status"');
    expect(sidebar).toContain('can("ota.view_status")');
  });

  it("gates OTA actions by their per-hotel permissions and uses the real procedures", () => {
    expect(component).toContain("hasHotelPermission");
    expect(component).toContain('"ota.manage_ical_connection"');
    expect(component).toContain('"ota.trigger_ical_sync"');
    expect(component).toContain("canManageConnections &&");
    expect(component).toContain("canTriggerSync &&");
    expect(component).toContain("trpc.channelManager.ota.triggerSync.useMutation");
    expect(component).toContain("trpc.channelManager.ota.upsertConnection.useMutation");
    expect(component).toContain("trpc.channelManager.ota.deleteConnection.useMutation");
  });
});
