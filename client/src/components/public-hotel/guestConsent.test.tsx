// @vitest-environment jsdom
import React from "react";
import { act, cleanup, render, renderHook, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { en } from "@/lib/i18n";
import BookingStepGuest from "./BookingStepGuest";

const mocks = vi.hoisted(() => ({ confirmMutate: vi.fn() }));
vi.mock("@/lib/trpc", () => ({
  trpc: {
    channelManager: {
      publicHotelAvailability: { useQuery: () => ({ data: undefined }) },
      holdRoomType: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
      listPublicHotelServices: { useQuery: () => ({ data: [] }) },
      confirmBookingDetails: { useMutation: () => ({ mutate: mocks.confirmMutate, isPending: false }) },
    },
  },
}));

import { useBookingWizard } from "./useBookingWizard";

const t = (key: string) => {
  const [block, name] = key.split(".") as [keyof typeof en, string];
  return (en[block] as Record<string, string> | undefined)?.[name] ?? key;
};

beforeEach(() => mocks.confirmMutate.mockReset());
afterEach(cleanup);

function guestStep(overrides: Record<string, unknown> = {}) {
  const props = {
    t, guestName: "Somchai", setGuestName: vi.fn(), guestPhone: "", setGuestPhone: vi.fn(), guestEmail: "", setGuestEmail: vi.fn(),
    specialRequests: "", setSpecialRequests: vi.fn(), termsAccepted: false, setTermsAccepted: vi.fn(),
    confirmDetailsMutation: { isPending: false }, handleConfirmDetails: vi.fn(), setWizardStep: vi.fn(), ...overrides,
  };
  return { props, view: render(<BookingStepGuest {...(props as any)} />) };
}

describe("guest consent before payment (owner decision 3.2)", () => {
  it("keeps Next disabled until the box is ticked", async () => {
    const { props, view } = guestStep();
    const next = screen.getByRole("button", { name: en.publicHotel.wizardNext }) as HTMLButtonElement;
    const box = screen.getByRole("checkbox", { name: /booking conditions/ }) as HTMLInputElement;
    expect(box.checked).toBe(false);
    expect(next.disabled).toBe(true);
    await userEvent.setup().click(box);
    expect(props.setTermsAccepted).toHaveBeenCalledWith(true);

    view.rerender(<BookingStepGuest {...({ ...props, termsAccepted: true } as any)} />);
    expect((screen.getByRole("button", { name: en.publicHotel.wizardNext }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("links the conditions and the privacy policy in a new tab", () => {
    guestStep();
    const terms = screen.getByRole("link", { name: "booking conditions" });
    const privacy = screen.getByRole("link", { name: "privacy policy" });
    expect(terms.getAttribute("href")).toBe("/terms");
    expect(privacy.getAttribute("href")).toBe("/privacy");
    for (const link of [terms, privacy]) {
      expect(link.getAttribute("target")).toBe("_blank");
      expect(link.getAttribute("rel")).toBe("noopener noreferrer");
    }
  });

  it("does not call the server while the box is unticked, and does once it is ticked", () => {
    const { result } = renderHook(() => useBookingWizard({ slug: "demo", t, roomTypes: [], visibleSections: null, hotelReady: false }));
    const submit = () => ({ preventDefault: vi.fn() }) as unknown as React.FormEvent;
    act(() => {
      result.current.setHeldBooking({ bookingId: "b1", hotelId: "h1", roomId: "r1", expiresAt: "2099-01-01T00:00:00.000Z", roomTypeName: "", roomNumber: "", totalPrice: 0, nights: 1 });
      result.current.setGuestName("Somchai");
      result.current.setGuestEmail("guest@example.test");
    });
    act(() => result.current.handleConfirmDetails(submit()));
    expect(mocks.confirmMutate).not.toHaveBeenCalled();
    expect(result.current.wizardError).toBe(en.guestConsent.required);

    act(() => result.current.setTermsAccepted(true));
    act(() => result.current.handleConfirmDetails(submit()));
    expect(mocks.confirmMutate).toHaveBeenCalledOnce();
    expect(mocks.confirmMutate.mock.calls[0]![0]).not.toHaveProperty("terms_accepted");
  });
});
