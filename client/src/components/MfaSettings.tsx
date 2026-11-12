import React, { useState } from "react";
import { authClient } from "@/lib/auth-client";
import { trpc } from "@/lib/trpc";
import { generateTotpQrDataUrl } from "@/lib/qr";
import { useTranslation } from "@/lib/i18n";

type MfaFactor = {
  id: string;
  status: string;
  factor_type: string;
  friendly_name?: string | null;
};

type EnrollData = {
  id: string;
  totp: { qr_code: string; secret: string; uri: string };
};

export default function MfaSettings() {
  const { t } = useTranslation();
  const trpcUtils = trpc.useUtils();
  const { data: authMe, isLoading: loading, error: authError } = trpc.auth.me.useQuery();

  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [enrollData, setEnrollData] = useState<EnrollData | null>(null);
  const [enrollPassword, setEnrollPassword] = useState("");
  const [showPasswordPrompt, setShowPasswordPrompt] = useState(false);
  const [activeFactorId, setActiveFactorId] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const isEnabled = Boolean(authMe?.twoFactorEnabled);
  const verifiedFactors: MfaFactor[] = isEnabled
    ? [{ id: "totp-authenticator", status: "verified", factor_type: "totp", friendly_name: t("mfaSettings.authenticatorName") }]
    : [];
  const hasVerified = verifiedFactors.length > 0;

  async function handleStartEnroll() {
    setError(null);
    setSuccess(null);
    const password = window.prompt(t("mfaSettings.promptEnablePassword")) ?? enrollPassword;
    if (!password) {
      setShowPasswordPrompt(true);
      return;
    }
    await executeEnroll(password);
  }

  async function executeEnroll(password: string) {
    setError(null);
    setSuccess(null);
    setBusy("enroll");

    try {
      const res = await authClient.twoFactor.enable({ password });
      if (res?.error) {
        if (res.error.code === "TOTP_ALREADY_ENABLED") {
          await trpcUtils.auth.me.invalidate();
        } else {
          setError(res.error.message || t("mfaSettings.enrollFailed"));
        }
        return;
      }

      if (!res.data || res.data.method !== "totp") {
        setError(t("mfaSettings.secretFailed"));
        return;
      }

      const totpURI = res.data.totpURI;
      const secret = new URL(totpURI).searchParams.get("secret") || "";
      const qr_code = generateTotpQrDataUrl(totpURI);

      setEnrollData({
        id: "totp-authenticator",
        totp: { qr_code, secret, uri: totpURI },
      });
      setActiveFactorId("totp-authenticator");
      setShowPasswordPrompt(false);
      setEnrollPassword("");
      setCode("");
    } catch (e) {
      setError(e instanceof Error ? e.message : t("mfaSettings.enrollFailed"));
    } finally {
      setBusy(null);
    }
  }

  function handleChallenge(factorId: string) {
    setError(null);
    setSuccess(null);
    setActiveFactorId(factorId);
    setCode("");
  }

  async function handleVerify() {
    if (!activeFactorId || !code.trim()) {
      setError(t("mfaSettings.enterCode"));
      return;
    }
    setError(null);
    setSuccess(null);
    setBusy("verify");

    try {
      const { error: verifyError } = await authClient.twoFactor.verifyTotp({
        code: code.trim(),
      });

      if (verifyError) {
        const msg = verifyError.message?.toLowerCase().includes("invalid")
          ? t("mfaSettings.incorrectCode")
          : verifyError.message;
        setError(msg || t("mfaSettings.verifyFailed"));
        return;
      }

      setSuccess(enrollData ? t("mfaSettings.enrolledVerified") : t("mfaSettings.codeVerified"));
      setEnrollData(null);
      setActiveFactorId(null);
      setCode("");
      await trpcUtils.auth.me.invalidate();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("mfaSettings.verifyFailed"));
    } finally {
      setBusy(null);
    }
  }

  async function handleUnenroll(_factorId: string) {
    const password = window.prompt(t("mfaSettings.promptDisablePassword"));
    if (!password) return;

    setError(null);
    setSuccess(null);
    setBusy("unenroll");

    try {
      const { error: unenrollError } = await authClient.twoFactor.disable({ password });
      if (unenrollError) {
        setError(unenrollError.message || t("mfaSettings.unenrollFailed"));
        return;
      }
      setSuccess(t("mfaSettings.removed"));
      await trpcUtils.auth.me.invalidate();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("mfaSettings.unenrollFailed"));
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="panel mfa-settings" aria-labelledby="mfa-heading">
      <div className="panel-heading">
        <div>
          <div className="eyebrow">{t("mfaSettings.eyebrow")}</div>
          <h2 id="mfa-heading">{t("mfaSettings.title")}</h2>
          <p className="lede">{t("mfaSettings.intro")}</p>
        </div>
        <span className={`status-pill ${hasVerified ? "live" : "setup"}`}>
          <i /> {hasVerified ? t("mfaSettings.enabled") : t("mfaSettings.notEnabled")}
        </span>
      </div>

      <div className="panel-body">
      {loading && (
        <p role="status" className="lede">
          {t("mfaSettings.loadingStatus")}
        </p>
      )}

      {(error || authError) && (
        <div className="form-error page-alert" role="alert">
          {error || authError?.message}
          <button type="button" className="icon-button" onClick={() => setError(null)} aria-label={t("mfaSettings.dismissError")}>
            ×
          </button>
        </div>
      )}
      {success && (
        <div className="form-success page-alert" role="status">
          {success}
        </div>
      )}

      {!loading && (
        <>
          {hasVerified ? (
            <div className="mfa-factor-list" data-testid="mfa-verified">
              {verifiedFactors.map((f) => (
                <div key={f.id} className="security-action-row">
                  <p>
                    {t("mfaSettings.activeDesc")}{" "}
                    <strong data-testid="mfa-factor-id">{f.id.slice(0, 8)}…</strong> <small>{f.factor_type} · {f.status}</small>
                  </p>
                  <div className="security-buttons">
                    <button
                      type="button"
                      className="button button-primary button-small"
                      disabled={busy === "challenge"}
                      onClick={() => handleChallenge(f.id)}
                    >
                      {t("mfaSettings.verifyWithCode")}
                    </button>
                    <button
                      type="button"
                      className="button button-quiet button-small"
                      disabled={busy === "unenroll"}
                      onClick={() => {
                        if (window.confirm(t("mfaSettings.confirmRemove"))) {
                          void handleUnenroll(f.id);
                        }
                      }}
                    >
                      {busy === "unenroll" ? t("mfaSettings.removing") : t("mfaSettings.removeAuthenticator")}
                    </button>
                  </div>
                </div>
              ))}

              {activeFactorId && !enrollData && (
                <div className="security-subpanel" data-testid="mfa-verify-panel">
                  <h3>{t("mfaSettings.enterVerificationCode")}</h3>
                  <p className="lede">{t("mfaSettings.enterCodeDesc")}</p>
                  <label>
                    {t("mfaSettings.verificationCode")}
                    <input
                      aria-label={t("mfaSettings.verificationCode")}
                      placeholder="123456"
                      value={code}
                      onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                      onKeyDown={(e) => { if (e.key === "Enter" && code.trim().length === 6) void handleVerify(); }}
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      maxLength={6}
                    />
                  </label>
                  <div className="security-buttons">
                    <button
                      type="button"
                      className="button button-primary"
                      disabled={busy === "verify" || !code.trim()}
                      onClick={() => void handleVerify()}
                    >
                      {busy === "verify" ? t("mfaSettings.verifying") : t("mfaSettings.verifyCode")}
                    </button>
                    <button
                      type="button"
                      className="button button-quiet"
                      onClick={() => {
                        setActiveFactorId(null);
                        setCode("");
                        setError(null);
                      }}
                    >
                      {t("mfaSettings.cancel")}
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div data-testid="mfa-not-enrolled">
              <div className="security-action-row">
                <p>{t("mfaSettings.noneEnrolled")}</p>
                {!enrollData && !showPasswordPrompt && (
                  <button
                    type="button"
                    className="button button-primary"
                    disabled={busy === "enroll"}
                    onClick={() => void handleStartEnroll()}
                  >
                    {busy === "enroll" ? t("mfaSettings.enrolling") : t("mfaSettings.enrollAuthenticator")}
                  </button>
                )}
              </div>
              <p className="security-note">{t("mfaSettings.worksForEveryRole")}</p>

              {showPasswordPrompt && !enrollData && (
                <div className="security-subpanel">
                  <h3>{t("mfaSettings.confirmPassword")}</h3>
                  <p className="lede">{t("mfaSettings.confirmPasswordDesc")}</p>
                  <label>
                    {t("mfaSettings.accountPassword")}
                    <input
                      type="password"
                      value={enrollPassword}
                      onChange={(e) => setEnrollPassword(e.target.value)}
                      placeholder={t("mfaSettings.enterPassword")}
                      autoComplete="current-password"
                    />
                  </label>
                  <div className="security-buttons">
                    <button
                      type="button"
                      className="button button-primary"
                      disabled={busy === "enroll" || !enrollPassword}
                      onClick={() => void executeEnroll(enrollPassword)}
                    >
                      {busy === "enroll" ? t("mfaSettings.enrolling") : t("mfaSettings.confirmEnroll")}
                    </button>
                    <button
                      type="button"
                      className="button button-quiet"
                      onClick={() => {
                        setShowPasswordPrompt(false);
                        setEnrollPassword("");
                        setError(null);
                      }}
                    >
                      {t("mfaSettings.cancel")}
                    </button>
                  </div>
                </div>
              )}

              {enrollData && (
                <div className="security-subpanel" data-testid="mfa-enroll-panel">
                  <h3>{t("mfaSettings.scanQr")}</h3>
                  <p className="lede">{t("mfaSettings.scanQrDesc")}</p>
                  {enrollData.totp.qr_code && (
                    <img
                      src={enrollData.totp.qr_code}
                      alt={t("mfaSettings.qrAlt")}
                      data-testid="mfa-qr"
                      className="mfa-qr"
                    />
                  )}
                  <p className="mfa-secret">
                    <strong>{t("mfaSettings.secret")}</strong> <code data-testid="mfa-secret">{enrollData.totp.secret}</code>
                  </p>
                  <p className="mfa-secret">
                    <small>{enrollData.totp.uri}</small>
                  </p>

                  <label>
                    {t("mfaSettings.verificationCode")}
                    <input
                      aria-label={t("mfaSettings.verificationCode")}
                      placeholder="123456"
                      value={code}
                      onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                      onKeyDown={(e) => { if (e.key === "Enter" && code.trim().length === 6) void handleVerify(); }}
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      maxLength={6}
                    />
                  </label>
                  <div className="security-buttons">
                    <button
                      type="button"
                      className="button button-primary"
                      disabled={busy === "verify" || !code.trim()}
                      onClick={() => void handleVerify()}
                    >
                      {busy === "verify" ? t("mfaSettings.verifying") : t("mfaSettings.verifyActivate")}
                    </button>
                    <button
                      type="button"
                      className="button button-quiet"
                      onClick={() => {
                        setEnrollData(null);
                        setActiveFactorId(null);
                        setCode("");
                        setError(null);
                      }}
                    >
                      {t("mfaSettings.cancel")}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}
      </div>
    </section>
  );
}
