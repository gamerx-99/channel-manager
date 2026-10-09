import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("Communications contract", () => {
  const component = readFileSync(resolve(process.cwd(), "client/src/pages/Communications.tsx"), "utf8");
  const app = readFileSync(resolve(process.cwd(), "client/src/App.tsx"), "utf8");
  const appShell = readFileSync(resolve(process.cwd(), "client/src/components/layout/Sidebar.tsx"), "utf8");
  const routeScope = readFileSync(resolve(process.cwd(), "client/src/lib/routeScope.ts"), "utf8");
  const bookings = readFileSync(resolve(process.cwd(), "client/src/pages/Bookings.tsx"), "utf8");
  const featureFlags = readFileSync(resolve(process.cwd(), "client/src/lib/featureFlags.ts"), "utf8");

  it("hides the route, sidebar entry, and booking shortcut unless the feature flag is enabled", () => {
    expect(featureFlags).toContain('value === \'true\'');
    expect(app).toContain('communicationsEnabled && <Route path="/communications">');
    expect(app).toContain('path="/communications"');
    expect(app).toContain("Communications");
    expect(appShell).toContain('communicationsEnabled && can("operations.view_bookings")');
    expect(appShell).toContain('href="/communications"');
    expect(routeScope).toContain('"/communications"');
    expect(routeScope).toContain('return "operations.view_bookings"');
  });

  it("no longer shows the placeholder toast for Communications", () => {
    expect(app).not.toContain("Communications & Messaging module is coming soon");
  });

  it("includes thread list attached to booking, view/post gated by operations.* and message markers", () => {
    // Note: Updated per Rule 6 to match translation dictionary keys used in Communications.tsx
    expect(component).toContain("Communications");
    expect(component).toContain("communications.threadList");
    expect(component).toContain("communications.attachedToBooking");
    expect(component).toContain("operations.view_bookings");
    expect(component).toContain("operations.manage_bookings");
    expect(component).toContain("listMessages");
    expect(component).toContain("sendMessage");
    expect(component).toContain("booking_id");
    expect(component).toContain("communications.sendMessage");
    expect(component).toContain('role="status"');
    expect(component).toContain("communications.loadingCommunications");
  });

  it("is wired to the real tRPC messaging procedures, not local/mock state", () => {
    expect(component).toContain("trpc.channelManager.listThreads.useQuery");
    expect(component).toContain("trpc.channelManager.createThread.useMutation");
    expect(component).toContain("trpc.channelManager.listMessages.useQuery");
    expect(component).toContain("trpc.channelManager.sendMessage.useMutation");
    expect(component).not.toContain("TODO(T04-04)");
    expect(component).not.toContain("seedThreads");
  });

  it("provides entry from Bookings.tsx to communications", () => {
    expect(bookings).toContain('communicationsEnabled && <Link href={`/communications?bookingId=${booking.id}`}');
    expect(bookings).toContain("/communications");
    expect(bookings).toContain("bookingId");
  });
});
