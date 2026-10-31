// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { PaymentQR } from "./PaymentQR";

const QR_STRING = "00020101021229370016A000000677010111011300668123456785802TH53037645406100.006304ABCD";
const state = vi.hoisted(() => ({ expiresInMs: 600_000, verifyReply: {} as Record<string, unknown> }));

vi.mock("../lib/trpc", () => ({ trpc: { payment: {
  createSession: { useMutation: (options: { onSuccess: (data: unknown) => void }) => ({
    isPending: false, isError: false,
    mutate: () => options.onSuccess({ sessionId: "s", qrString: QR_STRING, qrImageUrl: "https://api.qrserver.com/v1/create-qr-code/?data=x", amount: 100, expiresAt: new Date(Date.now() + state.expiresInMs).toISOString() }),
  }) },
  checkStatus: { useQuery: () => ({ data: undefined }) },
  verifySlip: { useMutation: (options: { onSuccess: (data: unknown) => void }) => ({ isPending: false, mutate: () => options.onSuccess(state.verifyReply) }) },
} } }));

(globalThis as { React?: typeof React }).React = React;
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe("PaymentQR", () => {
  it("draws the PromptPay QR in the browser instead of loading it from a third-party service", () => {
    render(<PaymentQR bookingId="b" hotelId="h" onSuccess={vi.fn()} onExpired={vi.fn()} />);
    const img = screen.getByAltText("QR Code สำหรับชำระเงินผ่าน PromptPay") as HTMLImageElement;
    expect(img.getAttribute("src")).toMatch(/^data:image\/svg\+xml/);
    expect(img.getAttribute("src")).not.toContain("qrserver");
  });

  it("tells the guest the slip is with the hotel and stops the QR timer (regression: guest was told to restart)", async () => {
    state.expiresInMs = 2_000;
    state.verifyReply = { verified: false, pendingManualReview: true, message: "ระบบกำลังตรวจสอบสลิปของคุณ" };
    const onExpired = vi.fn();
    render(<PaymentQR bookingId="b" hotelId="h" onSuccess={vi.fn()} onExpired={onExpired} />);

    fireEvent.click(screen.getByRole("tab", { name: "อัปโหลดสลิป" }));
    const file = new File(["slip"], "slip.png", { type: "image/png" });
    fireEvent.change(document.getElementById("slip-file-input")!, { target: { files: [file] } });
    fireEvent.click(document.querySelector(".payment-slip-submit")!);
    expect(await screen.findByText("ได้รับสลิปของคุณแล้ว")).toBeTruthy();

    await act(async () => { await new Promise(resolve => setTimeout(resolve, 3_000)); });
    expect(onExpired).not.toHaveBeenCalled();
    expect(screen.queryByText("QR Code หมดอายุแล้ว")).toBeNull();
  }, 10_000);
});
