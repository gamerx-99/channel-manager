# 15 — Invoicing and tax documents

Status: draft, not approved (2026-11-05). Owner and accountant review required before implementation.

## Scope

This is a proposed workflow for hotel-issued documents connected to a booking. It specifies no tax rate, filing deadline, legal eligibility or automatic tax decision. The hotel is the document issuer; hayhost provides the tool. Confirm that issuer model with the owner and accountant.

## Document flow

1. **Quotation**: a proposed amount before payment. It has a distinct document number and state; it is not presented as proof of payment or a tax invoice.
2. **Invoice**: a request for payment, linked to the booking and any preceding quotation. It records line items, adjustments, currency, issue date and due date. It is not labelled as a receipt merely because it was created.
3. **Receipt**: records money actually received, including date, method, amount and reference. Support partial payments and refunds only after the owner confirms the desired workflow.
4. **Tax invoice**: a separate document type available only when the issuer's eligibility and required fields have been confirmed. Do not automatically convert an invoice or receipt into one. The Revenue Department lists issuer identity and tax ID, buyer identity, serial number, description/value, VAT amount and issue date among the required particulars for a tax invoice ([Revenue Department VAT guidance](https://www.rd.go.th/english/6043.html), [Revenue Code section 86/4](https://www.rd.go.th/english/37741.html)). The accountant must approve the actual field set and timing.

## Data entry and output

- Prefill the hotel name, address and other confirmed issuer details from hotel settings. Prefill guest name and booking details from the booking. The user reviews and can correct document-specific buyer details before issue; retain the issued snapshot so later profile edits do not alter it.
- Generate a print-ready A4 PDF with a clear document type, unique number, issue date, issuer/buyer details, itemized amounts and payment status where relevant. A PDF download alone is **not** an approved electronic tax invoice workflow. The Revenue Department describes separate enrolment, PDF/A-3, email and timestamp steps for its e-Tax Invoice by Email service ([official overview](https://etax.rd.go.th/etax_staticpage/app/emag/flipbook/01_Overview.pdf)); any electronic tax invoice implementation needs separate review.
- Support a hotel setting for VAT-inclusive or VAT-exclusive displayed prices, with an effective date and a calculation preview. Keep rate, rounding, tax point and eligibility configurable only after accountant approval. Do not infer VAT registration from the hotel having a tax ID.
- Support company guests with company name, registered address, tax ID and branch details when needed. Track withholding tax as a separate recorded amount and supporting certificate/reference; do not assume a fixed rate or that every company booking requires it.
- Export a monthly CSV or Excel workbook of issued documents and payment/tax fields, with a date range, stable columns, totals and correction/cancellation markers. This is an accounting export, not an automatic filing to the Revenue Department.

## Controls and acceptance criteria

- Draft documents may be edited. Issued documents keep immutable numbers and snapshots; corrections use an explicit cancellation or adjustment flow approved by the accountant.
- Document generation must respect the same hotel access boundary as bookings and financials. The owner must decide which roles can draft, issue, void, export and view buyer tax details.
- The UI must distinguish quotation, invoice, receipt and tax invoice in lists, PDFs and exports. It must not offer tax invoice issuance until the required registration and document rules are configured and approved.
- A4 PDF layout is checked in Thai and English with long hotel/company names. Monthly exports are checked against issued document totals, including refunds and adjustments once those rules are approved.

## Open decisions

Every unresolved decision is listed in `.agent/OPEN_QUESTIONS.md` under “Spec 15”. No implementation is authorized by this draft.
