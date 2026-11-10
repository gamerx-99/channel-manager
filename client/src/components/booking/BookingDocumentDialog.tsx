import React from "react";
import { Download, Printer, X } from "lucide-react";
import { BOOKING_DOCUMENT_TYPES } from "@shared/bookingDocuments";
import { formatSatang } from "@/lib/bookingDocumentPrint";
import { useTranslation } from "@/lib/i18n";
import { useBookingDocuments } from "./useBookingDocuments";
import "./BookingDocumentDialog.css";

const TYPE_LABEL = {
  invoice: "bookingDocuments.typeInvoice",
  receipt: "bookingDocuments.typeReceipt",
  tax_invoice: "bookingDocuments.typeTaxInvoice",
} as const;

const PROBLEM_LABEL = {
  name: null,
  taxId: "bookingDocuments.taxIdInvalid",
  hotelTaxId: "bookingDocuments.taxInvoiceNeedsTaxId",
  address: "bookingDocuments.buyerAddressRequired",
} as const;

export default function BookingDocumentDialog({
  hotelId,
  booking,
  onClose,
}: {
  hotelId: string;
  booking: {
    id: string;
    guest_name: string;
    status?: string;
    payment_status?: string | null;
    paymentStatus?: string | null;
  };
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const state = useBookingDocuments(hotelId, booking);
  const { buyer } = state;
  const problemLabel = state.problem ? PROBLEM_LABEL[state.problem] : null;

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div
        className="modal-card booking-document-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="booking-document-title"
        onMouseDown={event => event.stopPropagation()}
      >
        <div className="modal-head">
          <div>
            <div className="eyebrow">{t("bookingDocuments.dialogEyebrow")}</div>
            <h2 id="booking-document-title">{t("bookingDocuments.dialogTitle")}</h2>
          </div>
          <button className="icon-button" type="button" aria-label={t("bookingDocuments.close")} onClick={onClose}>
            <X size={17} />
          </button>
        </div>

        {state.existingReceipt && (
          <div
            className="receipt-notice"
            style={{
              background: "#f0fdf4",
              border: "1px solid #bbf7d0",
              color: "#166534",
              padding: "10px 14px",
              borderRadius: "6px",
              margin: "12px 16px 0",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              fontSize: "13px",
            }}
          >
            <span>
              ✓ {t("bookingDocuments.receiptAlreadyIssued")} (<strong>{state.existingReceipt.snapshot.number}</strong>)
            </span>
            <button
              type="button"
              className="button button-quiet"
              style={{ fontSize: "12px", padding: "4px 8px" }}
              onClick={() => state.print(state.existingReceipt!.snapshot)}
            >
              <Printer size={14} /> {t("bookingDocuments.printAgain")}
            </button>
          </div>
        )}

        {state.settings.isLoading ? null : !state.enabled ? (
          <p className="form-error" role="alert" style={{ margin: "16px" }}>
            {t("bookingDocuments.notEnabled")}
          </p>
        ) : (
          <form
            className="booking-document-form"
            onSubmit={event => {
              event.preventDefault();
              state.submit();
            }}
          >
            <fieldset>
              <legend>{t("bookingDocuments.typeLabel")}</legend>
              {BOOKING_DOCUMENT_TYPES.map(type => {
                const disabled = (type === "receipt" || type === "tax_invoice") && !state.isPaid;
                return (
                  <label
                    key={type}
                    className={`booking-document-type ${disabled ? "is-disabled" : ""}`}
                    title={disabled ? t("bookingDocuments.receiptRequiresVerified") : undefined}
                    style={disabled ? { opacity: 0.5, cursor: "not-allowed" } : undefined}
                  >
                    <input
                      type="radio"
                      name="document-type"
                      value={type}
                      disabled={disabled}
                      checked={state.type === type}
                      onChange={() => state.setType(type)}
                    />{" "}
                    {t(TYPE_LABEL[type])}
                  </label>
                );
              })}
            </fieldset>

            {!state.isPaid && (
              <p className="field-help" style={{ color: "#b45309", marginTop: "-4px", marginBottom: "8px" }}>
                ℹ️ {t("bookingDocuments.receiptRequiresVerified")}
              </p>
            )}

            <div className="form-grid">
              <label className="form-span-two">
                {t("bookingDocuments.buyerNameLabel")}
                <input
                  id="document-buyer-name"
                  required
                  maxLength={200}
                  value={buyer.name}
                  onChange={event => state.setBuyer({ name: event.target.value })}
                />
              </label>
              <label className="form-span-two">
                {t("bookingDocuments.buyerAddressLabel")}
                <textarea
                  id="document-buyer-address"
                  rows={2}
                  maxLength={500}
                  required={state.type === "tax_invoice"}
                  value={buyer.address}
                  onChange={event => state.setBuyer({ address: event.target.value })}
                />
              </label>
              <label>
                {t("bookingDocuments.buyerTaxIdLabel")}
                <input
                  id="document-buyer-tax-id"
                  inputMode="numeric"
                  maxLength={13}
                  value={buyer.taxId}
                  onChange={event => state.setBuyer({ taxId: event.target.value.replace(/\D/g, "") })}
                />
              </label>
              <label>
                {t("bookingDocuments.buyerBranchLabel")}
                <input
                  id="document-buyer-branch"
                  maxLength={100}
                  value={buyer.branch}
                  onChange={event => state.setBuyer({ branch: event.target.value })}
                />
              </label>
            </div>
            {problemLabel && <p className="form-error" role="alert">{t(problemLabel)}</p>}
            {state.issue.error && <p className="form-error" role="alert">{state.issue.error.message}</p>}
            {state.popupBlocked && <p className="form-error" role="alert">{t("bookingDocuments.popupBlocked")}</p>}
            <p className="field-help">
              {t("bookingDocuments.issueNote")} {t("bookingDocuments.printHelp")}
            </p>
            <div className="modal-actions">
              <button type="button" className="button button-quiet" onClick={onClose}>
                {t("bookingDocuments.close")}
              </button>
              <button
                id="document-issue"
                type="submit"
                className="button button-primary"
                disabled={Boolean(state.problem) || state.issue.isPending}
              >
                <Printer size={15} />{" "}
                {state.issue.isPending ? t("bookingDocuments.issuing") : t("bookingDocuments.issueButton")}
              </button>
            </div>
          </form>
        )}
        <section className="booking-document-list" aria-labelledby="booking-document-list-title">
          <h3 id="booking-document-list-title">{t("bookingDocuments.issuedTitle")}</h3>
          {state.documents.data?.length ? (
            <ul>
              {state.documents.data.map(row => (
                <li key={row.id}>
                  <span>
                    <strong>{row.snapshot.number}</strong> {t(TYPE_LABEL[row.snapshot.type])} · {formatSatang(row.snapshot.totalSatang)}
                  </span>
                  <div style={{ display: "flex", gap: "6px" }}>
                    <button type="button" className="button button-quiet" onClick={() => state.print(row.snapshot)}>
                      <Printer size={15} /> {t("bookingDocuments.printAgain")}
                    </button>
                    <button
                      type="button"
                      className="button button-quiet"
                      title={t("bookingDocuments.downloadPdf")}
                      aria-label={t("bookingDocuments.downloadPdf")}
                      onClick={() => state.download(row.snapshot, row.id)}
                    >
                      <Download size={15} />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="field-help">{t("bookingDocuments.noneIssued")}</p>
          )}
        </section>
      </div>
    </div>
  );
}
