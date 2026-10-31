import { FormEvent, useState } from "react";
import { ArrowRight, MailCheck } from "lucide-react";
import { Link } from "wouter";
import { authClient } from "@/lib/auth-client";
import { useTranslation } from "@/lib/i18n";
import { PasswordResetShell } from "./ResetPassword";

/** Step 1 of password reset: Better Auth emails a link that comes back to /reset-password. */
export default function ForgotPassword() {
  const { t } = useTranslation();
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const { error: requestError } = await authClient.requestPasswordReset({
        email: email.trim(),
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (requestError) {
        setError(t("passwordReset.requestFailed"));
        return;
      }
      // Same answer whether or not the account exists.
      setSent(true);
    } catch {
      setError(t("passwordReset.requestFailed"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <PasswordResetShell>
      {sent ? (
        <div className="login-card" role="status" data-testid="forgot-password-sent">
          <div className="eyebrow">{t("passwordReset.eyebrow")}</div>
          <h2>{t("passwordReset.sentTitle")}</h2>
          <p>{t("passwordReset.sentDesc")}</p>
          <div className="login-security"><MailCheck size={15} /><span>{t("passwordReset.sentHint")}</span></div>
          <Link href="/login" className="button button-quiet login-button">{t("passwordReset.backToLogin")}</Link>
        </div>
      ) : (
        <form className="login-card" onSubmit={handleSubmit} data-testid="forgot-password-form">
          <div className="eyebrow">{t("passwordReset.eyebrow")}</div>
          <h2>{t("passwordReset.requestTitle")}</h2>
          <p>{t("passwordReset.requestDesc")}</p>
          <label>
            {t("login.emailLabel")}
            <input type="email" value={email} onChange={event => setEmail(event.target.value)} autoComplete="email" required autoFocus />
          </label>
          {error ? <p className="form-error" role="alert">{error}</p> : null}
          <button className="button button-primary login-button" type="submit" disabled={submitting}>
            {submitting ? t("passwordReset.sending") : t("passwordReset.sendLink")} <ArrowRight size={16} />
          </button>
          <Link href="/login" className="button button-quiet login-button">{t("passwordReset.backToLogin")}</Link>
        </form>
      )}
    </PasswordResetShell>
  );
}
