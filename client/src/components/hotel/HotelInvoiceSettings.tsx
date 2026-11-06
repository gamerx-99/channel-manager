import React from "react";
import { useTranslation } from "@/lib/i18n";
import { invoiceTaxIdValid, useHotelInvoiceSettings } from "./useHotelInvoiceSettings";
import "./HotelInvoiceSettings.css";

export default function HotelInvoiceSettings({ hotelId, hotelName, hotelAddress }: { hotelId: string; hotelName: string; hotelAddress: string }) {
  const { t } = useTranslation();
  const state = useHotelInvoiceSettings(hotelId, { name: hotelName, address: hotelAddress });
  const { form, update } = state;
  const taxIdInvalid = !invoiceTaxIdValid(form.taxId);
  return <section className="panel hotel-invoice-settings" aria-labelledby="invoice-settings-heading">
    <div className="panel-heading"><div><div className="eyebrow">{t("bookingDocuments.settingsEyebrow")}</div><h2 id="invoice-settings-heading">{t("bookingDocuments.settingsTitle")}</h2></div></div>
    <p className="field-help">{t("bookingDocuments.settingsDesc")}</p>
    <form className="hotel-invoice-form" onSubmit={event => { event.preventDefault(); if (state.canSave) state.submit(); }}>
      <label className="hotel-invoice-switch"><input id="invoice-enabled" type="checkbox" checked={form.enabled} onChange={event => update({ enabled: event.target.checked })} /> {t("bookingDocuments.enabledLabel")}</label>
      <div className="form-grid">
        <label className="form-span-two">{t("bookingDocuments.issuerNameLabel")}<input id="invoice-issuer-name" required maxLength={200} value={form.issuerName} onChange={event => update({ issuerName: event.target.value })} /></label>
        <label className="form-span-two">{t("bookingDocuments.addressLabel")}<textarea id="invoice-address" required maxLength={500} rows={3} value={form.address} onChange={event => update({ address: event.target.value })} /></label>
        <label>{t("bookingDocuments.taxIdLabel")}<input id="invoice-tax-id" inputMode="numeric" autoComplete="off" maxLength={13} value={form.taxId} aria-invalid={taxIdInvalid} aria-describedby="invoice-tax-id-help" onChange={event => update({ taxId: event.target.value.replace(/\D/g, "") })} /><span id="invoice-tax-id-help" className={taxIdInvalid ? "form-error" : "field-help"}>{taxIdInvalid ? t("bookingDocuments.taxIdInvalid") : t("bookingDocuments.taxIdHelp")}</span></label>
        <label>{t("bookingDocuments.branchLabel")}<input id="invoice-branch" maxLength={100} placeholder={t("bookingDocuments.branchPlaceholder")} value={form.branch} onChange={event => update({ branch: event.target.value })} /></label>
        <label>{t("bookingDocuments.phoneLabel")}<input id="invoice-phone" type="tel" maxLength={40} value={form.phone} onChange={event => update({ phone: event.target.value })} /></label>
      </div>
      {state.save.error && <p className="form-error" role="alert">{state.save.error.message}</p>}
      {state.saved && <p role="status">{t("bookingDocuments.saved")}</p>}
      <div><button id="invoice-save" type="submit" className="button button-primary" disabled={!state.canSave || state.isLoading}>{state.save.isPending ? t("bookingDocuments.saving") : t("bookingDocuments.save")}</button></div>
    </form>
  </section>;
}
