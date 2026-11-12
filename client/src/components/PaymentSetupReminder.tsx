import React, { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useTranslation } from "@/lib/i18n";
import { financeSettingsPath, missingPaymentSetup, shouldShowPaymentReminder, SLIPOK_APP_URL, SLIPOK_GUIDE_URL } from "@/lib/paymentSetup";
import { trpc } from "@/lib/trpc";

/**
 * Pops up on every page change while the hotel has no PromptPay number or SlipOK key saved
 * (owner decision, 2026-11-11: it should be annoying enough to get the setup done).
 * `enabled` is true only for the hotel owner and false while the guided tour is showing.
 */
export function PaymentSetupReminder({ hotelId, enabled }: { hotelId: string | null; enabled: boolean }) {
  const { t } = useTranslation();
  const [location] = useLocation();
  const [dismissedAt, setDismissedAt] = useState<string | null>(null);
  const status = trpc.slipok.paymentSetupStatus.useQuery({ hotel_id: hotelId ?? "" }, { enabled: enabled && Boolean(hotelId), retry: false });
  const refetchStatus = status.refetch;

  // The shell stays mounted between pages, so ask again on each page: a save on the finance page ends the reminder.
  useEffect(() => {
    if (enabled && hotelId) void refetchStatus();
  }, [location, enabled, hotelId, refetchStatus]);

  const missing = missingPaymentSetup(status.data);
  const problem = status.data?.slipok_problem ?? null;
  if (!shouldShowPaymentReminder({ enabled, hotelId, missing, problem, location, dismissedAt }) || !hotelId) return null;
  // Only a SlipOK account problem: the fix is in SlipOK (opened from LINE), not in hayhost's settings.
  const problemOnly = missing.length === 0 && problem !== null;

  return (
    <Dialog open onOpenChange={open => { if (!open) setDismissedAt(location); }}>
      <DialogContent className="modal-card payment-setup-reminder" data-testid="payment-setup-reminder" showCloseButton={false}>
        <DialogHeader className="modal-head">
          <div>
            <DialogTitle>{t(problemOnly ? "paymentSetup.slipOkProblemTitle" : "paymentSetup.title")}</DialogTitle>
            <DialogDescription className="modal-lede">{t(problemOnly ? "paymentSetup.slipOkProblemLede" : "paymentSetup.lede")}</DialogDescription>
          </div>
        </DialogHeader>
        <ul className="payment-setup-missing">
          {missing.includes("promptpay") ? <li>{t("paymentSetup.missingPromptPay")}</li> : null}
          {missing.includes("slipok") ? <li>{t("paymentSetup.missingSlipOk")}</li> : null}
          {problem === "package_expired" ? <li data-testid="slipok-problem">{t("paymentSetup.slipOkPackageExpired")}</li> : null}
          {problem === "quota_exceeded" ? <li data-testid="slipok-problem">{t("paymentSetup.slipOkQuotaExceeded")}</li> : null}
          {problem === "credentials_rejected" ? <li data-testid="slipok-problem">{t("paymentSetup.slipOkCredentialsRejected")}</li> : null}
        </ul>
        {SLIPOK_GUIDE_URL && missing.includes("slipok") ? (
          <p><a href={SLIPOK_GUIDE_URL} target="_blank" rel="noopener noreferrer" className="text-link">{t("paymentSetup.guide")}</a></p>
        ) : null}
        <DialogFooter className="modal-actions form-submit">
          <button type="button" className="button button-quiet" onClick={() => setDismissedAt(location)}>{t("paymentSetup.close")}</button>
          {problem && problem !== "credentials_rejected" ? (
            <a href={SLIPOK_APP_URL} target="_blank" rel="noopener noreferrer" className={`button ${problemOnly ? "button-primary" : "button-quiet"}`}>{t("paymentSetup.openSlipOk")}</a>
          ) : null}
          {!problemOnly || problem === "credentials_rejected" ? (
            <Link href={financeSettingsPath(hotelId)} className="button button-primary">{t("paymentSetup.goSettings")}</Link>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
