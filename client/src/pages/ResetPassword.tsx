import { FormEvent, ReactNode, useState } from "react";
import { ArrowRight, LockKeyhole } from "lucide-react";
import { Link } from "wouter";
import { authClient } from "@/lib/auth-client";
import { useTranslation } from "@/lib/i18n";

/** Better Auth's minimum password length. */
const MIN_PASSWORD_LENGTH = 8;

export function PasswordResetShell({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  return (
    <div className="login-page">
      <div className="login-aside">
        <div className="login-brand">
          <span className="brand-mark"><span /></span>
          <strong>hay<em>host</em></strong>
        </div>
        <div className="login-aside-copy">
          <div className="eyebrow">{t("login.eyebrowAside")}</div>
          <h1>{t("login.headlineAside1")}<br /><i>{t("login.headlineAside2")}</i></h1>
        </div>
      </div>
      <main className="login-main">
        {children}
        <div className="login-footer"><span><LockKeyhole size={13} /> {t("login.privateWorkspace")}</span></div>
      </main>
    </div>
  );
}

/** Step 2 of password reset: Better Auth sends the guest here with ?token=… or ?error=INVALID_TOKEN. */
export default function ResetPassword() {
  const { t } = useTranslation();
  const params = new URLSearchParams(typeof window === "undefined" ? "" : window.location.search);
  const token = params.get("token");
  const linkInvalid = !token || params.get("error") === "INVALID_TOKEN";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (password.length < MIN_PASSWORD_LENGTH) { setError(t("passwordReset.tooShort")); return; }
    if (password !== confirm) { setError(t("passwordReset.mismatch")); return; }
    setSubmitting(true);
    setError(null);
    try {
      const { error: resetError } = await authClient.resetPassword({ newPassword: password, token: token! });
      if (resetError) {
        setError(resetError.code === "INVALID_TOKEN" ? t("passwordReset.linkInvalidDesc") : t("passwordReset.resetFailed"));
        return;
      }
      setDone(true);
    } catch {
      setError(t("passwordReset.resetFailed"));
    } finally {
      setSubmitting(false);
    }
  }

  if (linkInvalid) {
    return (
      <PasswordResetShell>
        <div className="login-card" role="alert" data-testid="reset-password-invalid">
          <div className="eyebrow">{t("passwordReset.eyebrow")}</div>
          <h2>{t("passwordReset.linkInvalidTitle")}</h2>
          <p>{t("passwordReset.linkInvalidDesc")}</p>
          <Link href="/forgot-password" className="button button-primary login-button">{t("passwordReset.requestAgain")}</Link>
        </div>
      </PasswordResetShell>
    );
  }

  if (done) {
    return (
      <PasswordResetShell>
        <div className="login-card" role="status" data-testid="reset-password-done">
          <div className="eyebrow">{t("passwordReset.eyebrow")}</div>
          <h2>{t("passwordReset.doneTitle")}</h2>
          <p>{t("passwordReset.doneDesc")}</p>
          <Link href="/login" className="button button-primary login-button">{t("passwordReset.backToLogin")}</Link>
        </div>
      </PasswordResetShell>
    );
  }

  return (
    <PasswordResetShell>
      <form className="login-card" onSubmit={handleSubmit} data-testid="reset-password-form">
        <div className="eyebrow">{t("passwordReset.eyebrow")}</div>
        <h2>{t("passwordReset.resetTitle")}</h2>
        <p>{t("passwordReset.resetDesc")}</p>
        <label>
          {t("passwordReset.newPassword")}
          <input type="password" value={password} onChange={event => setPassword(event.target.value)} autoComplete="new-password" minLength={MIN_PASSWORD_LENGTH} required autoFocus />
        </label>
        <label>
          {t("passwordReset.confirmPassword")}
          <input type="password" value={confirm} onChange={event => setConfirm(event.target.value)} autoComplete="new-password" minLength={MIN_PASSWORD_LENGTH} required />
        </label>
        {error ? <p className="form-error" role="alert">{error}</p> : null}
        <button className="button button-primary login-button" type="submit" disabled={submitting}>
          {submitting ? t("passwordReset.saving") : t("passwordReset.save")} <ArrowRight size={16} />
        </button>
      </form>
    </PasswordResetShell>
  );
}
