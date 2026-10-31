import React, { useEffect, useState } from "react";
import { TRPCClientError } from "@trpc/client";
import { KeyRound, Trash2, Edit2 } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useTranslation } from "@/lib/i18n";
import { useMfaStepUp } from "@/lib/mfa";
import { Card, CardContent } from "@/components/ui/card";

// SlipOK is optional per hotel: without a key, staff check each slip by hand.
export default function SlipOkSettings({ hotelId }: { hotelId: string }) {
  const { t } = useTranslation();
  const { mfaState, triggerStepUp, submitTotp, reset } = useMfaStepUp();
  const [apiKey, setApiKey] = useState("");
  const [branchId, setBranchId] = useState("");
  const [totpCode, setTotpCode] = useState("");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);

  // We can't fetch settings until MFA is verified (server enforces it too)
  const settingsQuery = trpc.slipok.getSettings.useQuery(
    { hotel_id: hotelId },
    { enabled: mfaState.status === "verified", retry: false },
  );
  const saveKey = trpc.slipok.saveKey.useMutation();
  const removeKey = trpc.slipok.removeKey.useMutation();

  // Clear form when navigating away (cleanup stale form state)
  useEffect(() => {
    return () => {
      setApiKey("");
      setBranchId("");
      setTotpCode("");
      setSaveError(null);
      setIsEditing(false);
    };
  }, []);

  // If the server-side MFA freshness window expires while the client still thinks
  // it is verified, getSettings returns PRECONDITION_FAILED. Reset the local MFA
  // state so the user is prompted to step-up again instead of getting stuck in a
  // Retry loop that re-uses the stale token.
  useEffect(() => {
    if (mfaState.status !== "verified") return;
    if (!settingsQuery.isError || !settingsQuery.error) return;
    const err = settingsQuery.error;
    if (
      err instanceof TRPCClientError &&
      (err.data as { code?: string } | undefined)?.code === "PRECONDITION_FAILED"
    ) {
      reset();
    }
  }, [mfaState.status, settingsQuery.isError, settingsQuery.error, reset]);

  async function handleOpenSettings() {
    setSaveError(null);
    const result = await triggerStepUp();
    if (result === "needs_enroll") {
      window.location.href = "/mfa/enroll";
    }
  }

  async function handleSaveKey(hotelId: string) {
    setSaveError(null);
    try {
      await saveKey.mutateAsync({ hotel_id: hotelId, api_key: apiKey, branch_id: branchId });
      // Clear form and reset edit mode after successful save
      setApiKey("");
      setBranchId("");
      setIsEditing(false);
      // Refetch to get updated settings from server
      await settingsQuery.refetch();
      reset();
    } catch (e) {
      const serverFault = e instanceof TRPCClientError && (e.data as { code?: string } | undefined)?.code === "INTERNAL_SERVER_ERROR";
      setSaveError(e instanceof Error && !serverFault ? e.message : t("slipOk.saveFailed"));
    }
  }

  async function handleRemoveKey(hotelId: string) {
    setSaveError(null);
    if (!window.confirm(t("slipOk.removeConfirm"))) {
      return;
    }
    const result = await triggerStepUp();
    if (result === "needs_enroll") { window.location.href = "/mfa/enroll"; return; }
    if (result === "verified" || mfaState.status === "verified") {
      try {
        await removeKey.mutateAsync({ hotel_id: hotelId });
        // Clear form after successful removal
        setApiKey("");
        setBranchId("");
        setIsEditing(false);
        // Refetch to get updated settings from server
        await settingsQuery.refetch();
      } catch (e) {
        setSaveError(e instanceof Error ? e.message : t("slipOk.removeFailed"));
      }
    }
  }

  function handleEdit() {
    setIsEditing(true);
    setSaveError(null);
  }

  function handleCancel() {
    setApiKey("");
    setBranchId("");
    setSaveError(null);
    setIsEditing(false);
  }

  return (
    <section aria-label={t("slipOk.title")} className="border-t border-[#dce4df] pt-7">
      <div className="mb-4">
        <p className="eyebrow">{t("slipOk.eyebrow")}</p>
        <h2 className="mt-1 text-xl font-semibold tracking-tight text-[#1b2c25]">{t("slipOk.title")}</h2>
        <p className="mt-1 text-sm text-[#6c7e75]">{t("slipOk.description")}</p>
        <p className="mt-1 text-sm text-[#6c7e75]">{t("slipOk.accountHint")}</p>
      </div>

      <Card className="border-[#dce4df] shadow-[0_12px_35px_rgba(30,65,49,0.05)]">
        <CardContent className="p-6">
          {/* Idle / prompt to unlock */}
          {(mfaState.status === "idle" || mfaState.status === "error") && (
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                <span className="rounded-xl bg-[#edf7f1] p-2 text-[#1d6b56]"><KeyRound size={18} aria-hidden="true" /></span>
                <div>
                  <p className="text-sm font-medium text-[#263b31]">{t("slipOk.mfaTitle")}</p>
                  <p className="text-xs text-[#6c7e75]">{t("slipOk.mfaBody")}</p>
                </div>
              </div>
              <button
                id="slipok-unlock-btn"
                type="button"
                onClick={handleOpenSettings}
                className="inline-flex items-center gap-2 rounded-lg border border-[#1d6b56] bg-[#1d6b56] px-4 py-2 text-sm font-medium text-white hover:bg-[#1a5e4c] transition-colors"
              >
                <KeyRound size={15} aria-hidden="true" /> {t("slipOk.unlock")}
              </button>
              {mfaState.status === "error" && (
                <p className="text-xs text-red-600">{mfaState.message}</p>
              )}
            </div>
          )}

          {/* TOTP challenge input */}
          {mfaState.status === "needs_challenge" && (
            <div className="flex flex-col gap-3">
              <p className="text-sm font-medium text-[#263b31]">{t("slipOk.totpPrompt")}</p>
              <div className="flex gap-2">
                <input
                  id="slipok-totp-input"
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  placeholder="000000"
                  value={totpCode}
                  onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ""))}
                  className="w-32 rounded-lg border border-[#dce4df] px-3 py-2 text-center font-mono text-lg tracking-widest focus:outline-none focus:ring-2 focus:ring-[#1d6b56]"
                />
                <button
                  id="slipok-totp-submit"
                  type="button"
                  onClick={async () => {
                    const ok = await submitTotp(totpCode);
                    if (ok) setTotpCode("");
                  }}
                  disabled={totpCode.length !== 6}
                  className="rounded-lg border border-[#1d6b56] bg-[#1d6b56] px-4 py-2 text-sm font-medium text-white hover:bg-[#1a5e4c] disabled:opacity-50 transition-colors"
                >
                  {t("slipOk.verify")}
                </button>
                <button type="button" onClick={() => { reset(); setTotpCode(""); }} className="rounded-lg border border-[#dce4df] px-3 py-2 text-sm text-[#6c7e75] hover:bg-[#f6faf7]">{t("slipOk.cancel")}</button>
              </div>
              {"error" in mfaState && mfaState.error && (
                <p className="text-xs text-red-600">{mfaState.error}</p>
              )}
            </div>
          )}

          {mfaState.status === "pending" && (
            <div className="flex items-center gap-2 text-sm text-[#6c7e75]">
              <span className="inline-flex h-4 w-4 animate-spin rounded-full border-2 border-[#b7c9c0] border-t-[#1d6b56]" aria-hidden="true" />
              {t("slipOk.verifying")}
            </div>
          )}

          {mfaState.status === "needs_enroll" && (
            <div className="text-sm text-[#6c7e75]">
              {t("slipOk.needsEnroll")} <a href="/mfa/enroll" className="text-[#1d6b56] underline">{t("slipOk.enrollLink")}</a>
            </div>
          )}

          {mfaState.status === "verified" && settingsQuery.isLoading && (
            <div className="flex items-center gap-2 text-sm text-[#6c7e75]">
              <span className="inline-flex h-4 w-4 animate-spin rounded-full border-2 border-[#b7c9c0] border-t-[#1d6b56]" aria-hidden="true" />
              {t("slipOk.loading")}
            </div>
          )}
          {mfaState.status === "verified" && settingsQuery.isError && (
            <div className="flex flex-col gap-2">
              <p className="text-sm text-red-600">
                {t("slipOk.loadError", { message: settingsQuery.error instanceof Error ? settingsQuery.error.message : t("slipOk.unknownError") })}
              </p>
              <button
                type="button"
                onClick={() => void settingsQuery.refetch()}
                className="w-max rounded-lg border border-[#dce4df] px-3 py-2 text-sm text-[#456156] hover:bg-[#f6faf7]"
              >
                {t("slipOk.retry")}
              </button>
            </div>
          )}

          {/* Verified — show settings (list-style like Vercel env vars) */}
          {mfaState.status === "verified" && settingsQuery.data !== undefined && (
            <div className="flex flex-col gap-5">
              {settingsQuery.data.configured && !isEditing ? (
                <>
                  <div className="flex items-center justify-between rounded-lg border border-[#dce4df] bg-[#f6faf7] p-4">
                    <div className="flex-1">
                      <p className="text-xs font-medium text-[#456156]">{t("slipOk.connected")}</p>
                      <p className="mt-2 font-mono text-sm text-[#263b31]">
                        {t("slipOk.branchLabel")}: <span className="text-[#1d6b56]">{settingsQuery.data.branchId}</span> • {t("slipOk.keyLabel")}: <span className="text-[#789087]">••••••••</span>
                      </p>
                      <p className="mt-1 text-xs text-[#6c7e75]">{t("slipOk.keyHiddenNote")}</p>
                    </div>
                    <div className="flex gap-2 ml-4">
                      <button
                        id="slipok-edit-btn"
                        type="button"
                        onClick={handleEdit}
                        className="inline-flex items-center gap-1 rounded-lg border border-[#dce4df] bg-white px-3 py-2 text-sm font-medium text-[#456156] hover:bg-[#edf2ee] transition-colors"
                      >
                        <Edit2 size={14} aria-hidden="true" /> {t("slipOk.edit")}
                      </button>
                      <button
                        id="slipok-remove-btn"
                        type="button"
                        onClick={() => void handleRemoveKey(hotelId)}
                        disabled={removeKey.isPending}
                        className="inline-flex items-center gap-1 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-100 disabled:opacity-50 transition-colors"
                      >
                        <Trash2 size={14} aria-hidden="true" /> {removeKey.isPending ? t("slipOk.removing") : t("slipOk.remove")}
                      </button>
                    </div>
                  </div>
                </>
              ) : null}

              {!settingsQuery.data.configured || isEditing ? (
                <div className="flex flex-col gap-3">
                  <p className="text-xs font-medium text-[#456156]">{isEditing ? t("slipOk.editTitle") : t("slipOk.addTitle")}</p>
                  <p className="text-xs text-[#6c7e75]">{t("slipOk.formHint")}</p>
                  <div className="flex flex-col gap-3 sm:flex-row">
                    <div className="flex-1">
                      <label htmlFor="slipok-branch-id" className="mb-1 block text-xs font-medium text-[#456156]">
                        {t("slipOk.branchLabel")}
                      </label>
                      <input
                        id="slipok-branch-id"
                        type="text"
                        autoComplete="off"
                        value={branchId}
                        onChange={(e) => setBranchId(e.target.value)}
                        placeholder={t("slipOk.branchPlaceholder")}
                        className="w-full rounded-lg border border-[#dce4df] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1d6b56]"
                      />
                    </div>
                    <div className="flex-1">
                      <label htmlFor="slipok-api-key" className="mb-1 block text-xs font-medium text-[#456156]">
                        {t("slipOk.keyLabel")}
                      </label>
                      <input
                        id="slipok-api-key"
                        type="password"
                        autoComplete="off"
                        value={apiKey}
                        onChange={(e) => setApiKey(e.target.value)}
                        className="w-full rounded-lg border border-[#dce4df] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1d6b56]"
                      />
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      id="slipok-save-btn"
                      type="button"
                      disabled={apiKey.trim().length < 8 || branchId.trim().length < 1 || saveKey.isPending}
                      onClick={() => void handleSaveKey(hotelId)}
                      className="rounded-lg border border-[#1d6b56] bg-[#1d6b56] px-4 py-2 text-sm font-medium text-white hover:bg-[#1a5e4c] disabled:opacity-50 transition-colors"
                    >
                      {saveKey.isPending ? t("slipOk.saving") : t("slipOk.save")}
                    </button>
                    {isEditing && (
                      <button
                        type="button"
                        onClick={handleCancel}
                        className="rounded-lg border border-[#dce4df] px-4 py-2 text-sm font-medium text-[#6c7e75] hover:bg-[#f6faf7] transition-colors"
                      >
                        {t("slipOk.cancel")}
                      </button>
                    )}
                  </div>
                  {saveError && <p className="text-xs text-red-600">{saveError}</p>}
                </div>
              ) : null}
            </div>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
