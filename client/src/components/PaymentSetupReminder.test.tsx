// @vitest-environment jsdom
import React from "react";
import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const HOTEL = "11111111-1111-4111-8111-111111111111";

const mocks = vi.hoisted(() => ({
  location: "/dashboard",
  status: { data: undefined as undefined | { promptpay_configured: boolean; slipok_configured: boolean }, refetch: vi.fn() },
  useQuery: vi.fn(),
}));

vi.mock("wouter", async () => {
  const actual = await vi.importActual<typeof import("wouter")>("wouter");
  return {
    ...actual,
    useLocation: () => [mocks.location, vi.fn()],
    Link: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => <a href={href} {...props}>{children}</a>,
  };
});
vi.mock("@/lib/trpc", () => ({ trpc: { slipok: { paymentSetupStatus: { useQuery: (...args: unknown[]) => { mocks.useQuery(...args); return mocks.status; } } } } }));

import { PaymentSetupReminder } from "./PaymentSetupReminder";

beforeEach(() => {
  mocks.location = "/dashboard";
  mocks.status = { data: { promptpay_configured: false, slipok_configured: false }, refetch: vi.fn() };
  mocks.useQuery.mockReset();
});
afterEach(() => cleanup());

describe("PaymentSetupReminder", () => {
  it("lists what is missing and links to the finance settings page", () => {
    render(<PaymentSetupReminder hotelId={HOTEL} enabled />);
    const dialog = screen.getByTestId("payment-setup-reminder");
    expect(dialog.textContent).toContain("Payment setup is not finished");
    expect(dialog.textContent).toContain("PromptPay number to receive money");
    expect(dialog.textContent).toContain("SlipOK key to check slips automatically");
    expect(screen.getByRole("link", { name: "Go to finance settings" }).getAttribute("href")).toBe(`/hotels/${HOTEL}/settings/finance`);
  });

  it("names only the setting that is still missing", () => {
    mocks.status = { data: { promptpay_configured: true, slipok_configured: false }, refetch: vi.fn() };
    render(<PaymentSetupReminder hotelId={HOTEL} enabled />);
    const dialog = screen.getByTestId("payment-setup-reminder");
    expect(dialog.textContent).not.toContain("PromptPay number to receive money");
    expect(dialog.textContent).toContain("SlipOK key to check slips automatically");
  });

  it("shows nothing once both are saved, while the status is unknown, or when switched off", () => {
    mocks.status = { data: { promptpay_configured: true, slipok_configured: true }, refetch: vi.fn() };
    const { rerender } = render(<PaymentSetupReminder hotelId={HOTEL} enabled />);
    expect(screen.queryByTestId("payment-setup-reminder")).toBeNull();

    mocks.status = { data: undefined, refetch: vi.fn() };
    rerender(<PaymentSetupReminder hotelId={HOTEL} enabled />);
    expect(screen.queryByTestId("payment-setup-reminder")).toBeNull();

    mocks.status = { data: { promptpay_configured: false, slipok_configured: false }, refetch: vi.fn() };
    rerender(<PaymentSetupReminder hotelId={HOTEL} enabled={false} />);
    expect(screen.queryByTestId("payment-setup-reminder")).toBeNull();
  });

  it("does not ask the server unless it is enabled for this hotel", () => {
    render(<PaymentSetupReminder hotelId={HOTEL} enabled={false} />);
    expect(mocks.useQuery).toHaveBeenCalledWith({ hotel_id: HOTEL }, expect.objectContaining({ enabled: false }));
  });

  it("closes on the Close button and comes back on the next page", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<PaymentSetupReminder hotelId={HOTEL} enabled />);
    await user.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.queryByTestId("payment-setup-reminder")).toBeNull();

    mocks.location = `/hotels/${HOTEL}/bookings`;
    await act(async () => { rerender(<PaymentSetupReminder hotelId={HOTEL} enabled />); });
    expect(screen.getByTestId("payment-setup-reminder")).toBeTruthy();
  });

  it("stays away from the finance settings page", () => {
    mocks.location = `/hotels/${HOTEL}/settings/finance`;
    render(<PaymentSetupReminder hotelId={HOTEL} enabled />);
    expect(screen.queryByTestId("payment-setup-reminder")).toBeNull();
  });

  it("asks again on each page so a fresh save ends the reminder", async () => {
    const { rerender } = render(<PaymentSetupReminder hotelId={HOTEL} enabled />);
    const first = mocks.status.refetch.mock.calls.length;
    mocks.location = "/dashboard/pricing";
    await act(async () => { rerender(<PaymentSetupReminder hotelId={HOTEL} enabled />); });
    expect(mocks.status.refetch.mock.calls.length).toBeGreaterThan(first);
  });
});
