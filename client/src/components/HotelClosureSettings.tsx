import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { TriangleAlert } from "lucide-react";
import { useLocation } from "wouter";
import HotelDataExportButton from "@/components/HotelDataExportButton";
import { useTranslation } from "@/lib/i18n";
import { trpc } from "@/lib/trpc";
import { CLOSURE_EXPORT_DAYS, CLOSURE_WAIT_DAYS } from "@shared/hotelClosure";

const errorCode = (error: unknown) => (error as { data?: { code?: string } | null })?.data?.code;

export default function HotelClosureSettings({ hotelId, hotelName }: { hotelId: string; hotelName: string }) {
  const { t } = useTranslation();
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const { data: authMe } = trpc.auth.me.useQuery();
  const verifyMfa = trpc.auth.verifyMfaStepUp.useMutation();
  const closeHotel = trpc.hotelClosure.request.useMutation();

  const [confirming, setConfirming] = useState(false);
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [codeAccepted, setCodeAccepted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submitting = useRef(false);

  const needsCode = Boolean(authMe?.twoFactorEnabled) && !codeAccepted;
  const busy = verifyMfa.isPending || closeHotel.isPending;
  const canSubmit = !busy && name.trim() === hotelName.trim() && password.length > 0 && (!needsCode || code.length === 6);

  async function handleClose() {
    setError(null);
    if (needsCode) {
      try {
        await verifyMfa.mutateAsync({ code });
        setCodeAccepted(true);
      } catch {
        setError(t("hotelClosure.errorCode"));
        return;
      }
    }
    try {
      await closeHotel.mutateAsync({ hotel_id: hotelId, password });
    } catch (caught) {
      setPassword("");
      setError(t(errorCode(caught) === "BAD_REQUEST" ? "accountDeletion.errorPassword" : errorCode(caught) === "TOO_MANY_REQUESTS" ? "accountDeletion.errorTooManyPasswords" : "hotelClosure.errorGeneric"));
      return;
    }
    await queryClient.invalidateQueries();
    navigate("/hotel-closure");
  }

  return (
    <section className="panel" aria-labelledby="hotel-closure-heading" data-testid="hotel-closure-settings" style={{ marginTop: 18 }}>
      <div className="panel-heading">
        <div>
          <div className="eyebrow">{hotelName}</div>
          <h2 id="hotel-closure-heading">{t("hotelClosure.title")}</h2>
        </div>
      </div>
      <div style={{ padding: "0 22px 22px" }}>
        <HotelDataExportButton hotelId={hotelId} hotelName={hotelName} />
        <div className="form-error" role="note" style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
          <TriangleAlert size={15} aria-hidden="true" style={{ flex: "0 0 auto" }} />
          <span>{t("hotelClosure.warning", { wait: CLOSURE_WAIT_DAYS, exportDays: CLOSURE_EXPORT_DAYS })}</span>
        </div>
        {!confirming && (
          <button type="button" className="button button-quiet" style={{ marginTop: 14, color: "var(--clay)" }} onClick={() => setConfirming(true)}>
            {t("hotelClosure.start")}
          </button>
        )}
        {confirming && (
          <form
            className="admin-form"
            style={{ marginTop: 14, padding: 0 }}
            data-testid="hotel-closure-confirm"
            onSubmit={event => {
              event.preventDefault();
              if (!canSubmit || submitting.current) return;
              submitting.current = true;
              void handleClose().finally(() => { submitting.current = false; });
            }}
          >
            {error && <div className="form-error" role="alert" style={{ margin: 0 }}>{error}</div>}
            <label>
              {t("hotelClosure.nameLabel", { name: hotelName })}
              <input value={name} onChange={event => setName(event.target.value)} autoComplete="off" />
            </label>
            <label>
              {t("accountDeletion.passwordLabel")}
              <input type="password" value={password} onChange={event => setPassword(event.target.value)} autoComplete="current-password" />
            </label>
            {needsCode && (
              <label>
                {t("hotelClosure.codeLabel")}
                <input value={code} onChange={event => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" maxLength={6} />
              </label>
            )}
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button type="submit" className="button button-primary" disabled={!canSubmit}>{t("hotelClosure.confirm")}</button>
              <button type="button" className="button button-quiet" disabled={busy} onClick={() => setConfirming(false)}>{t("accountDeletion.cancel")}</button>
            </div>
          </form>
        )}
      </div>
    </section>
  );
}
