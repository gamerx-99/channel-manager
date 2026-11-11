// @vitest-environment jsdom
import React from "react";
import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { canCancelBooking, isCancelReasonValid } from "./cancelBooking";

type Options = { onSuccess?: () => Promise<void> | void; onError?: (error: { data?: { code?: string } }) => void };
const mocks = vi.hoisted(() => ({ mutate: vi.fn(), options: {} as Options, invalidate: vi.fn() }));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({ channelManager: { bookings: { invalidate: mocks.invalidate }, dashboard: { invalidate: mocks.invalidate }, bookingOccupancy: { invalidate: mocks.invalidate } } }),
    channelManager: { cancelBooking: { useMutation: (options: Options) => { mocks.options = options; return { mutate: mocks.mutate, isPending: false }; } } },
  },
}));

import CancelBookingDialog from "./CancelBookingDialog";

const HOTEL = "11111111-1111-4111-8111-111111111111";
const onClose = vi.fn();
beforeEach(() => { mocks.mutate.mockReset(); onClose.mockReset(); });
afterEach(cleanup);

function renderDialog() {
  return render(<CancelBookingDialog hotelId={HOTEL} booking={{ id: "booking-1", guest_name: "Somchai" }} onClose={onClose} />);
}

describe("cancel booking dialog (owner decision 5.3)", () => {
  it("keeps Confirm disabled until the reason has at least 3 characters, then sends it", async () => {
    const user = userEvent.setup();
    renderDialog();
    const confirm = screen.getByRole("button", { name: "Confirm cancellation" }) as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);
    await user.type(screen.getByLabelText(/Reason for cancelling/), "  ab ");
    expect(confirm.disabled).toBe(true);
    await user.type(screen.getByLabelText(/Reason for cancelling/), "c");
    expect(confirm.disabled).toBe(false);
    await user.click(confirm);
    expect(mocks.mutate).toHaveBeenCalledWith({ hotel_id: HOTEL, booking_id: "booking-1", reason: "ab c" });

    await act(async () => { await mocks.options.onSuccess?.(); });
    expect(mocks.invalidate).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it("does not cancel when the dialog is closed", async () => {
    renderDialog();
    await userEvent.setup().click(screen.getByRole("button", { name: "Keep booking" }));
    expect(onClose).toHaveBeenCalled();
    expect(mocks.mutate).not.toHaveBeenCalled();
  });

  it("says when the booking changed underneath", () => {
    renderDialog();
    act(() => mocks.options.onError?.({ data: { code: "CONFLICT" } }));
    expect(screen.getByRole("alert").textContent).toContain("status has changed");
  });
});

describe("which bookings show the cancel action", () => {
  it("follows the booking lifecycle", () => {
    expect(["held", "pending_payment", "confirmed"].every(canCancelBooking)).toBe(true);
    expect(["pending_verification", "checked_in", "checked_out", "cancelled", "expired", "refunded"].some(canCancelBooking)).toBe(false);
  });

  it("checks the reason the same way as the server", () => {
    expect(isCancelReasonValid(" ab ")).toBe(false);
    expect(isCancelReasonValid("abc")).toBe(true);
    expect(isCancelReasonValid("x".repeat(501))).toBe(false);
  });

  it("is on the bookings page behind the cancel permission, with no browser prompt", () => {
    const page = readFileSync(resolve(process.cwd(), "client/src/pages/Bookings.tsx"), "utf8");
    expect(page).toContain("'operations.cancel_bookings'");
    expect(page).toContain("canCancelBookings && canCancelBooking(booking.status)");
    expect(page).not.toMatch(/window\.prompt|\bprompt\(/);
  });
});
