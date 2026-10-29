import { createAuthClient } from "better-auth/react";
import { twoFactorClient } from "better-auth/client/plugins";

export const authClient = createAuthClient({
  baseURL: typeof window !== "undefined" ? window.location.origin : "http://localhost:3000",
  plugins: [twoFactorClient()],
});

export const {
  signIn,
  signOut,
  signUp,
  useSession,
  getSession,
  twoFactor,
} = authClient;

export default authClient;
