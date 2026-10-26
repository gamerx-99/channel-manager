import { ArrowRight, LockKeyhole, ShieldCheck } from "lucide-react";
import { FormEvent, useState } from "react";
import { useLocation } from "wouter";
import { supabase } from "@/lib/supabase";
import { trpc } from "@/lib/trpc";
import { PageState } from "@/components/PageState";

type HotelOwnerSignupProps = { token: string };

export default function HotelOwnerSignup({ token }: HotelOwnerSignupProps) {
  const [, navigate] = useLocation();
  const validation = trpc.channelManager.validateSignupLink.useQuery({ token });
  const completeSignup = trpc.channelManager.completeHotelOwnerSignup.useMutation();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [pendingEmailConfirmation, setPendingEmailConfirmation] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError("Choose a password with at least 8 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    setSubmitting(true);
    const { data, error: signUpError } = await supabase.auth.signUp({ email, password });
    if (signUpError || !data.user) {
      setSubmitting(false);
      setError(signUpError?.message ?? "Could not create your account.");
      return;
    }
    try {
      await completeSignup.mutateAsync({ token });
    } catch (mutationError) {
      setSubmitting(false);
      setError(mutationError instanceof Error ? mutationError.message : "Could not finish setting up your hotel account.");
      return;
    }
    setSubmitting(false);
    if (data.session) {
      navigate("/dashboard");
    } else {
      setPendingEmailConfirmation(true);
    }
  }

  if (validation.isLoading) {
    return <div className="login-page"><main className="login-main"><PageState tone="loading" title="Checking your signup link…" /></main></div>;
  }

  if (!validation.data?.valid) {
    return (
      <div className="login-page">
        <main className="login-main">
          <PageState
            tone="error"
            title="This signup link is no longer valid"
            description="It may have expired or already been used. Ask the platform administrator for a new one."
          />
        </main>
      </div>
    );
  }

  if (pendingEmailConfirmation) {
    return (
      <div className="login-page">
        <main className="login-main">
          <PageState
            tone="empty"
            title="Check your email to confirm your account"
            description={`We sent a confirmation link to ${email}. Once confirmed, sign in to access ${validation.data.hotelName}.`}
          />
        </main>
      </div>
    );
  }

  return (
    <div className="login-page">
      <div className="login-aside">
        <div className="login-brand"><span className="brand-mark"><span /></span><strong>hay<em>host</em></strong></div>
        <div className="login-aside-copy">
          <div className="eyebrow">Hotel operations / Central console</div>
          <h1>Set up<br /><i>{validation.data.hotelName}.</i></h1>
          <p>Create your login to start managing this property.</p>
        </div>
        <div className="login-aside-foot"><span>Private hotel operations</span><span className="signal-text"><i /> Secure workspace</span></div>
      </div>
      <main className="login-main">
        <form className="login-card" onSubmit={handleSubmit}>
          <div className="eyebrow">Hotel admin signup</div>
          <h2>Create your account</h2>
          <p>You are creating the Hotel Admin login for <strong>{validation.data.hotelName}</strong>.</p>
          <label>Email address<input type="email" value={email} onChange={event => setEmail(event.target.value)} autoComplete="email" required /></label>
          <label>Password<input type="password" value={password} onChange={event => setPassword(event.target.value)} autoComplete="new-password" minLength={8} required /></label>
          <label>Confirm password<input type="password" value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)} autoComplete="new-password" minLength={8} required /></label>
          {error ? <p className="form-error" role="alert">{error}</p> : null}
          <button className="button button-primary login-button" type="submit" disabled={submitting}>
            {submitting ? "Creating account…" : "Create account"} <ArrowRight size={16} />
          </button>
          <div className="login-security"><ShieldCheck size={15} /><span>Your hotel data is scoped by Supabase Row Level Security.</span></div>
        </form>
        <div className="login-footer"><span><LockKeyhole size={13} /> Private workspace</span><span>Need help? Contact support</span></div>
      </main>
    </div>
  );
}
