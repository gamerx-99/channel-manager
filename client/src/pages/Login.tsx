import { ArrowRight, LockKeyhole, ShieldCheck } from 'lucide-react';
import { FormEvent, useState } from 'react';
import { useLocation } from 'wouter';
import { supabase } from '@/lib/supabase';

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
    setSubmitting(false);
    if (signInError) {
      setError(signInError.message);
      return;
    }
    navigate('/dashboard');
  }

  return <div className="login-page"><div className="login-aside"><div className="login-brand"><span className="brand-mark"><span /></span><strong>channel<em>manager</em></strong></div><div className="login-aside-copy"><div className="eyebrow">Hotel operations / Central console</div><h1>Keep every stay<br /><i>in good order.</i></h1><p>A focused workspace for hotel owners and the people who support them.</p></div><div className="login-aside-foot"><span>Private hotel operations</span><span className="signal-text"><i /> Secure workspace</span></div></div><main className="login-main"><form className="login-card" onSubmit={handleSubmit}><div className="eyebrow">Secure sign in</div><h2>Welcome back</h2><p>Sign in with your Supabase account to access your hotel workspace.</p><label>Email address<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required /></label><label>Password<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" required /></label>{error ? <p className="form-error" role="alert">{error}</p> : null}<button className="button button-primary login-button" type="submit" disabled={submitting}>{submitting ? 'Signing in…' : 'Continue'} <ArrowRight size={16} /></button><div className="login-security"><ShieldCheck size={15} /><span>Your hotel data is scoped by Supabase Row Level Security.</span></div></form><div className="login-footer"><span><LockKeyhole size={13} /> Private workspace</span><span>Need help? Contact support</span></div></main></div>;
}
