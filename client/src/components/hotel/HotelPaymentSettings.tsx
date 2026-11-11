import React from "react";
import { QrCode } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import SlipOkSettings from "@/components/SlipOkSettings";
import { useTranslation } from "@/lib/i18n";
import { useHotelPromptPaySettings } from "./useHotelPaymentSettings";
import "./HotelPaymentSettings.css";

export default function HotelPaymentSettings({ hotelId }: { hotelId: string }) {
  const { t } = useTranslation();
  const state = useHotelPromptPaySettings(hotelId);
  return <section className="panel hotel-payment-settings" data-tour="finance-settings" aria-label={t("hotelPaymentSettings.title")}>
    <div className="panel-heading"><div><div className="eyebrow">{t("hotelPaymentSettings.eyebrow")}</div><h2>{t("hotelPaymentSettings.title")}</h2></div></div>
    <section className="hotel-promptpay-settings" aria-labelledby="promptpay-settings-heading">
      <Card className="hotel-payment-card">
        <CardHeader className="hotel-payment-card-header"><div className="hotel-payment-card-title"><span className="hotel-payment-icon"><QrCode size={18} aria-hidden="true" /></span><div><CardTitle id="promptpay-settings-heading">{t("financials.promptPayTitle")}</CardTitle><CardDescription>{t("financials.promptPayDesc")}</CardDescription></div></div></CardHeader>
        <CardContent className="hotel-payment-card-content">
          {state.savedIdInvalid && <p className="form-error" role="alert">{t("financials.promptPaySavedInvalid")}</p>}
          <div className="form-grid"><div className="form-span-two"><label htmlFor="promptpay-id-input">{t("financials.promptPayIdLabel")}</label><input id="promptpay-id-input" type="text" inputMode="tel" autoComplete="off" value={state.promptPayId} onChange={e => state.setPromptPayId(e.target.value)} placeholder="0812345678" maxLength={32} aria-describedby="promptpay-id-hint" className="w-full rounded-lg border border-[#dce4df] px-3 py-2 text-sm font-mono" /><p id="promptpay-id-hint" className="field-help">{t("financials.promptPayIdHint")}</p></div>
            <label>{t("financials.timeoutLabel")}<select id="promptpay-timeout" value={state.timeoutMin} onChange={e => state.setTimeoutMin(Number(e.target.value))} className="w-full rounded-lg border border-[#dce4df] px-3 py-2 text-sm">{[5, 10, 15, 20, 30, 60].map(m => <option key={m} value={m}>{t("financials.minutes", { count: m })}</option>)}</select></label></div>
          {state.mfaState.status === "needs_challenge" && <div className="flex flex-col gap-2 rounded-lg border border-[#dce4df] bg-[#f6faf7] p-4"><label htmlFor="promptpay-totp-input">{t("financials.mfaPrompt")}</label><div className="flex flex-wrap gap-2"><label>{t("financials.mfaCodeLabel")}<input id="promptpay-totp-input" type="text" inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder="000000" value={state.totpCode} onChange={e => state.setTotpCode(e.target.value.replace(/\D/g, ""))} /></label><button id="promptpay-totp-submit" type="button" disabled={state.totpCode.length !== 6} onClick={() => void state.handleVerify()} className="button button-primary">{t("financials.mfaVerify")}</button><button type="button" onClick={state.handleCancel} className="button button-quiet">{t("financials.mfaCancel")}</button></div>{state.mfaState.error && <p className="form-error" role="alert">{state.mfaState.error}</p>}</div>}
          {state.mfaState.status === "pending" && <p role="status">{t("financials.mfaChecking")}</p>}{state.mfaState.status === "error" && <p className="form-error" role="alert">{state.mfaState.message}</p>}{state.saveError && <p className="form-error" role="alert">{state.saveError}</p>}{state.saved && <p role="status">{t("financials.savedSuccess")}</p>}
          <button id="promptpay-save-btn" type="button" disabled={state.savePromptPay.isPending || state.mfaState.status === "pending"} onClick={() => void state.handleSave()} className="button button-primary">{state.savePromptPay.isPending ? t("financials.saving") : t("financials.savePromptPayId")}</button><p className="field-help">{t("financials.promptPayDisclaimer")}</p>
        </CardContent>
      </Card>
    </section>
    <SlipOkSettings hotelId={hotelId} />
  </section>;
}
