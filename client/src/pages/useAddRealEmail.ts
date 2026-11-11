import { FormEvent, useCallback, useEffect, useState } from "react";
import { authClient } from "@/lib/auth-client";
import { trpc } from "@/lib/trpc";
import { takeEmailToken } from "@/lib/realEmailGate";

export type AddRealEmailError = "sendFailed" | "linkExpired" | "wrongAccount" | "taken";

/** Which message a failed confirmation shows. */
export function confirmErrorFor(code: string | undefined): AddRealEmailError {
  if (code === "FORBIDDEN") return "wrongAccount";
  if (code === "CONFLICT") return "taken";
  return "linkExpired";
}

/**
 * The add-email screen (owner decision, 2026-11-11). Sending only emails a link; the email is set when this same
 * account opens it. A link opened before signing in was kept by /confirm-email and is used here once.
 */
export function useAddRealEmail() {
  const [email, setEmail] = useState("");
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [error, setError] = useState<AddRealEmailError | null>(null);

  const request = trpc.auth.addRealEmail.useMutation({
    onSuccess: (_result, variables) => {
      setSentTo(variables.email.trim().toLowerCase());
      setError(null);
    },
    onError: () => setError("sendFailed"),
  });
  const confirm = trpc.auth.confirmRealEmail.useMutation({
    // A full reload, so the session and every screen show the new email.
    onSuccess: () => window.location.assign("/dashboard"),
    onError: failure => setError(confirmErrorFor(failure.data?.code)),
  });

  const confirmMutate = confirm.mutate;
  useEffect(() => {
    const token = takeEmailToken();
    if (token) confirmMutate({ token });
  }, [confirmMutate]);

  const submit = useCallback((event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    request.mutate({ email: email.trim() });
  }, [email, request]);

  const resend = useCallback(() => {
    if (!sentTo) return;
    setError(null);
    request.mutate({ email: sentTo });
  }, [request, sentTo]);

  const changeEmail = useCallback(() => {
    setSentTo(null);
    setError(null);
  }, []);

  const signOut = useCallback(async () => {
    try {
      await authClient.signOut();
    } finally {
      window.location.assign("/");
    }
  }, []);

  return {
    email,
    setEmail,
    sentTo,
    error,
    sending: request.isPending,
    confirming: confirm.isPending,
    submit,
    resend,
    changeEmail,
    signOut,
  };
}
