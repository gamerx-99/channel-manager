// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { PaymentQR } from "./PaymentQR";
import { LanguageProvider } from "../contexts/LanguageContext";
import { en, th } from "../lib/i18n";
import PublicBookingSection from './public-hotel/PublicBookingSection';

const QR_STRING = "00020101021229370016A000000677010111011300668123456785802TH53037645406100.006304ABCD";
const state = vi.hoisted(() => ({ expiresInMs: 600_000, verifyReply: {} as Record<string, unknown>, createError: false, sessionCreates: 0, checkStatus: null as { status: string } | null, qrString: "00020101021229370016A000000677010111011300668123456785802TH53037645406100.006304ABCD" }));
const verifySubmit = vi.hoisted(() => vi.fn());
const verifyNetworkError = vi.hoisted(() => ({ enabled: false }));
const polling = vi.hoisted(() => ({ enabled: false }));

vi.mock("../lib/trpc", () => ({ trpc: { payment: {
  createSession: { useMutation: (options: { onSuccess: (data: unknown) => void }) => ({
    isPending: false, isError: state.createError, error: { message: "This property cannot take PromptPay payments right now. Please contact the property directly." },
    mutate: () => { state.sessionCreates += 1; if (!state.createError) options.onSuccess({ sessionId: "s", qrString: state.qrString, qrImageUrl: "https://api.qrserver.com/v1/create-qr-code/?data=x", amount: 100, expiresAt: new Date(Date.now() + state.expiresInMs).toISOString() }); },
  }) },
  checkStatus: { useQuery: (_input: unknown, options: { enabled: boolean }) => { polling.enabled = options.enabled; return { data: state.checkStatus }; } },
  verifySlip: { useMutation: (options: { onSuccess: (data: unknown) => void; onError: () => void }) => ({ isPending: false, mutate: () => { verifySubmit(); if (verifyNetworkError.enabled) options.onError(); else options.onSuccess(state.verifyReply); } }) },
} } }));

(globalThis as { React?: typeof React }).React = React;
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); verifySubmit.mockClear(); verifyNetworkError.enabled = false; state.createError = false; state.verifyReply = {}; state.expiresInMs = 600_000; state.checkStatus = null; state.sessionCreates = 0; state.qrString = QR_STRING; localStorage.removeItem("language"); });

describe("PaymentQR", () => {
  it.each(["th", "en"] as const)("shows the friendly %s error once without a stored ID", language => {
    state.createError = true;
    localStorage.setItem("language", language);
    render(<LanguageProvider><PaymentQR bookingId="b" hotelId="h" hotelPhone="0895551234" onSuccess={vi.fn()} onExpired={vi.fn()} /></LanguageProvider>);
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

  it("shows an observable readiness reason when the payment session has no QR payload", () => {
    state.qrString = "";
    localStorage.setItem("language", "th");
    render(<LanguageProvider><PaymentQR bookingId="b" hotelId="h" onSuccess={vi.fn()} onExpired={vi.fn()} /></LanguageProvider>);
    expect(screen.getByRole("alert").textContent).toBe(th.publicHotel.paymentQrMissingPayload);
    expect(screen.queryByAltText("QR Code สำหรับชำระเงินผ่าน PromptPay")).toBeNull();
    expect(screen.queryByText(th.publicHotel.paymentQrScanHint)).toBeNull();
    expect(screen.getByRole("tab", { name: "อัปโหลดสลิป" })).toBeTruthy();
    expect(document.getElementById("slip-file-input")).toBeNull();
    fireEvent.click(screen.getByRole("tab", { name: "อัปโหลดสลิป" }));
    expect(document.getElementById("slip-file-input")).toBeTruthy();
  });

  it("shows the missing-payload reason in English when English is selected", () => {
    state.qrString = "";
    localStorage.setItem("language", "en");
    render(<LanguageProvider><PaymentQR bookingId="b" hotelId="h" onSuccess={vi.fn()} onExpired={vi.fn()} /></LanguageProvider>);
    expect(screen.getByRole("alert").textContent).toBe(en.publicHotel.paymentQrMissingPayload);
  });

  it("reports QR rendering failure while keeping the slip upload path available", () => {
    state.qrString = "\uD800";
    localStorage.setItem("language", "th");
    render(<LanguageProvider><PaymentQR bookingId="b" hotelId="h" onSuccess={vi.fn()} onExpired={vi.fn()} /></LanguageProvider>);
    expect(screen.getByRole("alert").textContent).toBe(th.publicHotel.paymentQrRenderFailure);
    expect(screen.queryByText(th.publicHotel.paymentQrScanHint)).toBeNull();
    fireEvent.click(screen.getByRole("tab", { name: "อัปโหลดสลิป" }));
    expect(document.getElementById("slip-file-input")).toBeTruthy();
  });

  it.each([
    ['unsupported', new File(['slip'], 'slip.gif', { type: 'image/gif' }), th.publicHotel.paymentSlipTypeError],
    ['empty', new File([], 'slip.png', { type: 'image/png' }), th.publicHotel.paymentSlipSizeError],
    ['oversized', new File([new Uint8Array(3_500_001)], 'slip.png', { type: 'image/png' }), th.publicHotel.paymentSlipSizeError],
  ])('keeps an %s slip retryable and never submits it', (_label, file, message) => {
    localStorage.setItem('language', 'th');
    render(<LanguageProvider><PaymentQR bookingId="b" hotelId="h" onSuccess={vi.fn()} onExpired={vi.fn()} /></LanguageProvider>);
    fireEvent.click(screen.getByRole('tab', { name: 'อัปโหลดสลิป' }));
    fireEvent.change(document.getElementById('slip-file-input')!, { target: { files: [file] } });
    const button = document.querySelector<HTMLButtonElement>('.payment-slip-submit')!;
    fireEvent.click(button);
    expect(screen.getByRole('alert').textContent).toBe(message);
    expect(button.disabled).toBe(false);
    expect(verifySubmit).not.toHaveBeenCalled();
  });

  it('allows retry after the browser fails to read a slip', async () => {
    localStorage.setItem('language', 'th');
    state.verifyReply = { verified: true };
    const onSuccess = vi.fn();
    const read = vi.spyOn(FileReader.prototype, 'readAsDataURL').mockImplementation(function (this: FileReader) {
      this.dispatchEvent(new ProgressEvent('error'));
    });
    render(<LanguageProvider><PaymentQR bookingId="b" hotelId="h" onSuccess={onSuccess} onExpired={vi.fn()} /></LanguageProvider>);
    fireEvent.click(screen.getByRole('tab', { name: 'อัปโหลดสลิป' }));
    fireEvent.change(document.getElementById('slip-file-input')!, { target: { files: [new File(['slip'], 'slip.png', { type: 'image/png' })] } });
    const button = document.querySelector<HTMLButtonElement>('.payment-slip-submit')!;
    fireEvent.click(button);
    expect(screen.getByRole('alert').textContent).toBe(th.publicHotel.paymentSlipReadError);
    expect(button.disabled).toBe(false);
    expect(verifySubmit).not.toHaveBeenCalled();
    read.mockRestore();
    fireEvent.click(button);
    await waitFor(() => expect(onSuccess).toHaveBeenCalledOnce());
    expect(state.sessionCreates).toBe(1);
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

  it("directs an unreadable slip to property staff without claiming payment was rejected", async () => {
    localStorage.setItem('language', 'th');
    state.verifyReply = { verified: false, retrySlip: true, message: "อ่านรูปสลิปไม่ได้ กรุณาอัปโหลดรูปสลิปที่ชัดเจนอีกครั้ง" };
    render(<LanguageProvider><PaymentQR bookingId="b" hotelId="h" onSuccess={vi.fn()} onExpired={vi.fn()} /></LanguageProvider>);

    fireEvent.click(screen.getByRole("tab", { name: "อัปโหลดสลิป" }));
    fireEvent.change(document.getElementById("slip-file-input")!, { target: { files: [new File(["slip"], "slip.png", { type: "image/png" })] } });
    fireEvent.click(document.querySelector(".payment-slip-submit")!);

    expect(await screen.findByText(th.publicHotel.paymentUnderReviewTitle)).toBeTruthy();
    expect(screen.queryByRole("tablist")).toBeNull();
    expect(screen.queryByText(th.publicHotel.paymentRejectedTitle)).toBeNull();
    expect(state.sessionCreates).toBe(1);
  });

  it.each(['rejected', 'under-review', 'unreadable', 'network-error'])('shows configured hotel contacts after %s verification', async outcome => {
    localStorage.setItem('language', 'th');
    state.verifyReply = outcome === 'under-review' ? { pendingManualReview: true } : outcome === 'unreadable' ? { retrySlip: true } : { verified: false };
    verifyNetworkError.enabled = outcome === 'network-error';
    const onSuccess = vi.fn();
    render(<LanguageProvider><PaymentQR bookingId="abcdef12-booking" hotelId="h" hotelPhone="081-234-5678" hotelFacebookUrl="https://www.facebook.com/test-property" onSuccess={onSuccess} onExpired={vi.fn()} /></LanguageProvider>);
    fireEvent.click(screen.getByRole('tab', { name: 'อัปโหลดสลิป' }));
    fireEvent.change(document.getElementById('slip-file-input')!, { target: { files: [new File(['slip'], 'slip.png', { type: 'image/png' })] } });
    fireEvent.click(document.querySelector('.payment-slip-submit')!);
    expect((await screen.findByRole('link', { name: 'Facebook' })).getAttribute('href')).toBe('https://www.facebook.com/test-property');
    expect(screen.getByRole('link', { name: '0812345678' }).getAttribute('href')).toBe('tel:0812345678');
    expect(screen.getByText('เลขการจอง: ABCDEF12')).toBeTruthy();
    expect(onSuccess).not.toHaveBeenCalled();
    expect(screen.queryByRole('tablist')).toBeNull();
  });

  it('does not invent contact details or render an unsafe configured URL', async () => {
    localStorage.setItem('language', 'th');
    state.verifyReply = { pendingManualReview: true };
    render(<LanguageProvider><PaymentQR bookingId="b" hotelId="h" hotelFacebookUrl="javascript:alert(1)" onSuccess={vi.fn()} onExpired={vi.fn()} /></LanguageProvider>);
    fireEvent.click(screen.getByRole('tab', { name: 'อัปโหลดสลิป' }));
    fireEvent.change(document.getElementById('slip-file-input')!, { target: { files: [new File(['slip'], 'slip.png', { type: 'image/png' })] } });
    fireEvent.click(document.querySelector('.payment-slip-submit')!);
    expect(await screen.findByText(th.publicHotel.paymentContactUnavailable)).toBeTruthy();
    expect(screen.queryAllByRole('link')).toHaveLength(0);
  });

  it.each(['hotel-1', 'other-hotel'])('uses public contact settings only for the booking hotel (%s)', async bookingHotelId => {
    localStorage.setItem('language', 'th');
    state.verifyReply = { pendingManualReview: true };
    const page = {
      hotel: { id: 'hotel-1', name: 'Configured property', public_phone: '089-555-1234', facebook_url: 'https://www.facebook.com/configured-property' },
      t: (key: string) => key,
      booking: {
        wizardStep: 6, paymentSuccess: false, heldBooking: { bookingId: 'booking-1', hotelId: bookingHotelId },
        setPaymentSuccess: vi.fn(), setWizardError: vi.fn(), handleResetBooking: vi.fn(),
      },
    } as unknown as React.ComponentProps<typeof PublicBookingSection>['page'];
    render(<LanguageProvider><PublicBookingSection page={page} /></LanguageProvider>);
    fireEvent.click(screen.getByRole('tab', { name: 'อัปโหลดสลิป' }));
    fireEvent.change(document.getElementById('slip-file-input')!, { target: { files: [new File(['slip'], 'slip.png', { type: 'image/png' })] } });
    fireEvent.click(document.querySelector('.payment-slip-submit')!);
    if (bookingHotelId === 'hotel-1') {
      expect((await screen.findByRole('link', { name: 'Facebook' })).getAttribute('href')).toBe('https://www.facebook.com/configured-property');
      expect(screen.getByRole('link', { name: '0895551234' }).getAttribute('href')).toBe('tel:0895551234');
    } else {
      expect(await screen.findByText(th.publicHotel.paymentContactUnavailable)).toBeTruthy();
      expect(screen.queryAllByRole('link')).toHaveLength(0);
    }
  });

  it.each([false, true])('keeps contact visible after expiry and accepts a later paid result (rejected=%s)', async rejected => {
    localStorage.setItem('language', 'th');
    state.verifyReply = rejected ? { verified: false } : { pendingManualReview: true };
    const onExpired = vi.fn(), onSuccess = vi.fn();
    const content = <LanguageProvider><PaymentQR bookingId="b" hotelId="h" hotelPhone="0895551234" onSuccess={onSuccess} onExpired={onExpired} /></LanguageProvider>;
    const view = render(content);
    fireEvent.click(screen.getByRole('tab', { name: 'อัปโหลดสลิป' }));
    fireEvent.change(document.getElementById('slip-file-input')!, { target: { files: [new File(['slip'], 'slip.png', { type: 'image/png' })] } });
    fireEvent.click(document.querySelector('.payment-slip-submit')!);
    expect(await screen.findByRole('link', { name: '0895551234' })).toBeTruthy();
    expect(polling.enabled).toBe(true);
    act(() => { state.checkStatus = { status: 'expired' }; view.rerender(<LanguageProvider><PaymentQR bookingId="b" hotelId="h" hotelPhone="0895551234" onSuccess={onSuccess} onExpired={onExpired} /></LanguageProvider>); });
    expect(onExpired).not.toHaveBeenCalled();
    expect(screen.getByRole('link', { name: '0895551234' })).toBeTruthy();
    act(() => { state.checkStatus = { status: 'paid' }; view.rerender(<LanguageProvider><PaymentQR bookingId="b" hotelId="h" onSuccess={onSuccess} onExpired={onExpired} /></LanguageProvider>); });
    await waitFor(() => expect(onSuccess).toHaveBeenCalledOnce());
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
