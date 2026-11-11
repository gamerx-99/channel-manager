import React from "react";
import { useTranslation } from "@/lib/i18n";
import { legalContent, type LegalDocument as LegalDocumentContent, type LegalKind } from "@/lib/legalContent";

/** The body of a legal document (intro, sections, tables), shared by the public legal pages and the owner terms screen. */
export function LegalDocument({ kind }: { kind: LegalKind }) {
  const { language } = useTranslation();
  return <LegalDocumentBody document={legalContent[language === "th" ? "th" : "en"][kind]} />;
}

/** Renders any legal document, such as a hotel's own privacy notice. */
export function LegalDocumentBody({ document }: { document: LegalDocumentContent }) {
  return (
    <>
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
    </>
  );
}
