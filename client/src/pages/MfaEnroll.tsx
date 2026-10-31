import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { ShieldCheck, Loader2 } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { trpc } from "@/lib/trpc";
import { mfaReturnPath, shouldEnforceMfaForRoles } from "@/lib/mfa";
import { generateTotpQrDataUrl } from "@/lib/qr";
import { useTranslation } from "@/lib/i18n";
import type { AppRole } from "@shared/authorization";

export default function MfaEnroll() {
  const { t } = useTranslation();
  const [, navigate] = useLocation();
  const returnPath = mfaReturnPath(typeof window === "undefined" ? "" : window.location.search);
  const [step, setStep] = useState<"intro" | "enrolling" | "verifying" | "done">("intro");
  const [password, setPassword] = useState("");
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [canSkip, setCanSkip] = useState<boolean | null>(null);

  const { data: authMe, isLoading: loadingMe } = trpc.auth.me.useQuery();

  useEffect(() => {
    if (loadingMe || !authMe) return;

    // If already has verified MFA, no need to enroll again
    if (authMe.twoFactorEnabled) {
      navigate(returnPath);
      return;
    }

    const roles = (authMe.roles?.length ? authMe.roles : authMe.role ? [authMe.role] : []) as AppRole[];
    const isPlatformRole = shouldEnforceMfaForRoles(roles);
    setCanSkip(!isPlatformRole);
  }, [authMe, loadingMe, navigate, returnPath]);

  async function handleEnroll() {
    setError(null);
    if (!password) {
      setError(t("login.passwordLabel") ? `${t("login.passwordLabel")} required` : "Password is required to enable 2FA");
      return;
    }

    setSubmitting(true);
    setStep("enrolling");

    try {
      const res = await authClient.twoFactor.enable({ password });
      setSubmitting(false);

      if (res.error) {
        if (res.error.code === "TOTP_ALREADY_ENABLED") {
          navigate(returnPath);
          return;
        }
        setError(res.error.message || t("mfaEnroll.errorEnrollFailed"));
        setStep("intro");
        return;
      }

      if (!res.data || res.data.method !== "totp") {
        setError(t("mfaEnroll.errorEnrollFailed") || "No TOTP URI returned");
        setStep("intro");
        return;
      }

      const totpURI = res.data.totpURI;
      const parsedSecret = new URL(totpURI).searchParams.get("secret") || "";
      const qrDataUrl = generateTotpQrDataUrl(totpURI);

      setQrCode(qrDataUrl);
      setSecret(parsedSecret);
      setStep("verifying");
    } catch (e) {
      setSubmitting(false);
      setError(e instanceof Error ? e.message : t("mfaEnroll.errorEnrollFailed"));
      setStep("intro");
    }
  }

  async function handleVerify() {
    if (!code.trim() || code.trim().length !== 6) return;
    setError(null);
    setSubmitting(true);

    try {
      const { error: verifyError } = await authClient.twoFactor.verifyTotp({
        code: code.trim(),
      });

      setSubmitting(false);
      if (verifyError) {
        const msg = verifyError.message?.toLowerCase().includes("invalid")
          ? t("mfaEnroll.errorIncorrectCode")
          : verifyError.message;
        setError(msg || t("mfaEnroll.errorVerifyFailed"));
        return;
      }

      setStep("done");
      navigate(returnPath);
    } catch (e) {
      setSubmitting(false);
      setError(e instanceof Error ? e.message : t("mfaEnroll.errorVerifyFailed"));
    }
  }

  function handleReset() {
    setStep("intro");
    setQrCode(null);
    setSecret(null);
    setCode("");
    setError(null);
  }

  async function handleSkipToDashboard() {
    if (canSkip === false) return; // blocked for platform roles
    navigate(returnPath);
  }

  return (
    <div className="login-page">
      <div className="login-aside">
        <div className="login-brand">
          <span className="brand-mark"><span /></span><strong>hay<em>host</em></strong>
        </div>
        <div className="login-aside-copy">
          <div className="eyebrow">{t("mfaEnroll.asideEyebrow")}</div>
          <h1>{t("mfaEnroll.asideTitle")}<br /><i>{t("mfaEnroll.asideTitleHighlight")}</i></h1>
          <p>{t("mfaEnroll.asideDesc")}</p>
        </div>
        <div className="login-aside-foot">
          <span>{t("mfaEnroll.asidePrivateHotel")}</span>
          <span className="signal-text"><i /> {t("mfaEnroll.asideSecureWorkspace")}</span>
        </div>
      </div>
      <main className="login-main">
        <div className="login-card">
          <div className="eyebrow">{t("mfaEnroll.eyebrow")}</div>
          <h2>{t("mfaEnroll.title")}</h2>
          <p>{t("mfaEnroll.lede")}</p>

          {step === "intro" && (
            <>
              <div className="login-security">
                <ShieldCheck size={15} />
                <span>{t("mfaEnroll.blockingNotice")}</span>
              </div>
              <label style={{ display: "block", marginTop: 12 }}>
                {t("login.passwordLabel") || "Current Password"}
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password to confirm identity"
                  autoComplete="current-password"
                  required
                  style={{ marginTop: 4 }}
                />
              </label>
              <button
                className="button button-primary login-button"
                type="button"
                onClick={() => void handleEnroll()}
                disabled={submitting || !password}
                style={{ marginTop: 12 }}
              >
                {submitting ? <><Loader2 size={16} className="animate-spin" /> {t("mfaEnroll.starting")}</> : t("mfaEnroll.startEnrollment")}
              </button>
              {canSkip !== false && (
                <button
                  className="button"
                  type="button"
                  onClick={() => void handleSkipToDashboard()}
                  style={{ marginTop: 8 }}
                >
                  {t("mfaEnroll.continueWithoutMfa")}
                </button>
              )}
            </>
          )}

          {(step === "enrolling" || step === "verifying") && qrCode && (
            <div style={{ marginTop: 16 }}>
              <div style={{ background: "#fff", padding: 12, borderRadius: 8, display: "inline-block", border: "1px solid #e5e7eb" }}>
                <img src={qrCode} alt={t("mfaEnroll.qrAlt")} style={{ width: 180, height: 180 }} />
              </div>
              {secret && <p style={{ fontSize: 12, color: "#6b7280", marginTop: 8, wordBreak: "break-all" }}>{t("mfaEnroll.secretLabel", { secret })}</p>}
              <label style={{ display: "block", marginTop: 16 }}>
                {t("mfaEnroll.codeInputLabel")}
                <input
                  type="text"
                  inputMode="numeric"
                  value={code}
                  onChange={e => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  onKeyDown={e => { if (e.key === "Enter" && code.trim().length === 6 && !submitting) void handleVerify(); }}
                  placeholder={t("mfaEnroll.codePlaceholder")}
                  maxLength={6}
                  style={{ marginTop: 4 }}
                  autoFocus
                />
              </label>
              <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                <button
                  className="button button-primary login-button"
                  type="button"
                  onClick={() => void handleVerify()}
                  disabled={submitting || code.trim().length !== 6}
                  style={{ flex: 1 }}
                >
                  {submitting ? <><Loader2 size={16} className="animate-spin" /> {t("mfaEnroll.verifying")}</> : t("mfaEnroll.verifyAndContinue")}
                </button>
                <button className="button" type="button" onClick={handleReset} disabled={submitting}>
                  {t("mfaEnroll.cancel")}
                </button>
              </div>
            </div>
          )}

          {step === "enrolling" && !qrCode && submitting && (
            <p style={{ marginTop: 16 }}><Loader2 size={16} className="animate-spin" /> {t("mfaEnroll.preparing")}</p>
          )}

          {error && <p className="form-error" role="alert">{error}</p>}
        </div>
      </main>
    </div>
  );
}
