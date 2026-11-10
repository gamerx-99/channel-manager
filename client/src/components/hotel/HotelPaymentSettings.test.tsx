// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import HotelPaymentSettings from "./HotelPaymentSettings";

const savePromptPay = vi.fn();
const saveKey = vi.fn(async () => undefined);
const refetch = vi.fn();
let savedPromptPayId: string | null = null;
let savedTimeoutMin = 15;
let queryLoaded = true;
let onSaveSuccess: ((data: unknown, variables: { promptpay_id: string }) => void) | undefined;
vi.mock("@/lib/trpc", () => ({
  trpc: {
    slipok: {
      getPromptPaySettings: { useQuery: () => ({ data: queryLoaded ? { promptpay_id: savedPromptPayId, payment_timeout_minutes: savedTimeoutMin } : undefined, refetch }) },
      savePromptPayId: { useMutation: (options: { onSuccess: typeof onSaveSuccess }) => { onSaveSuccess = options.onSuccess; return { mutate: savePromptPay, isPending: false }; } },
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
  savedPromptPayId = null;
  savedTimeoutMin = 15;
  queryLoaded = true;
  onSaveSuccess = undefined;
});

describe("HotelPaymentSettings", () => {
  it("fills the saved PromptPay ID and timeout when settings load", async () => {
    queryLoaded = false;
    const view = render(<HotelPaymentSettings hotelId="hotel-1" />);
    const id = screen.getByLabelText("financials.promptPayIdLabel") as HTMLInputElement;
    const timeout = screen.getByLabelText("financials.timeoutLabel") as HTMLSelectElement;
    expect(id.value).toBe("");
    expect(timeout.value).toBe("15");
    savedPromptPayId = "0891234567";
    savedTimeoutMin = 30;
    queryLoaded = true;
    view.rerender(<HotelPaymentSettings hotelId="hotel-1" />);
    await waitFor(() => expect(id.value).toBe("0891234567"));
    expect(timeout.value).toBe("30");
  });

  it("keeps edits when the settings query refetches and loads another hotel", async () => {
    savedPromptPayId = "0891234567";
    savedTimeoutMin = 30;
    const view = render(<HotelPaymentSettings hotelId="hotel-1" />);
    const id = screen.getByLabelText("financials.promptPayIdLabel") as HTMLInputElement;
    const timeout = screen.getByLabelText("financials.timeoutLabel") as HTMLSelectElement;
    await waitFor(() => expect(id.value).toBe("0891234567"));
    fireEvent.change(id, { target: { value: "0812345678" } });
    fireEvent.change(timeout, { target: { value: "60" } });
    savedPromptPayId = "0887654321";
    savedTimeoutMin = 10;
    view.rerender(<HotelPaymentSettings hotelId="hotel-1" />);
    expect(id.value).toBe("0812345678");
    expect(timeout.value).toBe("60");
    view.rerender(<HotelPaymentSettings hotelId="hotel-2" />);
    await waitFor(() => expect(id.value).toBe("0887654321"));
    expect(timeout.value).toBe("10");
  });

  it("shows the normalised stored ID after a successful save", async () => {
    render(<HotelPaymentSettings hotelId="hotel-1" />);
    const id = screen.getByLabelText("financials.promptPayIdLabel") as HTMLInputElement;
    fireEvent.change(id, { target: { value: "+66 81 234 5678" } });
    fireEvent.click(screen.getByRole("button", { name: "financials.savePromptPayId" }));
    await waitFor(() => expect(savePromptPay).toHaveBeenCalledWith({ hotel_id: "hotel-1", promptpay_id: "0812345678", payment_timeout_minutes: 15 }));
    onSaveSuccess?.(undefined, { promptpay_id: "0812345678" });
    await waitFor(() => expect(id.value).toBe("0812345678"));
  });

  it("renders PromptPay and SlipOK settings with an empty password field", () => {
    render(<HotelPaymentSettings hotelId="hotel-1" />);
    expect(screen.getByLabelText("hotelPaymentSettings.title")).toBeTruthy();
    expect(document.querySelector(".hotel-payment-card")).toBeTruthy();
    expect(document.querySelector(".hotel-payment-card-content .form-grid")).toBeTruthy();
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
    fireEvent.change(screen.getByLabelText("slipOk.apiLabel"), { target: { value: "https://api.slipok.com/api/line/apikey/branch-1" } });
    fireEvent.change(screen.getByLabelText("slipOk.keyLabel"), { target: { value: "secret-key-123" } });
    fireEvent.click(screen.getByRole("button", { name: "slipOk.save" }));
    await waitFor(() => expect(saveKey).toHaveBeenCalledWith({ hotel_id: "hotel-1", api_key: "secret-key-123", branch_id: "branch-1" }));
  });

  it("warns about a saved invalid ID and rejects another invalid entry before MFA", async () => {
    savedPromptPayId = "06151256579";
    render(<HotelPaymentSettings hotelId="hotel-1" />);
    expect(screen.getByText("financials.promptPaySavedInvalid")).toBeTruthy();
    expect((screen.getByLabelText("financials.promptPayIdLabel") as HTMLInputElement).value).toBe("06151256579");
    fireEvent.change(screen.getByLabelText("financials.promptPayIdLabel"), { target: { value: "0212345678" } });
    fireEvent.click(screen.getByRole("button", { name: "financials.savePromptPayId" }));
    expect(await screen.findByText("financials.promptPayInvalid")).toBeTruthy();
    expect(savePromptPay).not.toHaveBeenCalled();
  });
});
