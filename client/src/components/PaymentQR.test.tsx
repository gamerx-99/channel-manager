// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { PaymentQR } from "./PaymentQR";
import { LanguageProvider } from "../contexts/LanguageContext";
import { en, th } from "../lib/i18n";

const QR_STRING = "00020101021229370016A000000677010111011300668123456785802TH53037645406100.006304ABCD";
const state = vi.hoisted(() => ({ expiresInMs: 600_000, verifyReply: {} as Record<string, unknown>, createError: false, sessionCreates: 0, checkStatus: null as { status: string } | null }));

vi.mock("../lib/trpc", () => ({ trpc: { payment: {
  createSession: { useMutation: (options: { onSuccess: (data: unknown) => void }) => ({
    isPending: false, isError: state.createError, error: { message: "This property cannot take PromptPay payments right now. Please contact the property directly." },
    mutate: () => { state.sessionCreates += 1; if (!state.createError) options.onSuccess({ sessionId: "s", qrString: QR_STRING, qrImageUrl: "https://api.qrserver.com/v1/create-qr-code/?data=x", amount: 100, expiresAt: new Date(Date.now() + state.expiresInMs).toISOString() }); },
  }) },
  checkStatus: { useQuery: () => ({ data: state.checkStatus }) },
  verifySlip: { useMutation: (options: { onSuccess: (data: unknown) => void }) => ({ isPending: false, mutate: () => options.onSuccess(state.verifyReply) }) },
} } }));

(globalThis as { React?: typeof React }).React = React;
afterEach(() => { cleanup(); vi.useRealTimers(); state.createError = false; state.verifyReply = {}; state.expiresInMs = 600_000; state.checkStatus = null; state.sessionCreates = 0; localStorage.removeItem("language"); });

describe("PaymentQR", () => {
  it.each(["th", "en"] as const)("shows the friendly %s error once without a stored ID", language => {
    state.createError = true;
    localStorage.setItem("language", language);
    render(<LanguageProvider><PaymentQR bookingId="b" hotelId="h" onSuccess={vi.fn()} onExpired={vi.fn()} /></LanguageProvider>);
    const message = language === "th" ? th.serverErrors.promptPayUnavailable : en.serverErrors.promptPayUnavailable;
    expect(screen.getByText(message)).toBeTruthy();
    expect(screen.getByRole("alert").textContent).not.toContain("06151256579");
    expect(screen.getByRole("alert").querySelectorAll("p")).toHaveLength(1);
  });
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
    localStorage.setItem("language", "th");
    render(<LanguageProvider><PaymentQR bookingId="b" hotelId="h" onSuccess={vi.fn()} onExpired={onExpired} /></LanguageProvider>);

    fireEvent.click(screen.getByRole("tab", { name: "อัปโหลดสลิป" }));
    const file = new File(["slip"], "slip.png", { type: "image/png" });
    fireEvent.change(document.getElementById("slip-file-input")!, { target: { files: [file] } });
    fireEvent.click(document.querySelector(".payment-slip-submit")!);
    expect(await screen.findByText(th.publicHotel.paymentUnderReviewTitle)).toBeTruthy();

    await act(async () => { await new Promise(resolve => setTimeout(resolve, 3_000)); });
    expect(onExpired).not.toHaveBeenCalled();
    expect(screen.queryByText("QR Code หมดอายุแล้ว")).toBeNull();
  }, 10_000);

  it("shows a payment status asking the guest to contact the hotel when SlipOK rejects a slip", async () => {
    state.verifyReply = { verified: false, message: "ไม่พบการชำระเงินที่ตรงกัน กรุณาติดต่อที่พัก" };
    localStorage.setItem("language", "th");
    render(<LanguageProvider><PaymentQR bookingId="b" hotelId="h" onSuccess={vi.fn()} onExpired={vi.fn()} /></LanguageProvider>);

    fireEvent.click(screen.getByRole("tab", { name: "อัปโหลดสลิป" }));
    fireEvent.change(document.getElementById("slip-file-input")!, { target: { files: [new File(["slip"], "slip.png", { type: "image/png" })] } });
    fireEvent.click(document.querySelector(".payment-slip-submit")!);

    expect(await screen.findByText(th.publicHotel.paymentRejectedTitle)).toBeTruthy();
    expect(screen.getByText(th.publicHotel.paymentRejectedDesc)).toBeTruthy();
    expect(screen.queryByRole("tablist")).toBeNull();
  });

  it("reports a verified slip through the success callback", async () => {
    state.verifyReply = { verified: true, message: "ชำระเงินสำเร็จ" };
    const onSuccess = vi.fn();
    render(<PaymentQR bookingId="b" hotelId="h" onSuccess={onSuccess} onExpired={vi.fn()} />);

    fireEvent.click(screen.getByRole("tab", { name: "อัปโหลดสลิป" }));
    fireEvent.change(document.getElementById("slip-file-input")!, { target: { files: [new File(["slip"], "slip.png", { type: "image/png" })] } });
    fireEvent.click(document.querySelector(".payment-slip-submit")!);

    await waitFor(() => expect(onSuccess).toHaveBeenCalledOnce());
  });

  it("keeps an unreadable slip retryable instead of presenting it as rejected", async () => {
    state.verifyReply = { verified: false, retrySlip: true, message: "อ่านรูปสลิปไม่ได้ กรุณาอัปโหลดรูปสลิปที่ชัดเจนอีกครั้ง" };
    render(<PaymentQR bookingId="b" hotelId="h" onSuccess={vi.fn()} onExpired={vi.fn()} />);

    fireEvent.click(screen.getByRole("tab", { name: "อัปโหลดสลิป" }));
    fireEvent.change(document.getElementById("slip-file-input")!, { target: { files: [new File(["slip"], "slip.png", { type: "image/png" })] } });
    fireEvent.click(document.querySelector(".payment-slip-submit")!);

    expect(await screen.findByText(state.verifyReply.message as string)).toBeTruthy();
    expect(screen.getByRole("tablist")).toBeTruthy();
    expect(screen.queryByText(th.publicHotel.paymentRejectedTitle)).toBeNull();

    fireEvent.change(document.getElementById("slip-file-input")!, { target: { files: [new File(["clear slip"], "clear.png", { type: "image/png" })] } });
    fireEvent.click(document.querySelector(".payment-slip-submit")!);
    expect(state.sessionCreates).toBe(1);
  });

  it("keeps checking after the QR timer stops and shows success after staff approval", async () => {
    localStorage.setItem("language", "th");
    state.verifyReply = { verified: false, pendingManualReview: true, message: "กำลังตรวจสอบ" };
    const onSuccess = vi.fn();
    const view = render(<LanguageProvider><PaymentQR bookingId="b" hotelId="h" onSuccess={onSuccess} onExpired={vi.fn()} /></LanguageProvider>);
    fireEvent.click(screen.getByRole("tab", { name: "อัปโหลดสลิป" }));
    fireEvent.change(document.getElementById("slip-file-input")!, { target: { files: [new File(["slip"], "slip.png", { type: "image/png" })] } });
    fireEvent.click(document.querySelector(".payment-slip-submit")!);
    expect(await screen.findByText(th.publicHotel.paymentUnderReviewTitle)).toBeTruthy();

    act(() => { state.checkStatus = { status: "paid" }; view.rerender(<LanguageProvider><PaymentQR bookingId="b" hotelId="h" onSuccess={onSuccess} onExpired={vi.fn()} /></LanguageProvider>); });
    await waitFor(() => expect(onSuccess).toHaveBeenCalledOnce());
  });

  it("shows the contact-hotel result when staff rejects the slip", async () => {
    localStorage.setItem("language", "th");
    state.verifyReply = { verified: false, pendingManualReview: true, message: "กำลังตรวจสอบ" };
    const view = render(<LanguageProvider><PaymentQR bookingId="b" hotelId="h" onSuccess={vi.fn()} onExpired={vi.fn()} /></LanguageProvider>);
    fireEvent.click(screen.getByRole("tab", { name: "อัปโหลดสลิป" }));
    fireEvent.change(document.getElementById("slip-file-input")!, { target: { files: [new File(["slip"], "slip.png", { type: "image/png" })] } });
    fireEvent.click(document.querySelector(".payment-slip-submit")!);
    expect(await screen.findByText(th.publicHotel.paymentUnderReviewTitle)).toBeTruthy();

    act(() => { state.checkStatus = { status: "failed" }; view.rerender(<LanguageProvider><PaymentQR bookingId="b" hotelId="h" onSuccess={vi.fn()} onExpired={vi.fn()} /></LanguageProvider>); });
    expect(await screen.findByText(th.publicHotel.paymentRejectedTitle)).toBeTruthy();
    expect(screen.getByText(th.publicHotel.paymentRejectedDesc)).toBeTruthy();
  });
});
