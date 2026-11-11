import { createAuthClient } from "better-auth/react";
import { inferAdditionalFields, twoFactorClient } from "better-auth/client/plugins";
import { passkeyClient } from "@better-auth/passkey/client";

export const authClient = createAuthClient({
  baseURL: typeof window !== "undefined" ? window.location.origin : "http://localhost:3000",
  plugins: [twoFactorClient(), passkeyClient(), inferAdditionalFields({ user: {
    firstName: { type: "string", required: false },
    lastName: { type: "string", required: false },
    phone: { type: "string", required: false },
  } })],
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
