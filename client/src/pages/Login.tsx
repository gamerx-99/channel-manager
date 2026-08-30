import React from 'react';
import { ArrowRight, LockKeyhole, ShieldCheck } from 'lucide-react';
import { FormEvent, useState } from 'react';
import { useLocation } from 'wouter';
import { supabase } from '@/lib/supabase';
import { hasVerifiedTotpFactor, MFA_ENROLL_PATH, shouldEnforceMfaForRoles } from '@/lib/mfa';

export default function Login() {
  const [, navigate] = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    if (signInError) {
      setSubmitting(false);
      setError(signInError.message);
      return;
    }

    // T09-04: blocking MFA enrollment for platform roles (super_admin/admin).
    // After password verification, check if the user has a verified TOTP factor;
    // if missing and the user is a platform role, redirect to the enroll flow.
    try {
      const { data: factorData } = await supabase.auth.mfa.listFactors();
      const hasFactor = hasVerifiedTotpFactor(factorData as unknown as { totp?: Array<{ status: string }>; all?: Array<{ factor_type: string; status: string }> } | null);
      if (!hasFactor) {
        let roles: string[] = [];
        try {
          const { data: userData } = await supabase.auth.getUser();
          const userId = userData?.user?.id;
          const metaRole =
            (userData?.user?.app_metadata as Record<string, unknown> | undefined)?.role ??
            (userData?.user?.user_metadata as Record<string, unknown> | undefined)?.role;
          if (typeof metaRole === "string" && metaRole) roles.push(metaRole);
          if (userId) {
            try {
              const { data: memberships } = await (supabase.from as unknown as (table: string) => { select: (cols: string) => { eq: (col: string, val: string) => Promise<{ data: Array<{ role: string }> | null }> } })("hotel_users").select("role").eq("user_id", userId);
              if (memberships) {
                for (const row of memberships) {
                  if (row.role && !roles.includes(row.role)) roles.push(row.role);
                }
              }
            } catch {
              // ignore membership fetch errors — fall back to metadata role
            }
            try {
              const { data: isSuperAdmin } = await (supabase.rpc as unknown as (fn: string) => Promise<{ data: unknown }>)("is_super_admin");
              if (isSuperAdmin === true && !roles.includes("super_admin")) roles.push("super_admin");
            } catch {
              // ignore RPC errors
            }
          }
        } catch {
          // ignore role resolution errors — allow navigation to dashboard
        }
        if (shouldEnforceMfaForRoles(roles)) {
          setSubmitting(false);
          navigate(MFA_ENROLL_PATH);
          return;
        }
      }
    } catch {
      // Ignore MFA check errors — allow navigation to dashboard rather than blocking login entirely
    }

    setSubmitting(false);
    navigate('/dashboard');
  }

  return <div className="login-page"><div className="login-aside"><div className="login-brand"><span className="brand-mark"><span /></span><strong>channel<em>manager</em></strong></div><div className="login-aside-copy"><div className="eyebrow">Hotel operations / Central console</div><h1>Keep every stay<br /><i>in good order.</i></h1><p>A focused workspace for hotel owners and the people who support them.</p></div><div className="login-aside-foot"><span>Private hotel operations</span><span className="signal-text"><i /> Secure workspace</span></div></div><main className="login-main"><form className="login-card" onSubmit={handleSubmit}><div className="eyebrow">Secure sign in</div><h2>Welcome back</h2><p>Sign in with your Supabase account to access your hotel workspace.</p><label>Email address<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required /></label><label>Password<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" required /></label>{error ? <p className="form-error" role="alert">{error}</p> : null}<button className="button button-primary login-button" type="submit" disabled={submitting}>{submitting ? 'Signing in…' : 'Continue'} <ArrowRight size={16} /></button><div className="login-security"><ShieldCheck size={15} /><span>Your hotel data is scoped by Supabase Row Level Security.</span></div></form><div className="login-footer"><span><LockKeyhole size={13} /> Private workspace</span><span>Need help? Contact support</span></div></main></div>;
}
