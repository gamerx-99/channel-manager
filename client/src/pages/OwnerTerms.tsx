import React from "react";
import { LegalDocument } from "@/components/LegalDocument";
import { AuthLogo } from "@/components/AuthLogo";
import { useTranslation } from "@/lib/i18n";
import { useOwnerTerms } from "./useOwnerTerms";
import "./legal-page.css";
import "./OwnerTerms.css";

/** Shown instead of the app to a hotel owner who has not accepted the platform terms yet. */
export default function OwnerTerms() {
  const { t } = useTranslation();
  const { boxRef, onScroll, readToEnd, accept, accepting, failed, decline } = useOwnerTerms();

  return (
    <main className="owner-terms-page" data-testid="owner-terms">
      <div className="owner-terms-card">
        <AuthLogo />
        <div className="eyebrow">{t("ownerTerms.eyebrow")}</div>
        <h1>{t("ownerTerms.title")}</h1>
        <p className="owner-terms-lede">{t("ownerTerms.lede")}</p>
        <div className="owner-terms-box legal-page" ref={boxRef} onScroll={onScroll} tabIndex={0} aria-label={t("legal.termsTitle")} data-testid="owner-terms-box">
          <LegalDocument kind="terms" />
        </div>
        <p className="owner-terms-hint" role="status">{readToEnd ? t("ownerTerms.readyHint") : t("ownerTerms.scrollHint")}</p>
        {failed ? <p className="form-error" role="alert">{t("ownerTerms.failed")}</p> : null}
        <div className="owner-terms-actions">
          <button type="button" className="button button-quiet" onClick={() => void decline()}>{t("ownerTerms.decline")}</button>
          <button type="button" className="button button-primary" disabled={!readToEnd || accepting} onClick={accept} data-testid="owner-terms-accept">
            {accepting ? t("ownerTerms.accepting") : t("ownerTerms.accept")}
          </button>
        </div>
      </div>
    </main>
  );
}
