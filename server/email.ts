export interface EmailPayload {
  to: string;
  subject: string;
  html: string;
  text?: string;
  from?: string;
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

export interface EmailSender {
  sendEmail(payload: EmailPayload): Promise<{ id: string; success: boolean }>;
  sendInviteEmail(params: SendInviteEmailParams): Promise<void>;
  sendPasswordResetEmail(params: SendPasswordResetEmailParams): Promise<void>;
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
    const html = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; color: #1e293b;">
        <h2 style="color: #0f172a; margin-bottom: 16px;">Welcome to ${params.hotelName}</h2>
        <p style="font-size: 16px; line-height: 24px;">
          You have been invited${roleLabel} to manage property operations on <strong>hayhost</strong>.
        </p>
        <div style="margin: 32px 0;">
          <a href="${params.inviteUrl}" style="background-color: #0f172a; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 500; display: inline-block;">
            Accept Invitation &amp; Set Password
          </a>
        </div>
        <p style="font-size: 14px; color: #64748b; line-height: 20px;">
          If the button above does not work, copy and paste this URL into your browser:<br/>
          <a href="${params.inviteUrl}" style="color: #2563eb;">${params.inviteUrl}</a>
        </p>
        <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 32px 0;" />
        <p style="font-size: 12px; color: #94a3b8;">
          This invitation link will expire in 7 days. If you did not expect this invitation, you can ignore this email.
        </p>
      </div>
    `;
    const text = `Welcome to ${params.hotelName}!\n\nYou have been invited${roleLabel} to manage property operations on hayhost.\n\nAccept your invitation and set your password here:\n${params.inviteUrl}\n\nThis invitation link expires in 7 days.`;

    await this.sendEmail({ to: params.to, subject, html, text });
  }

  async sendPasswordResetEmail(params: SendPasswordResetEmailParams): Promise<void> {
    const subject = "Reset your password on hayhost";
    const html = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; color: #1e293b;">
        <h2 style="color: #0f172a; margin-bottom: 16px;">Password Reset Request</h2>
        <p style="font-size: 16px; line-height: 24px;">
          We received a request to reset your password for your <strong>hayhost</strong> account.
        </p>
        <div style="margin: 32px 0;">
          <a href="${params.resetUrl}" style="background-color: #0f172a; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 500; display: inline-block;">
            Reset Password
          </a>
        </div>
        <p style="font-size: 14px; color: #64748b; line-height: 20px;">
          If the button above does not work, copy and paste this URL into your browser:<br/>
          <a href="${params.resetUrl}" style="color: #2563eb;">${params.resetUrl}</a>
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
}

export class MockEmailSender implements EmailSender {
  public sentEmails: EmailPayload[] = [];

  async sendEmail(payload: EmailPayload): Promise<{ id: string; success: boolean }> {
    this.sentEmails.push(payload);
    return { id: `mock-${this.sentEmails.length}`, success: true };
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

export function createEmailSender(env?: { RESEND_API_KEY?: string; EMAIL_FROM?: string }): EmailSender {
  const apiKey = env?.RESEND_API_KEY || (typeof process !== "undefined" ? process.env?.RESEND_API_KEY : undefined);
  const defaultFrom = env?.EMAIL_FROM || (typeof process !== "undefined" ? process.env?.EMAIL_FROM : undefined);

  if (apiKey) {
    return new ResendEmailSender(apiKey, defaultFrom);
  }
  return new MockEmailSender();
}
