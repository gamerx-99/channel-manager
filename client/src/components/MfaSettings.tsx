import React, { useState } from "react";
import { authClient } from "@/lib/auth-client";
import { trpc } from "@/lib/trpc";
import { generateTotpQrDataUrl } from "@/lib/qr";

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
    ? [{ id: "totp-authenticator", status: "verified", factor_type: "totp", friendly_name: "Authenticator" }]
    : [];
  const hasVerified = verifiedFactors.length > 0;

  async function handleStartEnroll() {
    setError(null);
    setSuccess(null);
    const password = window.prompt("Enter your account password to enable two-factor authentication:") ?? enrollPassword;
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
          setError(res.error.message || "Enrollment failed");
        }
        return;
      }

      if (!res.data || res.data.method !== "totp") {
        setError("Failed to generate TOTP secret");
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
      setError(e instanceof Error ? e.message : "Enrollment failed");
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
      setError("Enter a 6-digit code");
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
          ? "Incorrect code — please wait for the next 6-digit code and try again"
          : verifyError.message;
        setError(msg || "Verification failed");
        return;
      }

      setSuccess(enrollData ? "Authenticator enrolled and verified" : "Code verified successfully");
      setEnrollData(null);
      setActiveFactorId(null);
      setCode("");
      await trpcUtils.auth.me.invalidate();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Verification failed");
    } finally {
      setBusy(null);
    }
  }

  async function handleUnenroll(_factorId: string) {
    const password = window.prompt("Enter your account password to disable two-factor authentication:");
    if (!password) return;

    setError(null);
    setSuccess(null);
    setBusy("unenroll");

    try {
      const { error: unenrollError } = await authClient.twoFactor.disable({ password });
      if (unenrollError) {
        setError(unenrollError.message || "Unenroll failed");
        return;
      }
      setSuccess("Authenticator removed");
      await trpcUtils.auth.me.invalidate();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unenroll failed");
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="panel mfa-settings" aria-labelledby="mfa-heading">
      <div className="panel-heading">
        <div>
          <div className="eyebrow">Security / MFA</div>
          <h2 id="mfa-heading">Two-factor authentication</h2>
        </div>
        <span className={`status-pill ${hasVerified ? "live" : "setup"}`}>
          <i /> {hasVerified ? "Enabled" : "Not enabled"}
        </span>
      </div>

      <p className="lede" style={{ marginTop: 8 }}>
        Add a TOTP authenticator app (Google Authenticator, Authy, 1Password) to protect your account. Works for every
        role.
      </p>

      {loading && (
        <p role="status" className="lede">
          Loading authenticator status…
        </p>
      )}

      {(error || authError) && (
        <div className="form-error page-alert" role="alert">
          {error || authError?.message}
          <button type="button" className="icon-button" onClick={() => setError(null)} aria-label="Dismiss error">
            ×
          </button>
        </div>
      )}
      {success && (
        <div className="form-success page-alert" role="status" style={{ color: "var(--pine)", borderColor: "var(--pine)" }}>
          {success}
        </div>
      )}

      {!loading && (
        <>
          {hasVerified ? (
            <div className="mfa-factor-list" data-testid="mfa-verified">
              <p>
                Authenticator is active for this account. You can step-up verify with a fresh code or remove the
                authenticator.
              </p>
              {verifiedFactors.map((f) => (
                <div key={f.id} className="panel" style={{ padding: 12, marginTop: 12 }}>
                  <strong data-testid="mfa-factor-id">{f.id.slice(0, 8)}…</strong>
                  <small style={{ marginLeft: 8 }}>{f.factor_type} · {f.status}</small>
                  <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button
                      type="button"
                      className="button button-primary button-small"
                      disabled={busy === "challenge"}
                      onClick={() => handleChallenge(f.id)}
                    >
                      Verify with code
                    </button>
                    <button
                      type="button"
                      className="button button-quiet button-small"
                      disabled={busy === "unenroll"}
                      onClick={() => {
                        if (window.confirm("Remove this authenticator? You will no longer be prompted for a TOTP code.")) {
                          void handleUnenroll(f.id);
                        }
                      }}
                    >
                      {busy === "unenroll" ? "Removing…" : "Remove authenticator"}
                    </button>
                  </div>
                </div>
              ))}

              {activeFactorId && !enrollData && (
                <div className="panel" style={{ marginTop: 12, padding: 12 }} data-testid="mfa-verify-panel">
                  <h3>Enter verification code</h3>
                  <p className="lede">Enter the 6-digit code from your authenticator app.</p>
                  <label>
                    Verification code
                    <input
                      aria-label="Verification code"
                      placeholder="123456"
                      value={code}
                      onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                      onKeyDown={(e) => { if (e.key === "Enter" && code.trim().length === 6) void handleVerify(); }}
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      maxLength={6}
                    />
                  </label>
                  <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                    <button
                      type="button"
                      className="button button-primary"
                      disabled={busy === "verify" || !code.trim()}
                      onClick={() => void handleVerify()}
                    >
                      {busy === "verify" ? "Verifying…" : "Verify code"}
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
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div data-testid="mfa-not-enrolled">
              <p>No authenticator enrolled yet.</p>

              {showPasswordPrompt && !enrollData && (
                <div className="panel" style={{ marginTop: 12, padding: 12 }}>
                  <h3>Confirm password</h3>
                  <p className="lede">Please enter your current password to begin TOTP enrollment.</p>
                  <label>
                    Account Password
                    <input
                      type="password"
                      value={enrollPassword}
                      onChange={(e) => setEnrollPassword(e.target.value)}
                      placeholder="Enter password"
                      autoComplete="current-password"
                    />
                  </label>
                  <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                    <button
                      type="button"
                      className="button button-primary"
                      disabled={busy === "enroll" || !enrollPassword}
                      onClick={() => void executeEnroll(enrollPassword)}
                    >
                      {busy === "enroll" ? "Enrolling…" : "Confirm & Enroll"}
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
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {!enrollData && !showPasswordPrompt && (
                <button
                  type="button"
                  className="button button-primary"
                  disabled={busy === "enroll"}
                  onClick={() => void handleStartEnroll()}
                >
                  {busy === "enroll" ? "Enrolling…" : "Enroll authenticator"}
                </button>
              )}

              {enrollData && (
                <div className="panel" style={{ marginTop: 12, padding: 12 }} data-testid="mfa-enroll-panel">
                  <h3>Scan QR code</h3>
                  <p className="lede">Scan this QR code in your authenticator app, or enter the secret manually.</p>
                  {enrollData.totp.qr_code && (
                    <img
                      src={enrollData.totp.qr_code}
                      alt="MFA QR code"
                      data-testid="mfa-qr"
                      style={{ width: 180, height: 180, border: "1px solid var(--border)", borderRadius: 8 }}
                    />
                  )}
                  <p style={{ marginTop: 8, wordBreak: "break-all" }}>
                    <strong>Secret:</strong> <code data-testid="mfa-secret">{enrollData.totp.secret}</code>
                  </p>
                  <p style={{ wordBreak: "break-all" }}>
                    <small>{enrollData.totp.uri}</small>
                  </p>

                  <label style={{ marginTop: 12, display: "block" }}>
                    Verification code
                    <input
                      aria-label="Verification code"
                      placeholder="123456"
                      value={code}
                      onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                      onKeyDown={(e) => { if (e.key === "Enter" && code.trim().length === 6) void handleVerify(); }}
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      maxLength={6}
                    />
                  </label>
                  <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                    <button
                      type="button"
                      className="button button-primary"
                      disabled={busy === "verify" || !code.trim()}
                      onClick={() => void handleVerify()}
                    >
                      {busy === "verify" ? "Verifying…" : "Verify and activate"}
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
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </section>
  );
}
