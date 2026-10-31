// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { PaymentQR } from "./PaymentQR";

const QR_STRING = "00020101021229370016A000000677010111011300668123456785802TH53037645406100.006304ABCD";

vi.mock("../lib/trpc", () => ({ trpc: { payment: {
  createSession: { useMutation: (options: { onSuccess: (data: unknown) => void }) => ({
    isPending: false, isError: false,
    mutate: () => options.onSuccess({ sessionId: "s", qrString: QR_STRING, qrImageUrl: "https://api.qrserver.com/v1/create-qr-code/?data=x", amount: 100, expiresAt: new Date(Date.now() + 600_000).toISOString() }),
  }) },
  checkStatus: { useQuery: () => ({ data: undefined }) },
  verifySlip: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
} } }));

(globalThis as { React?: typeof React }).React = React;
afterEach(() => { cleanup(); });

describe("PaymentQR", () => {
  it("draws the PromptPay QR in the browser instead of loading it from a third-party service", () => {
    render(<PaymentQR bookingId="b" hotelId="h" onSuccess={vi.fn()} onExpired={vi.fn()} />);
    const img = screen.getByAltText("QR Code สำหรับชำระเงินผ่าน PromptPay") as HTMLImageElement;
    expect(img.getAttribute("src")).toMatch(/^data:image\/svg\+xml/);
    expect(img.getAttribute("src")).not.toContain("qrserver");
  });
});
