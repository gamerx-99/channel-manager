import React from "react";
import { ArrowLeft } from "lucide-react";
import { Link } from "wouter";
import { useTranslation, type TranslationKey } from "@/lib/i18n";
import { legalContent, type LegalKind } from "@/lib/legalContent";

/** Draft /terms, /privacy and /dpa, so sign-in providers and visitors have a page to open. Not reviewed by a lawyer. */
export default function LegalPage({ kind }: { kind: LegalKind }) {
  const { t, language } = useTranslation();
  const document = legalContent[language === "th" ? "th" : "en"][kind];

  return (
    <main className="legal-page">
      <Link href="/" className="legal-back"><ArrowLeft size={16} aria-hidden="true" /> {t("legal.backToHome")}</Link>
      <h1>{t(`legal.${kind}Title` as TranslationKey)}</h1>
      <p className="legal-updated">{t("legal.updated")}</p>
      <p className="legal-draft" role="note" data-testid="legal-draft-notice">{t("legal.draftNotice")}</p>
      <p>{document.intro}</p>
      {document.sections.map(section => (
        <section key={section.heading}>
          <h2>{section.heading}</h2>
          {section.items?.map(item => <p key={item}>{item}</p>)}
          {section.table && (
            <div className="legal-table">
              <table>
                <thead><tr>{section.table.head.map(cell => <th key={cell} scope="col">{cell}</th>)}</tr></thead>
                <tbody>
                  {section.table.rows.map(row => <tr key={row[0]}>{row.map(cell => <td key={cell}>{cell}</td>)}</tr>)}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ))}
      <p className="legal-contact">{t("legal.contact")} <a href="mailto:support@hayhostth.com">support@hayhostth.com</a></p>
    </main>
  );
}
