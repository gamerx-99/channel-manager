import React, { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { ShieldCheck, Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { shouldEnforceMfaForRoles, cleanupUnverifiedFactors, hasVerifiedTotpFactor } from "@/lib/mfa";
import { PLATFORM_ROLES } from "@shared/authorization";

export default function MfaEnroll() {
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
      // 1. Clean up stale unverified factors to prevent "already exists" errors
      await cleanupUnverifiedFactors();

      let enrollRes = await supabase.auth.mfa.enroll({
        factorType: "totp",
      });

      // If duplicate factor error occurs, retry once after forced cleanup
      if (enrollRes.error && enrollRes.error.message.toLowerCase().includes("already exists")) {
        await cleanupUnverifiedFactors();
        enrollRes = await supabase.auth.mfa.enroll({ factorType: "totp" });
      }

      setSubmitting(false);
      if (enrollRes.error || !enrollRes.data) {
        setError(enrollRes.error?.message ?? "Unable to start MFA enrollment.");
        setStep("intro");
        return;
      }

      setFactorId(enrollRes.data.id);
      setQrCode((enrollRes.data as unknown as { totp: { qr_code: string; secret: string } }).totp.qr_code);
      setSecret((enrollRes.data as unknown as { totp: { qr_code: string; secret: string } }).totp.secret);
      setStep("verifying");
    } catch (e) {
      setSubmitting(false);
      setError(e instanceof Error ? e.message : "Enrollment failed");
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
        setError(challengeError?.message ?? "Unable to create MFA challenge.");
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
          ? "Incorrect code — please check your authenticator app and enter the current 6-digit code."
          : verifyError.message;
        setError(msg);
        return;
      }
      setStep("done");
      navigate("/dashboard");
    } catch (e) {
      setSubmitting(false);
      setError(e instanceof Error ? e.message : "Verification failed");
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
          <span className="brand-mark"><span /></span><strong>channel<em>manager</em></strong>
        </div>
        <div className="login-aside-copy">
          <div className="eyebrow">Multi-factor authentication</div>
          <h1>Secure your<br /><i>platform access.</i></h1>
          <p>Platform administrators must enroll an authenticator app before accessing the workspace.</p>
        </div>
        <div className="login-aside-foot"><span>Private hotel operations</span><span className="signal-text"><i /> Secure workspace</span></div>
      </div>
      <main className="login-main">
        <div className="login-card">
          <div className="eyebrow">MFA required</div>
          <h2>Enroll authenticator</h2>
          <p>Use an authenticator app (Google Authenticator, Authy, 1Password) to scan the QR code and enter the 6-digit code.</p>

          {step === "intro" && (
            <>
              <div className="login-security"><ShieldCheck size={15} /><span>Blocking enrollment — you cannot access the dashboard until MFA is enrolled.</span></div>
              <button className="button button-primary login-button" type="button" onClick={() => void handleEnroll()} disabled={submitting}>
                {submitting ? <><Loader2 size={16} className="animate-spin" /> Starting…</> : "Start enrollment"}
              </button>
              {canSkip !== false && (
                <button className="button" type="button" onClick={() => void handleSkipToDashboard()} style={{ marginTop: 8 }}>
                  Continue without MFA (hotel roles only)
                </button>
              )}
            </>
          )}

          {(step === "enrolling" || step === "verifying") && qrCode && (
            <div style={{ marginTop: 16 }}>
              <div style={{ background: "#fff", padding: 12, borderRadius: 8, display: "inline-block", border: "1px solid #e5e7eb" }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={qrCode} alt="MFA QR code" style={{ width: 180, height: 180 }} />
              </div>
              {secret && <p style={{ fontSize: 12, color: "#6b7280", marginTop: 8, wordBreak: "break-all" }}>Secret: {secret}</p>}
              <label style={{ display: "block", marginTop: 16 }}>6-digit code from your authenticator app
                <input
                  type="text"
                  inputMode="numeric"
                  value={code}
                  onChange={e => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  onKeyDown={e => { if (e.key === "Enter" && code.trim().length === 6 && !submitting) void handleVerify(); }}
                  placeholder="123456"
                  maxLength={6}
                  style={{ marginTop: 4 }}
                />
              </label>
              <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                <button className="button button-primary login-button" type="button" onClick={() => void handleVerify()} disabled={submitting || code.trim().length < 6} style={{ flex: 1 }}>
                  {submitting ? <><Loader2 size={16} className="animate-spin" /> Verifying…</> : "Verify and continue"}
                </button>
                <button className="button" type="button" onClick={handleReset} disabled={submitting}>
                  Cancel
                </button>
              </div>
            </div>
          )}

          {step === "enrolling" && !qrCode && submitting && <p style={{ marginTop: 16 }}><Loader2 size={16} className="animate-spin" /> Preparing secure enrollment…</p>}

          {error && <p className="form-error" role="alert">{error}</p>}
        </div>
      </main>
    </div>
  );
}
