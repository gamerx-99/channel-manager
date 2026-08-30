import React, { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

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
  const [factors, setFactors] = useState<MfaFactor[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [enrollData, setEnrollData] = useState<EnrollData | null>(null);
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [activeFactorId, setActiveFactorId] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  async function refreshFactors() {
    setLoading(true);
    setError(null);
    try {
      const { data, error: listError } = await supabase.auth.mfa.listFactors();
      if (listError) {
        setError(listError.message);
        setFactors([]);
        return;
      }
      const totp = (data?.totp ?? []) as MfaFactor[];
      setFactors(totp);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load MFA factors");
      setFactors([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refreshFactors();
  }, []);

  async function handleEnroll() {
    setError(null);
    setSuccess(null);
    setBusy("enroll");
    try {
      const { data, error: enrollError } = await supabase.auth.mfa.enroll({
        factorType: "totp",
      });
      if (enrollError) {
        setError(enrollError.message);
        return;
      }
      if (!data) {
        setError("Enrollment failed: no data returned");
        return;
      }
      const typed = data as unknown as EnrollData;
      setEnrollData(typed);
      setActiveFactorId(typed.id);
      setChallengeId(null);
      setCode("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Enrollment failed");
    } finally {
      setBusy(null);
    }
  }

  async function handleChallenge(factorId: string) {
    setError(null);
    setSuccess(null);
    setBusy("challenge");
    try {
      const { data, error: challengeError } = await supabase.auth.mfa.challenge({ factorId });
      if (challengeError) {
        setError(challengeError.message);
        return;
      }
      if (!data) {
        setError("Challenge failed: no data");
        return;
      }
      const id = (data as { id: string }).id;
      setChallengeId(id);
      setActiveFactorId(factorId);
      setCode("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Challenge failed");
    } finally {
      setBusy(null);
    }
  }

  async function handleVerify() {
    if (!activeFactorId || !code.trim()) {
      setError("Enter a 6-digit code");
      return;
    }
    setError(null);
    setSuccess(null);
    setBusy("verify");

    let cid = challengeId;
    // For TOTP enrollment the challenge is required; create one if not present
    if (!cid && activeFactorId) {
      try {
        const { data: chData, error: chErr } = await supabase.auth.mfa.challenge({ factorId: activeFactorId });
        if (chErr) {
          setError(chErr.message);
          setBusy(null);
          return;
        }
        cid = (chData as { id: string }).id;
        setChallengeId(cid);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Challenge failed");
        setBusy(null);
        return;
      }
    }

    try {
      const { error: verifyError } = await supabase.auth.mfa.verify({
        factorId: activeFactorId,
        challengeId: cid!,
        code: code.trim(),
      });
      if (verifyError) {
        setError(verifyError.message);
        return;
      }
      setSuccess(enrollData ? "Authenticator enrolled and verified" : "Code verified successfully");
      setEnrollData(null);
      setChallengeId(null);
      setActiveFactorId(null);
      setCode("");
      await refreshFactors();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Verification failed");
    } finally {
      setBusy(null);
    }
  }

  async function handleUnenroll(factorId: string) {
    setError(null);
    setSuccess(null);
    setBusy("unenroll");
    try {
      const { error: unenrollError } = await supabase.auth.mfa.unenroll({ factorId });
      if (unenrollError) {
        setError(unenrollError.message);
        return;
      }
      setSuccess("Authenticator removed");
      await refreshFactors();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unenroll failed");
    } finally {
      setBusy(null);
    }
  }

  const verifiedFactors = factors?.filter((f) => f.status === "verified") ?? [];
  const hasVerified = verifiedFactors.length > 0;
  const primaryFactor = verifiedFactors[0] ?? factors?.[0] ?? null;

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

      {error && (
        <div className="form-error page-alert" role="alert">
          {error}
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
                      onClick={() => void handleChallenge(f.id)}
                    >
                      {busy === "challenge" ? "Creating challenge…" : "Verify with code"}
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

              {challengeId && activeFactorId && (
                <div className="panel" style={{ marginTop: 12, padding: 12 }} data-testid="mfa-verify-panel">
                  <h3>Enter verification code</h3>
                  <p className="lede">Enter the 6-digit code from your authenticator app.</p>
                  <label>
                    Verification code
                    <input
                      aria-label="Verification code"
                      placeholder="123456"
                      value={code}
                      onChange={(e) => setCode(e.target.value)}
                      inputMode="numeric"
                      autoComplete="one-time-code"
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
                        setChallengeId(null);
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
              {!enrollData ? (
                <button
                  type="button"
                  className="button button-primary"
                  disabled={busy === "enroll"}
                  onClick={() => void handleEnroll()}
                >
                  {busy === "enroll" ? "Enrolling…" : "Enroll authenticator"}
                </button>
              ) : (
                <div className="panel" style={{ marginTop: 12, padding: 12 }} data-testid="mfa-enroll-panel">
                  <h3>Scan QR code</h3>
                  <p className="lede">Scan this QR code in your authenticator app, or enter the secret manually.</p>
                  {enrollData.totp.qr_code && (
                    // Supabase returns qr_code as data:image/svg+xml;utf-8,...
                    // eslint-disable-next-line @next/next/no-img-element
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
                      onChange={(e) => setCode(e.target.value)}
                      inputMode="numeric"
                      autoComplete="one-time-code"
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
                        setChallengeId(null);
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

          {primaryFactor && !hasVerified && !enrollData && (
            <p style={{ marginTop: 12 }}>
              <small>Unverified factor {primaryFactor.id.slice(0, 8)}… — complete verification to activate.</small>
            </p>
          )}
        </>
      )}
    </section>
  );
}
