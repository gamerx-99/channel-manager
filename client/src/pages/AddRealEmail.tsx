import React from "react";
import { AuthLogo } from "@/components/AuthLogo";
import { useTranslation } from "@/lib/i18n";
import { useAddRealEmail } from "./useAddRealEmail";
import "./AddRealEmail.css";

/** Shown instead of the app to a LINE / Facebook account that has no real email yet. */
export default function AddRealEmail() {
  const { t } = useTranslation();
  const { email, setEmail, sentTo, error, sending, confirming, submit, resend, changeEmail, signOut } = useAddRealEmail();

  return (
    <main className="add-email-page" data-testid="add-real-email">
      <div className="add-email-card">
        <AuthLogo />
        <div className="eyebrow">{t("addRealEmail.eyebrow")}</div>
        {confirming ? (
          <p className="add-email-lede" role="status">{t("addRealEmail.confirming")}</p>
        ) : sentTo ? (
          <>
            <h1>{t("addRealEmail.sentTitle")}</h1>
            <p className="add-email-lede" role="status">{t("addRealEmail.sent", { email: sentTo })}</p>
            <p className="add-email-hint">{t("addRealEmail.hint")}</p>
            {error ? <p className="form-error" role="alert">{t(`addRealEmail.${error}`)}</p> : null}
            <div className="add-email-actions">
              <button type="button" className="button button-quiet" onClick={changeEmail}>{t("addRealEmail.changeEmail")}</button>
              <button type="button" className="button button-primary" onClick={resend} disabled={sending}>
                {sending ? t("addRealEmail.sending") : t("addRealEmail.resend")}
              </button>
            </div>
          </>
        ) : (
          <form className="add-email-form" onSubmit={submit}>
            <h1>{t("addRealEmail.title")}</h1>
            <p className="add-email-lede">{t("addRealEmail.lede")}</p>
            <label>
              {t("addRealEmail.emailLabel")}
              <input type="email" value={email} onChange={event => setEmail(event.target.value)} autoComplete="email" maxLength={254} required />
            </label>
            {error ? <p className="form-error" role="alert">{t(`addRealEmail.${error}`)}</p> : null}
            <button type="submit" className="button button-primary" disabled={sending}>
              {sending ? t("addRealEmail.sending") : t("addRealEmail.send")}
            </button>
          </form>
        )}
        <button type="button" className="button button-quiet add-email-sign-out" onClick={() => void signOut()}>{t("addRealEmail.signOut")}</button>
      </div>
    </main>
  );
}
