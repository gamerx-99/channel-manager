# 15 — Invoicing and tax documents

Status: in progress (2026-11-08). The current branch adds a quotation before payment, payment receipt and receipt after verified payment, while keeping the existing tax invoice option. Documents use the hotel header and VAT/withholding switches already in hotel settings, allow a payment channel, keep an immutable snapshot and print/save as PDF. Numbers are separate per hotel and document type, restart by Bangkok calendar year, and include the Gregorian year. Invoices before payment, voids, partial payments/refunds and monthly export are not built.

## Scope

This is the workflow for hotel-issued documents connected to a booking. The hotel is the document issuer and is responsible for its own header and tax data; hayhost provides a print tool and does not submit e-Tax documents or decide the hotel's tax treatment.

## Document flow

1. **Quotation**: a proposed amount for an active booking before payment. It has a distinct document number and is explicitly not proof of payment or a tax invoice.
2. **Invoice**: a request for payment, linked to the booking and any preceding quotation. It records line items, adjustments, currency, issue date and due date. It is not labelled as a receipt merely because it was created.
3. **Payment receipt and receipt**: two distinct hotel-selected document types, each recording a verified payment with date, selected method and amount. Support partial payments and refunds only after the owner confirms the desired workflow.
4. **Tax invoice**: retain the existing option and require the configured issuer tax ID and buyer address. The hotel decides when to issue it and is responsible for the tax data; it is never submitted electronically by hayhost.

## Data entry and output

- Prefill the hotel name, address and other confirmed issuer details from hotel settings. Prefill guest name and booking details from the booking. The user reviews and can correct document-specific buyer details before issue; retain the issued snapshot so later profile edits do not alter it.
- Generate a print-ready A4 PDF with a clear document type, unique number, issue date, issuer/buyer details, itemized amounts and payment status where relevant. A PDF download alone is **not** an approved electronic tax invoice workflow. The Revenue Department describes separate enrolment, PDF/A-3, email and timestamp steps for its e-Tax Invoice by Email service ([official overview](https://etax.rd.go.th/etax_staticpage/app/emag/flipbook/01_Overview.pdf)); any electronic tax invoice implementation needs separate review.
- Booking prices paid by guests include VAT when the hotel VAT switch is on; withholding is calculated from the pre-VAT subtotal and each displayed line rounds to satang.
- The issuer selects cash, bank transfer or PromptPay for a payment document. This selection is saved in the document snapshot and does not rewrite the booking's payment record.
- `ASSUMPTION:` document numbers use a Gregorian year (`RC-2026-000001`) and a separate counter per hotel and type; the year is derived from the Bangkok issue date.
- Support company guests with company name, registered address, tax ID and branch details when needed. The hotel configures whether withholding applies and its rate; the payer issues the 50 bis certificate.
- Export a monthly CSV or Excel workbook of issued documents and payment/tax fields, with a date range, stable columns, totals and correction/cancellation markers. This is an accounting export, not an automatic filing to the Revenue Department.

## Controls and acceptance criteria

- Draft documents may be edited. Issued documents keep immutable numbers and snapshots; corrections use an explicit cancellation or adjustment flow approved by the accountant.
- Document generation must respect the same hotel access boundary as bookings and financials. The owner must decide which roles can draft, issue, void, export and view buyer tax details.
- The UI must distinguish quotation, invoice, receipt and tax invoice in lists, PDFs and exports. It must not offer tax invoice issuance until the required registration and document rules are configured and approved.
- A4 PDF layout is checked in Thai and English with long hotel/company names. Monthly exports are checked against issued document totals, including refunds and adjustments once those rules are approved.

## Open decisions

Every unresolved decision is listed in `.agent/OPEN_QUESTIONS.md` under “Spec 15”. No implementation is authorized by this draft.
