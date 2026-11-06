// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import HotelPaymentSettings from "./HotelPaymentSettings";

const savePromptPay = vi.fn();
const saveKey = vi.fn(async () => undefined);
const refetch = vi.fn();
vi.mock("@/lib/trpc", () => ({
  trpc: {
    slipok: {
      savePromptPayId: { useMutation: () => ({ mutate: savePromptPay, isPending: false }) },
      getSettings: { useQuery: () => ({ data: { configured: false, branchId: null }, isLoading: false, isError: false, refetch }) },
      saveKey: { useMutation: () => ({ mutateAsync: saveKey, isPending: false }) },
      removeKey: { useMutation: () => ({ mutateAsync: vi.fn(), isPending: false }) },
    },
  },
}));
vi.mock("@/lib/mfa", () => ({ useMfaStepUp: () => ({ mfaState: { status: "verified" }, triggerStepUp: async () => "verified", submitTotp: async () => true, reset: vi.fn() }) }));
vi.mock("@/lib/i18n", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("HotelPaymentSettings", () => {
  it("renders PromptPay and SlipOK settings with an empty password field", () => {
    render(<HotelPaymentSettings hotelId="hotel-1" />);
    expect(screen.getByLabelText("hotelPaymentSettings.title")).toBeTruthy();
    expect(screen.getByLabelText("financials.promptPayIdLabel")).toBeTruthy();
    expect(screen.getByLabelText("financials.timeoutLabel")).toBeTruthy();
    const key = screen.getByLabelText("slipOk.keyLabel") as HTMLInputElement;
    expect(key.type).toBe("password");
    expect(key.value).toBe("");
  });

  it("saves through savePromptPayId and saveKey", async () => {
    render(<HotelPaymentSettings hotelId="hotel-1" />);
    fireEvent.change(screen.getByLabelText("financials.promptPayIdLabel"), { target: { value: "0812345678" } });
    fireEvent.click(screen.getByRole("button", { name: "financials.savePromptPayId" }));
    await waitFor(() => expect(savePromptPay).toHaveBeenCalledWith({ hotel_id: "hotel-1", promptpay_id: "0812345678", payment_timeout_minutes: 15 }));
    fireEvent.change(screen.getByLabelText("slipOk.branchLabel"), { target: { value: "branch-1" } });
    fireEvent.change(screen.getByLabelText("slipOk.keyLabel"), { target: { value: "secret-key-123" } });
    fireEvent.click(screen.getByRole("button", { name: "slipOk.save" }));
    await waitFor(() => expect(saveKey).toHaveBeenCalledWith({ hotel_id: "hotel-1", api_key: "secret-key-123", branch_id: "branch-1" }));
  });
});
