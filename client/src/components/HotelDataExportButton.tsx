import { useState } from "react";
import { useTranslation } from "@/lib/i18n";
import { trpc } from "@/lib/trpc";

const errorCode = (error: unknown) => (error as { data?: { code?: string } | null })?.data?.code;

/** Downloads the hotel's data as JSON. With 2FA on, the server asks for a code first. */
export default function HotelDataExportButton({ hotelId, hotelName }: { hotelId: string; hotelName: string }) {
  const { t } = useTranslation();
  const exportData = trpc.hotelClosure.exportData.useMutation();
  const verifyMfa = trpc.auth.verifyMfaStepUp.useMutation();
  const [needsCode, setNeedsCode] = useState(false);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const busy = exportData.isPending || verifyMfa.isPending;

  async function download() {
    setError(null);
    try {
      if (needsCode) await verifyMfa.mutateAsync({ code });
    } catch {
      setError(t("hotelClosure.errorCode"));
      return;
    }
    try {
      const data = await exportData.mutateAsync({ hotel_id: hotelId });
      const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = `${hotelName.replace(/[\s\\/:*?"<>|]+/g, "-")}-data.json`;
      link.click();
      URL.revokeObjectURL(url);
      setNeedsCode(false);
      setCode("");
    } catch (caught) {
      if (errorCode(caught) === "PRECONDITION_FAILED") setNeedsCode(true);
      else setError(t("hotelClosure.errorExport"));
    }
  }

  return (
    <div data-testid="hotel-data-export">
      {needsCode && (
        <label style={{ display: "block", marginBottom: 8 }}>
          {t("hotelClosure.codeLabel")}
          <input value={code} onChange={event => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" maxLength={6} />
        </label>
      )}
      <button type="button" className="button button-quiet" disabled={busy || (needsCode && code.length !== 6)} onClick={() => void download()}>
        {busy ? t("hotelClosure.exporting") : t("hotelClosure.export")}
      </button>
      {error && <div className="form-error" role="alert">{error}</div>}
      <p className="lede" style={{ marginTop: 6 }}>{t("hotelClosure.exportNote")}</p>
    </div>
  );
}
