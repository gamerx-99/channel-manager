import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { ShieldCheck, Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { shouldEnforceMfaForRoles, hasVerifiedTotpFactor, enrollTotpFactor } from "@/lib/mfa";
import { PLATFORM_ROLES } from "@shared/authorization";
import { useTranslation } from "@/lib/i18n";

export default function MfaEnroll() {
  const { t } = useTranslation();
  const [, navigate] = useLocation();
  const [step, setStep] = useState<"intro" | "enrolling" | "verifying" | "done">("intro");
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [factorId, setFactorId] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [canSkip, setCanSkip] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) { if (!cancelled) setCanSkip(true); return; }

        // If already has verified MFA factor, no need to enroll again
        const { data: factors } = await supabase.auth.mfa.listFactors();
        if (hasVerifiedTotpFactor(factors)) {
          if (!cancelled) navigate("/dashboard");
          return;
        }

        // Resolve platform roles same as Login.tsx: metadata + is_super_admin RPC + hotel_users fallback
        const metaRole = (user.app_metadata as Record<string, unknown>)?.role as string | undefined;
        const roles: string[] = [];
        if (metaRole && (PLATFORM_ROLES as readonly string[]).includes(metaRole)) roles.push(metaRole);
        try {
          const { data: isSuper } = await supabase.rpc("is_super_admin" as never);
          if (isSuper && !roles.includes("super_admin")) roles.push("super_admin");
        } catch { /* ignore */ }
        // If still no platform role, allow skip (hotel roles are opt-in)
        if (!cancelled) setCanSkip(!shouldEnforceMfaForRoles(roles.length ? roles : [metaRole ?? ""]));
      } catch {
        if (!cancelled) setCanSkip(true);
      }
    })();
    return () => { cancelled = true; };
  }, [navigate]);

  async function handleEnroll() {
    setError(null);
    setSubmitting(true);
    setStep("enrolling");

    try {
      const res = await enrollTotpFactor();
      setSubmitting(false);

      if (!res.ok) {
        if (res.alreadyVerified) {
          navigate("/dashboard");
          return;
        }
        setError(res.error);
        setStep("intro");
        return;
      }

      setFactorId(res.data.id);
      setQrCode(res.data.totp.qr_code);
      setSecret(res.data.totp.secret);
      setStep("verifying");
    } catch (e) {
      setSubmitting(false);
      setError(e instanceof Error ? e.message : t("mfaEnroll.errorEnrollFailed"));
      setStep("intro");
    }
  }

  async function handleVerify() {
    if (!factorId || !code.trim()) return;
    setError(null);
    setSubmitting(true);

    try {
      // Create fresh challenge (single-use)
      const { data: challengeData, error: challengeError } = await supabase.auth.mfa.challenge({ factorId });
      if (challengeError || !challengeData) {
        setError(challengeError?.message ?? t("mfaEnroll.errorChallengeFailed"));
        setSubmitting(false);
        return;
      }

      const { error: verifyError } = await supabase.auth.mfa.verify({
        factorId,
        challengeId: challengeData.id,
        code: code.trim(),
      });

      setSubmitting(false);
      if (verifyError) {
        const msg = verifyError.message.toLowerCase().includes("invalid")
          ? t("mfaEnroll.errorIncorrectCode")
          : verifyError.message;
        setError(msg);
        return;
      }
      setStep("done");
      navigate("/dashboard");
    } catch (e) {
      setSubmitting(false);
      setError(e instanceof Error ? e.message : t("mfaEnroll.errorVerifyFailed"));
    }
  }

  function handleReset() {
    setStep("intro");
    setFactorId(null);
    setQrCode(null);
    setSecret(null);
    setCode("");
    setError(null);
  }

  async function handleSkipToDashboard() {
    if (canSkip === false) return; // blocked for platform roles
    navigate("/dashboard");
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
        <div className="login-aside-foot"><span>{t("mfaEnroll.asidePrivateHotel")}</span><span className="signal-text"><i /> {t("mfaEnroll.asideSecureWorkspace")}</span></div>
      </div>
      <main className="login-main">
        <div className="login-card">
          <div className="eyebrow">{t("mfaEnroll.eyebrow")}</div>
          <h2>{t("mfaEnroll.title")}</h2>
          <p>{t("mfaEnroll.lede")}</p>

          {step === "intro" && (
            <>
              <div className="login-security"><ShieldCheck size={15} /><span>{t("mfaEnroll.blockingNotice")}</span></div>
              <button className="button button-primary login-button" type="button" onClick={() => void handleEnroll()} disabled={submitting}>
                {submitting ? <><Loader2 size={16} className="animate-spin" /> {t("mfaEnroll.starting")}</> : t("mfaEnroll.startEnrollment")}
              </button>
              {canSkip !== false && (
                <button className="button" type="button" onClick={() => void handleSkipToDashboard()} style={{ marginTop: 8 }}>
                  {t("mfaEnroll.continueWithoutMfa")}
                </button>
              )}
            </>
          )}

          {(step === "enrolling" || step === "verifying") && qrCode && (
            <div style={{ marginTop: 16 }}>
              <div style={{ background: "#fff", padding: 12, borderRadius: 8, display: "inline-block", border: "1px solid #e5e7eb" }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={qrCode} alt={t("mfaEnroll.qrAlt")} style={{ width: 180, height: 180 }} />
              </div>
              {secret && <p style={{ fontSize: 12, color: "#6b7280", marginTop: 8, wordBreak: "break-all" }}>{t("mfaEnroll.secretLabel", { secret })}</p>}
              <label style={{ display: "block", marginTop: 16 }}>{t("mfaEnroll.codeInputLabel")}
                <input
                  type="text"
                  inputMode="numeric"
                  value={code}
                  onChange={e => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  onKeyDown={e => { if (e.key === "Enter" && code.trim().length === 6 && !submitting) void handleVerify(); }}
                  placeholder={t("mfaEnroll.codePlaceholder")}
                  maxLength={6}
                  style={{ marginTop: 4 }}
                />
              </label>
              <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                <button className="button button-primary login-button" type="button" onClick={() => void handleVerify()} disabled={submitting || code.trim().length < 6} style={{ flex: 1 }}>
                  {submitting ? <><Loader2 size={16} className="animate-spin" /> {t("mfaEnroll.verifying")}</> : t("mfaEnroll.verifyAndContinue")}
                </button>
                <button className="button" type="button" onClick={handleReset} disabled={submitting}>
                  {t("mfaEnroll.cancel")}
                </button>
              </div>
            </div>
          )}

          {step === "enrolling" && !qrCode && submitting && <p style={{ marginTop: 16 }}><Loader2 size={16} className="animate-spin" /> {t("mfaEnroll.preparing")}</p>}

          {error && <p className="form-error" role="alert">{error}</p>}
        </div>
      </main>
    </div>
  );
}
