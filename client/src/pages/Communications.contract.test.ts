import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("Communications contract", () => {
  const component = readFileSync(resolve(process.cwd(), "client/src/pages/Communications.tsx"), "utf8");
  const app = readFileSync(resolve(process.cwd(), "client/src/App.tsx"), "utf8");
  const appShell = readFileSync(resolve(process.cwd(), "client/src/components/layout/AppShell.tsx"), "utf8");
  const routeScope = readFileSync(resolve(process.cwd(), "client/src/lib/routeScope.ts"), "utf8");
  const bookings = readFileSync(resolve(process.cwd(), "client/src/pages/Bookings.tsx"), "utf8");

  it("registers the page route and gates sidebar link with operations.view_bookings", () => {
    expect(app).toContain('path="/communications"');
    expect(app).toContain("Communications");
    expect(appShell).toContain('can("operations.view_bookings")');
    expect(appShell).toContain('href="/communications"');
    expect(routeScope).toContain('"/communications"');
    expect(routeScope).toContain('return "operations.view_bookings"');
  });

  it("no longer shows the placeholder toast for Communications", () => {
    expect(app).not.toContain("Communications & Messaging module is coming soon");
  });

  it("includes thread list attached to booking, view/post gated by operations.* and message markers", () => {
    expect(component).toContain("Communications");
    expect(component).toContain("Thread list");
    expect(component).toContain("attached to booking");
    expect(component).toContain("operations.view_bookings");
    expect(component).toContain("operations.manage_bookings");
    expect(component).toContain("listMessages");
    expect(component).toContain("sendMessage");
    expect(component).toContain("booking_id");
    expect(component).toContain("Send message");
    expect(component).toContain('role="status"');
    expect(component).toContain("Loading communications");
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
    expect(bookings).toContain("/communications");
    expect(bookings).toContain("bookingId");
  });
});
