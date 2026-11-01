import React, { useState } from "react";
import { MailCheck } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { useTranslation } from "@/lib/i18n";

type CheckEmailProps = {
  email: string;
  /** Where the link in the email lands; the sign-in page when omitted. */
  callbackURL?: string;
  onBack?: () => void;
};

export function CheckEmail({ email, callbackURL = "/login?verified=1", onBack }: CheckEmailProps) {
  const { t } = useTranslation();
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "failed">("idle");

  async function resend() {
    setStatus("sending");
    const { error } = await authClient.sendVerificationEmail({ email, callbackURL });
    setStatus(error ? "failed" : "sent");
  }

  return (
    <div className="login-card" data-testid="check-email">
      <div className="eyebrow">{t("verifyEmail.eyebrow")}</div>
      <h2>{t("verifyEmail.title")}</h2>
      <p>{t("verifyEmail.desc", { email })}</p>
      <p>{t("verifyEmail.hint")}</p>
      {status === "sent" ? <p role="status"><MailCheck size={15} /> {t("verifyEmail.sent")}</p> : null}
      {status === "failed" ? <p className="form-error" role="alert">{t("verifyEmail.sendFailed")}</p> : null}
      <button className="button button-primary login-button" type="button" disabled={status === "sending"} onClick={() => void resend()}>
        {status === "sending" ? t("verifyEmail.sending") : t("verifyEmail.resend")}
      </button>
      {onBack ? <button className="button button-quiet" type="button" style={{ marginTop: 8, width: "100%" }} onClick={onBack}>{t("verifyEmail.back")}</button> : null}
    </div>
  );
}
