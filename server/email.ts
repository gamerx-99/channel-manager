import { escapeHtml } from "@shared/escapeHtml";
import { uint8ArrayToBase64 } from "./pdf/bookingDocumentPdf";

export interface EmailAttachment {
  filename: string;
  content: string;
  path?: string;
  contentType?: string;
}

export interface EmailPayload {
  to: string;
  subject: string;
  html: string;
  text?: string;
  from?: string;
  attachments?: EmailAttachment[];
}

export interface SendInviteEmailParams {
  to: string;
  hotelName: string;
  inviteUrl: string;
  roleName?: string;
  inviterName?: string;
}

export interface SendPasswordResetEmailParams {
  to: string;
  resetUrl: string;
  userName?: string;
}

export interface SendVerificationEmailParams {
  to: string;
  verifyUrl: string;
}

export interface SendBookingDocumentEmailParams {
  to: string;
  guestName: string;
  hotelName: string;
  documentType: "invoice" | "receipt" | "tax_invoice";
  documentNumber: string;
  pdfBytes: Uint8Array;
}

export interface EmailSender {
  sendEmail(payload: EmailPayload): Promise<{ id: string; success: boolean }>;
  sendInviteEmail(params: SendInviteEmailParams): Promise<void>;
  sendPasswordResetEmail(params: SendPasswordResetEmailParams): Promise<void>;
  sendVerificationEmail(params: SendVerificationEmailParams): Promise<void>;
  sendBookingDocumentEmail(params: SendBookingDocumentEmailParams): Promise<{ id: string; success: boolean }>;
}

export class ResendEmailSender implements EmailSender {
  private apiKey: string;
  private defaultFrom: string;

  constructor(apiKey: string, defaultFrom = "noreply@hayhost.com") {
    if (!apiKey) {
      throw new Error("ResendEmailSender requires a non-empty API key.");
    }
    this.apiKey = apiKey;
    this.defaultFrom = defaultFrom;
  }

  async sendEmail(payload: EmailPayload): Promise<{ id: string; success: boolean }> {
    const from = payload.from || this.defaultFrom;
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: payload.to,
        subject: payload.subject,
        html: payload.html,
        text: payload.text,
        ...(payload.attachments && payload.attachments.length > 0 ? { attachments: payload.attachments } : {}),
      }),
    });

    if (!response.ok) {
      let errorBody = "";
      try {
        const errorJson = await response.json();
        errorBody = JSON.stringify(errorJson);
      } catch {
        errorBody = await response.text().catch(() => "");
      }
      throw new Error(`Resend email delivery failed (${response.status}): ${errorBody}`);
    }

    const data = (await response.json().catch(() => ({}))) as { id?: string };
    return { id: data.id ?? "unknown", success: true };
  }

  async sendInviteEmail(params: SendInviteEmailParams): Promise<void> {
    const roleLabel = params.roleName ? ` as ${params.roleName.replace("_", " ")}` : "";
    const subject = `You've been invited to join ${params.hotelName} on hayhost`;
    const hotelNameHtml = escapeHtml(params.hotelName);
    const roleLabelHtml = escapeHtml(roleLabel);
    const inviteUrlHtml = escapeHtml(params.inviteUrl);
    const html = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; color: #1e293b;">
        <h2 style="color: #0f172a; margin-bottom: 16px;">Welcome to ${hotelNameHtml}</h2>
        <p style="font-size: 16px; line-height: 24px;">
          You have been invited${roleLabelHtml} to manage property operations on <strong>hayhost</strong>.
        </p>
        <div style="margin: 32px 0;">
          <a href="${inviteUrlHtml}" style="background-color: #0f172a; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 500; display: inline-block;">
            Accept Invitation &amp; Set Password
          </a>
        </div>
        <p style="font-size: 14px; color: #64748b; line-height: 20px;">
          If the button above does not work, copy and paste this URL into your browser:<br/>
          <a href="${inviteUrlHtml}" style="color: #2563eb;">${inviteUrlHtml}</a>
        </p>
        <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 32px 0;" />
        <p style="font-size: 12px; color: #94a3b8;">
          This invitation link will expire in 24 hours. If you did not expect this invitation, you can ignore this email.
        </p>
      </div>
    `;
    const text = `Welcome to ${params.hotelName}!\n\nYou have been invited${roleLabel} to manage property operations on hayhost.\n\nAccept your invitation and set your password here:\n${params.inviteUrl}\n\nThis invitation link expires in 24 hours.`;

    await this.sendEmail({ to: params.to, subject, html, text });
  }

  async sendPasswordResetEmail(params: SendPasswordResetEmailParams): Promise<void> {
    const subject = "Reset your password on hayhost";
    const resetUrlHtml = escapeHtml(params.resetUrl);
    const html = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; color: #1e293b;">
        <h2 style="color: #0f172a; margin-bottom: 16px;">Password Reset Request</h2>
        <p style="font-size: 16px; line-height: 24px;">
          We received a request to reset your password for your <strong>hayhost</strong> account.
        </p>
        <div style="margin: 32px 0;">
          <a href="${resetUrlHtml}" style="background-color: #0f172a; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 500; display: inline-block;">
            Reset Password
          </a>
        </div>
        <p style="font-size: 14px; color: #64748b; line-height: 20px;">
          If the button above does not work, copy and paste this URL into your browser:<br/>
          <a href="${resetUrlHtml}" style="color: #2563eb;">${resetUrlHtml}</a>
        </p>
        <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 32px 0;" />
        <p style="font-size: 12px; color: #94a3b8;">
          This link will expire in 1 hour. If you did not request a password reset, you can safely ignore this email.
        </p>
      </div>
    `;
    const text = `Password Reset Request\n\nReset your password here:\n${params.resetUrl}\n\nThis link will expire in 1 hour. If you did not request this, please ignore this email.`;

    await this.sendEmail({ to: params.to, subject, html, text });
  }

  async sendVerificationEmail(params: SendVerificationEmailParams): Promise<void> {
    const subject = "ยืนยันอีเมลของคุณ / Confirm your email on hayhost";
    const verifyUrlHtml = escapeHtml(params.verifyUrl);
    const html = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; color: #1e293b;">
        <h2 style="color: #0f172a; margin-bottom: 16px;">ยืนยันอีเมลของคุณ</h2>
        <p style="font-size: 16px; line-height: 24px;">
          กดปุ่มด้านล่างเพื่อยืนยันอีเมล แล้วเข้าสู่ระบบ <strong>hayhost</strong> ได้เลย
        </p>
        <p style="font-size: 14px; line-height: 22px; color: #475569;">
          Press the button below to confirm your email, then sign in to <strong>hayhost</strong>.
        </p>
        <div style="margin: 32px 0;">
          <a href="${verifyUrlHtml}" style="background-color: #0f172a; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 500; display: inline-block;">
            ยืนยันอีเมล / Confirm email
          </a>
        </div>
        <p style="font-size: 14px; color: #64748b; line-height: 20px;">
          ถ้ากดปุ่มไม่ได้ ให้คัดลอกลิงก์นี้ไปเปิดในเบราว์เซอร์ / If the button does not work, open this link:<br/>
          <a href="${verifyUrlHtml}" style="color: #2563eb;">${verifyUrlHtml}</a>
        </p>
        <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 32px 0;" />
        <p style="font-size: 12px; color: #94a3b8;">
          ลิงก์นี้ใช้ได้ 24 ชั่วโมง ถ้าคุณไม่ได้สมัคร ไม่ต้องทำอะไร / This link works for 24 hours. If you did not sign up, you can ignore this email.
        </p>
      </div>
    `;
    const text = `ยืนยันอีเมลของคุณ / Confirm your email on hayhost\n\n${params.verifyUrl}\n\nลิงก์นี้ใช้ได้ 24 ชั่วโมง / This link works for 24 hours.`;

    await this.sendEmail({ to: params.to, subject, html, text });
  }

  async sendBookingDocumentEmail(params: SendBookingDocumentEmailParams): Promise<{ id: string; success: boolean }> {
    if (!params.to || !params.to.trim()) {
      throw new Error("Recipient email address is required.");
    }
    if (!params.pdfBytes || params.pdfBytes.length === 0) {
      throw new Error("PDF attachment content is required.");
    }
    const typeNames: Record<string, { th: string; en: string }> = {
      invoice: { th: "ใบแจ้งชำระเงิน", en: "Invoice" },
      receipt: { th: "ใบเสร็จรับเงิน", en: "Receipt" },
      tax_invoice: { th: "ใบกำกับภาษี", en: "Tax Invoice" },
    };
    const typeLabel = typeNames[params.documentType] ?? typeNames.invoice;
    const subject = `[${params.hotelName}] ${typeLabel.th} / ${typeLabel.en} - ${params.documentNumber}`;
    const hotelNameHtml = escapeHtml(params.hotelName);
    const guestNameHtml = escapeHtml(params.guestName);
    const docNumberHtml = escapeHtml(params.documentNumber);

    const html = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; color: #1e293b;">
        <h2 style="color: #0f172a; margin-bottom: 16px;">${typeLabel.th} (${typeLabel.en})</h2>
        <p style="font-size: 16px; line-height: 24px;">เรียน คุณ ${guestNameHtml},</p>
        <p style="font-size: 14px; line-height: 22px; color: #334155;">
          เอกสารหมายเลข <strong>${docNumberHtml}</strong> จาก <strong>${hotelNameHtml}</strong> ได้รับการจัดทำเรียบร้อยแล้ว รายละเอียดเอกสารแนบมาพร้อมกับอีเมลฉบับนี้ในรูปแบบไฟล์ PDF
        </p>
        <p style="font-size: 14px; line-height: 22px; color: #64748b;">
          Please find attached your ${typeLabel.en} (No. ${docNumberHtml}) from ${hotelNameHtml} as a PDF document.
        </p>
        <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
        <p style="font-size: 12px; color: #94a3b8;">
          เอกสารนี้สร้างขึ้นโดยระบบ Hayhost Channel Manager
        </p>
      </div>
    `;
    const text = `เรียน คุณ ${params.guestName},\n\nเอกสาร ${typeLabel.th} (${typeLabel.en}) เลขที่ ${params.documentNumber} จาก ${params.hotelName} แนบมาพร้อมกับอีเมลนี้ในรูปแบบไฟล์ PDF\n\nHayhost Channel Manager`;

    const base64Content = uint8ArrayToBase64(params.pdfBytes);

    const filename = `${params.documentType}_${params.documentNumber}.pdf`;

    return await this.sendEmail({
      to: params.to,
      subject,
      html,
      text,
      attachments: [
        {
          filename,
          content: base64Content,
          contentType: "application/pdf",
        },
      ],
    });
  }
}

export class MockEmailSender implements EmailSender {
  public sentEmails: EmailPayload[] = [];

  async sendEmail(payload: EmailPayload): Promise<{ id: string; success: boolean }> {
    this.sentEmails.push(payload);
    return { id: `mock-${this.sentEmails.length}`, success: true };
  }

  async sendBookingDocumentEmail(params: SendBookingDocumentEmailParams): Promise<{ id: string; success: boolean }> {
    if (!params.to || !params.to.trim()) {
      throw new Error("Recipient email address is required.");
    }
    if (!params.pdfBytes || params.pdfBytes.length === 0) {
      throw new Error("PDF attachment content is required.");
    }
    const base64Content = uint8ArrayToBase64(params.pdfBytes);
    const filename = `${params.documentType}_${params.documentNumber}.pdf`;

    return await this.sendEmail({
      to: params.to,
      subject: `[${params.hotelName}] Document - ${params.documentNumber}`,
      html: `<p>Attached: ${filename}</p>`,
      text: `Attached: ${filename}`,
      attachments: [
        {
          filename,
          content: base64Content,
          contentType: "application/pdf",
        },
      ],
    });
  }

  async sendInviteEmail(params: SendInviteEmailParams): Promise<void> {
    await this.sendEmail({
      to: params.to,
      subject: `You've been invited to join ${params.hotelName} on hayhost`,
      html: `<p>Invitation to ${params.hotelName}: <a href="${params.inviteUrl}">Accept</a></p>`,
      text: `Invitation to ${params.hotelName}: ${params.inviteUrl}`,
    });
  }

  async sendPasswordResetEmail(params: SendPasswordResetEmailParams): Promise<void> {
    await this.sendEmail({
      to: params.to,
      subject: "Reset your password on hayhost",
      html: `<p>Reset password: <a href="${params.resetUrl}">Reset</a></p>`,
      text: `Reset password: ${params.resetUrl}`,
    });
  }

  async sendVerificationEmail(params: SendVerificationEmailParams): Promise<void> {
    await this.sendEmail({
      to: params.to,
      subject: "Confirm your email on hayhost",
      html: `<p>Confirm email: <a href="${params.verifyUrl}">Confirm</a></p>`,
      text: `Confirm email: ${params.verifyUrl}`,
    });
  }

  clear(): void {
    this.sentEmails = [];
  }

  getLastEmail(): EmailPayload | undefined {
    return this.sentEmails[this.sentEmails.length - 1];
  }

  getSentEmails(): EmailPayload[] {
    return [...this.sentEmails];
  }
}

export class UnavailableEmailSender implements EmailSender {
  constructor(private reason = "Email delivery is not configured.") {}

  async sendEmail(): Promise<{ id: string; success: boolean }> { throw new Error(this.reason); }
  async sendInviteEmail(): Promise<void> { throw new Error(this.reason); }
  async sendPasswordResetEmail(): Promise<void> { throw new Error(this.reason); }
  async sendVerificationEmail(): Promise<void> { throw new Error(this.reason); }
  async sendBookingDocumentEmail(): Promise<{ id: string; success: boolean }> { throw new Error(this.reason); }
}

export function createEmailSender(env?: { RESEND_API_KEY?: string; EMAIL_FROM?: string }, options: { required?: boolean } = {}): EmailSender {
  const apiKey = env?.RESEND_API_KEY || (typeof process !== "undefined" ? process.env?.RESEND_API_KEY : undefined);
  const defaultFrom = env?.EMAIL_FROM || (typeof process !== "undefined" ? process.env?.EMAIL_FROM : undefined);

  if (apiKey) {
    return new ResendEmailSender(apiKey, defaultFrom);
  }
  if (options.required) return new UnavailableEmailSender("RESEND_API_KEY is required to send booking and authentication emails.");
  return new MockEmailSender();
}
