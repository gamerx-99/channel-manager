import { afterEach, describe, expect, it, vi } from "vitest";
import { createEmailSender, ResendEmailSender } from "./email";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

async function sentBody(send: (sender: ResendEmailSender) => Promise<void>) {
  const fetchMock = vi.fn(async () => new Response(JSON.stringify({ id: "1" }), { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
  await send(new ResendEmailSender("key", "from@example.test"));
  return JSON.parse(String((fetchMock.mock.calls[0] as unknown[])[1] && ((fetchMock.mock.calls[0] as unknown[])[1] as RequestInit).body));
}

describe("ResendEmailSender", () => {
  it("escapes the hotel name in invite HTML but keeps it readable in text", async () => {
    const name = `<a href="https://evil.example">Click</a>`;
    const body = await sentBody(sender => sender.sendInviteEmail({ to: "a@example.test", hotelName: name, inviteUrl: "https://app.example.test/x?token=1&a=2" }));

    expect(body.html).not.toContain(`<a href="https://evil.example">`);
    expect(body.html).toContain("&lt;a href=&quot;https://evil.example&quot;&gt;");
    expect(body.html).toContain("token=1&amp;a=2");
    expect(body.text).toContain(name);
  });

  it("escapes the reset link in password email HTML", async () => {
    const body = await sentBody(sender => sender.sendPasswordResetEmail({ to: "a@example.test", resetUrl: `https://app.example.test/"><img src=x>` }));

    expect(body.html).not.toContain("<img");
  });

  it("does not report a mock delivery when a Worker requires a real mail provider", async () => {
    // createEmailSender falls back to process.env, so a key on the host must not leak in.
    vi.stubEnv("RESEND_API_KEY", "");
    const sender = createEmailSender({}, { required: true });
    await expect(sender.sendEmail({ to: "guest@example.test", subject: "x", html: "x" })).rejects.toThrow("RESEND_API_KEY is required");
  });

  it("passes attachments to the Resend API payload", async () => {
    const body = await sentBody(async sender => {
      await sender.sendEmail({
        to: "guest@example.test",
        subject: "Your Invoice",
        html: "<p>Please find your invoice attached.</p>",
        attachments: [{ filename: "INV-000001.html", content: "<html>Invoice</html>" }],
      });
    });

    expect(body.attachments).toEqual([{ filename: "INV-000001.html", content: "<html>Invoice</html>" }]);
  });

  it("attaches real PDF bytes to booking document email payload", async () => {
    const pdfBytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37]); // %PDF-1.7
    const expectedBase64 = Buffer.from(pdfBytes).toString("base64");

    const body = await sentBody(async sender => {
      await sender.sendBookingDocumentEmail({
        to: "guest@example.test",
        guestName: "สมชาย รักสงบ",
        hotelName: "โรงแรม ล้านนา บูทีค",
        documentType: "invoice",
        documentNumber: "INV-000001",
        pdfBytes,
      });
    });

    expect(body.to).toBe("guest@example.test");
    expect(body.subject).toContain("โรงแรม ล้านนา บูทีค");
    expect(body.subject).toContain("ใบแจ้งชำระเงิน / Invoice - INV-000001");
    expect(body.html).toContain("INV-000001");
    expect(body.html).toContain("สมชาย รักสงบ");
    expect(body.attachments).toEqual([
      {
        filename: "invoice_INV-000001.pdf",
        content: expectedBase64,
        contentType: "application/pdf",
      },
    ]);
  });

  it("handles missing recipient and empty pdfBytes with clear errors", async () => {
    const sender = new ResendEmailSender("key", "from@example.test");
    await expect(sender.sendBookingDocumentEmail({
      to: "",
      guestName: "Guest",
      hotelName: "Hotel",
      documentType: "invoice",
      documentNumber: "INV-000001",
      pdfBytes: new Uint8Array([1, 2, 3]),
    })).rejects.toThrow(/Recipient email address is required/);

    await expect(sender.sendBookingDocumentEmail({
      to: "guest@example.test",
      guestName: "Guest",
      hotelName: "Hotel",
      documentType: "invoice",
      documentNumber: "INV-000001",
      pdfBytes: new Uint8Array([]),
    })).rejects.toThrow(/PDF attachment content is required/);
  });

  it("propagates Resend API failure status and error body", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ message: "Invalid API key" }), { status: 401 }));
    vi.stubGlobal("fetch", fetchMock);
    const sender = new ResendEmailSender("invalid_key", "from@example.test");

    await expect(sender.sendBookingDocumentEmail({
      to: "guest@example.test",
      guestName: "Guest",
      hotelName: "Hotel",
      documentType: "receipt",
      documentNumber: "RC-000001",
      pdfBytes: new Uint8Array([1, 2, 3]),
    })).rejects.toThrow(/Resend email delivery failed \(401\)/);
  });
});

