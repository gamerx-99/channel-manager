// @vitest-environment jsdom
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import OtaSyncStatusWidget from "./OtaSyncStatusWidget";
import { formatOtaSyncDate, getOtaStatusMeta, type OtaSummaryItem } from "./OtaSyncStatusWidget.utils";

vi.mock("wouter", () => ({
  Link: ({ href, children, ...props }: { href: string; children: React.ReactNode } & React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

afterEach(() => cleanup());

const healthyItem: OtaSummaryItem = {
  id: "connection-1",
  hotel_id: "hotel-1",
  hotel_name: "Little Bro",
  provider: "booking",
  status: "connected",
  last_sync_at: "2026-08-19T04:30:00.000Z",
  recent_updated_item_count: 3,
  latest_log: { status: "success", created_at: "2026-08-19T04:30:00.000Z" },
};

const failedItem: OtaSummaryItem = {
  ...healthyItem,
  id: "connection-2",
  provider: "agoda",
  status: "connected",
  latest_log: { status: "failed", error_message: "iCal feed timed out", created_at: "2026-08-19T04:25:00.000Z" },
};

const defaultProps = {
  items: [healthyItem],
  isLoading: false,
  onRetry: vi.fn(),
  onSync: vi.fn(),
  syncingId: null,
  manageHref: "/hotels/hotel-1/ota",
};

describe("OtaSyncStatusWidget", () => {
  it("maps connection and latest log values to stable health labels", () => {
    expect(getOtaStatusMeta(healthyItem)).toEqual({ tone: "healthy", label: "Healthy" });
    expect(getOtaStatusMeta(failedItem)).toEqual({ tone: "error", label: "Sync error" });
    expect(getOtaStatusMeta({ status: "disconnected", latest_log: null })).toEqual({ tone: "warning", label: "disconnected" });
  });

  it("renders the latest sync time, recent sync count, and a property-scoped logs link", () => {
    render(<OtaSyncStatusWidget {...defaultProps} />);

    expect(screen.getByRole("heading", { name: "Connected channels summary" })).toBeTruthy();
    expect(screen.getByText("Booking")).toBeTruthy();
    expect(screen.getByText("Little Bro")).toBeTruthy();
    expect(screen.getByText("Updated items")).toBeTruthy();
    expect(screen.getByText("3")).toBeTruthy();
    expect(screen.getByText(formatOtaSyncDate(healthyItem.last_sync_at))).toBeTruthy();
    expect(screen.getByRole("link", { name: "View sync logs" }).getAttribute("href")).toBe("/hotels/hotel-1/ota");
  });

  it("exposes failed sync details and calls the item callback from Sync Now", async () => {
    const user = userEvent.setup();
    const onSync = vi.fn();
    render(<OtaSyncStatusWidget {...defaultProps} items={[failedItem]} onSync={onSync} />);

    expect(screen.getByText("Sync error")).toBeTruthy();
    expect(screen.getByText("iCal feed timed out")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Sync Now for Agoda at Little Bro" }));
    expect(onSync).toHaveBeenCalledWith(failedItem);
  });

  it("supports keyboard activation for Sync Now and focus on the logs link", async () => {
    const user = userEvent.setup();
    const onSync = vi.fn();
    render(<OtaSyncStatusWidget {...defaultProps} onSync={onSync} />);

    const syncButton = screen.getByRole("button", { name: "Sync Now for Booking at Little Bro" });
    syncButton.focus();
    await user.keyboard("{Enter}");
    syncButton.focus();
    await user.keyboard(" ");
    expect(onSync).toHaveBeenCalledTimes(2);

    const logsLink = screen.getByRole("link", { name: "View sync logs" });
    logsLink.focus();
    expect(document.activeElement).toBe(logsLink);
  });

  it("keeps loading, retry, and empty states accessible", async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    const { rerender } = render(<OtaSyncStatusWidget {...defaultProps} isLoading />);
    expect(screen.getByRole("status")).toBeTruthy();
    expect(screen.getByText("Loading OTA calendar sync status…")).toBeTruthy();

    rerender(<OtaSyncStatusWidget {...defaultProps} isLoading={false} errorMessage="Network unavailable" onRetry={onRetry} />);
    expect(screen.getByRole("alert")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: /Retry/ }));
    expect(onRetry).toHaveBeenCalledOnce();

    rerender(<OtaSyncStatusWidget {...defaultProps} isLoading={false} items={[]} />);
    expect(screen.getByRole("status")).toBeTruthy();
    expect(screen.getByText(/No OTA channels connected yet/)).toBeTruthy();
  });
});
