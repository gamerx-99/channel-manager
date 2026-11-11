import React from "react";
import { ArrowLeft } from "lucide-react";
import { Link } from "wouter";
import { useTranslation, type TranslationKey } from "@/lib/i18n";
import type { LegalKind } from "@/lib/legalContent";
import { LegalDocument } from "@/components/LegalDocument";
import "./legal-page.css";

/** /terms, /privacy and /dpa pages for sign-in providers and visitors. */
export default function LegalPage({ kind }: { kind: LegalKind }) {
  const { t } = useTranslation();

  return (
    <main className="legal-page">
      <Link href="/" className="legal-back"><ArrowLeft size={16} aria-hidden="true" /> {t("legal.backToHome")}</Link>
      <h1>{t(`legal.${kind}Title` as TranslationKey)}</h1>
      <p className="legal-updated">{t("legal.updated")}</p>
      <LegalDocument kind={kind} />
      <p className="legal-contact">{t("legal.contact")} <a href="mailto:support@hayhostth.com">support@hayhostth.com</a></p>
    </main>
  );
}
