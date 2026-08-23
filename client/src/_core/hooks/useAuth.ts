import { supabase } from '@/lib/supabase';
import { useCallback, useEffect, useMemo, useState } from 'react';

type UseAuthOptions = {
  redirectOnUnauthenticated?: boolean;
  redirectPath?: string;
};

type AppUser = {
  id: string;
  email: string | null;
  name: string | null;
};

export type SupabaseLogoutResult = {
  error: Error | null;
  clearUser: boolean;
};

/** Runs the browser-owned session revocation that Supabase Auth requires. */
export async function signOutCurrentSupabaseSession(): Promise<SupabaseLogoutResult> {
  const { error } = await supabase.auth.signOut();
  return { error: error ?? null, clearUser: !error };
}

function toAppUser(user: { id: string; email?: string; user_metadata?: Record<string, unknown> }): AppUser {
  const fullName = user.user_metadata?.full_name;
  const name = user.user_metadata?.name;
  return {
    id: user.id,
    email: user.email ?? null,
    name: typeof fullName === 'string' ? fullName : typeof name === 'string' ? name : user.email ?? null,
  };
}

export function useAuth(options?: UseAuthOptions) {
  const { redirectOnUnauthenticated = false, redirectPath = '/login' } = options ?? {};
  const [user, setUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    const { data, error: sessionError } = await supabase.auth.getSession();
    setError(sessionError ?? null);
    setUser(data.session?.user ? toAppUser(data.session.user) : null);
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ? toAppUser(session.user) : null);
      setLoading(false);
    });
    return () => subscription.subscription.unsubscribe();
  }, [refresh]);

  const logout = useCallback(async () => {
    setLoading(true);
    const logoutResult = await signOutCurrentSupabaseSession();
    setError(logoutResult.error);
    if (logoutResult.clearUser) setUser(null);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!redirectOnUnauthenticated || loading || user || typeof window === 'undefined') return;
    if (window.location.pathname !== redirectPath) window.location.assign(redirectPath);
  }, [loading, redirectOnUnauthenticated, redirectPath, user]);

  return useMemo(
    () => ({ user, loading, error, isAuthenticated: Boolean(user), refresh, logout }),
    [error, loading, refresh, logout, user],
  );
}
