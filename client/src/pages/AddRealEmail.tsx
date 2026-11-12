import React from "react";
import { AuthLogo } from "@/components/AuthLogo";
import { useTranslation } from "@/lib/i18n";
import { useAddRealEmail } from "./useAddRealEmail";
import { signInMethod } from "./accountProfile";
import "./AddRealEmail.css";

/** Shown instead of the app to a LINE / Facebook account that has no real email yet. */
export default function AddRealEmail() {
  const { t } = useTranslation();
  const { email, setEmail, sentTo, error, sending, confirming, checkingFacebook, existing, leaving, acceptExisting, declineExisting, submit, resend, changeEmail, signOut } = useAddRealEmail();
  const methodNames = existing?.signInMethods.map(providerId => { const method = signInMethod(providerId); return "key" in method ? t(method.key) : method.label; }).join(", ");

  return (
    <main className="add-email-page" data-testid="add-real-email">
      <div className="add-email-card">
        <AuthLogo />
        <div className="eyebrow">{t("addRealEmail.eyebrow")}</div>
        {confirming || checkingFacebook ? (
          <p className="add-email-lede" role="status">{t("addRealEmail.confirming")}</p>
        ) : existing ? (
          <div className="add-email-form" data-testid="add-email-existing">
            <h1>{t("addRealEmail.existingTitle")}</h1>
            <p className="add-email-lede">{t("addRealEmail.existingLede", { email: existing.email, name: existing.accountName })}</p>
            {methodNames ? <p className="add-email-hint">{t("addRealEmail.existingMethods", { methods: methodNames })}</p> : null}
            <div className="add-email-actions">
              <button type="button" className="button button-quiet" onClick={declineExisting} disabled={leaving}>{t("addRealEmail.existingNo")}</button>
              <button type="button" className="button button-primary" onClick={acceptExisting} disabled={leaving}>{t("addRealEmail.existingYes")}</button>
            </div>
          </div>
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
        {existing ? null : <button type="button" className="button button-quiet add-email-sign-out" onClick={() => void signOut()}>{t("addRealEmail.signOut")}</button>}
      </div>
    </main>
  );
}
