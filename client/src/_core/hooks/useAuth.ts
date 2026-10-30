import { authClient } from "@/lib/auth-client";
import { useCallback, useEffect, useMemo, useState } from "react";

export type UseAuthOptions = {
  redirectOnUnauthenticated?: boolean;
  redirectPath?: string;
};

export type AppUser = {
  id: string;
  email: string | null;
  name: string | null;
  twoFactorEnabled?: boolean;
};

export type LogoutResult = {
  error: Error | null;
  clearUser: boolean;
};

/**
 * Revokes the current session via Better Auth client.
 */
export async function signOutCurrentSession(): Promise<LogoutResult> {
  try {
    const res = await authClient.signOut();
    if (res?.error) {
      const err = res.error instanceof Error
        ? res.error
        : new Error((res.error as { message?: string }).message || "Failed to sign out");
      return {
        error: err,
        clearUser: false,
      };
    }
    return { error: null, clearUser: true };
  } catch (error) {
    return {
      error: error instanceof Error ? error : new Error(String(error)),
      clearUser: false,
    };
  }
}



function toAppUser(user: {
  id: string;
  email?: string | null;
  name?: string | null;
  twoFactorEnabled?: boolean | null;
}): AppUser {
  return {
    id: user.id,
    email: user.email ?? null,
    name: user.name ?? user.email ?? null,
    twoFactorEnabled: Boolean(user.twoFactorEnabled),
  };
}

export function useAuth(options?: UseAuthOptions) {
  const { redirectOnUnauthenticated = false, redirectPath = "/login" } = options ?? {};
  const { data: sessionData, isPending, error: sessionError, refetch } = authClient.useSession();
  const [logoutError, setLogoutError] = useState<Error | null>(null);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const user: AppUser | null = useMemo(() => {
    if (!sessionData?.user) return null;
    return toAppUser(sessionData.user);
  }, [sessionData]);

  const loading = isPending || isLoggingOut;

  const error: Error | null = useMemo(() => {
    if (logoutError) return logoutError;
    if (sessionError) return new Error(sessionError.message || "Session error");
    return null;
  }, [logoutError, sessionError]);

  const refresh = useCallback(async () => {
    try {
      await refetch();
    } catch {
      // Session query state is updated automatically
    }
  }, [refetch]);

  const logout = useCallback(async () => {
    setIsLoggingOut(true);
    setLogoutError(null);
    try {
      const result = await signOutCurrentSession();
      if (result.error) {
        setLogoutError(result.error);
      }
      await refetch();
    } finally {
      setIsLoggingOut(false);
    }
  }, [refetch]);

  useEffect(() => {
    if (!redirectOnUnauthenticated || loading || user || typeof window === "undefined") return;
    if (window.location.pathname !== redirectPath) window.location.assign(redirectPath);
  }, [loading, redirectOnUnauthenticated, redirectPath, user]);

  return useMemo(
    () => ({
      user,
      loading,
      error,
      isAuthenticated: Boolean(user),
      refresh,
      logout,
    }),
    [user, loading, error, refresh, logout],
  );
}
