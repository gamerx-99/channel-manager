import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { authClient } from "@/lib/auth-client";
import { trpc } from "@/lib/trpc";
import { rememberLinkAfterSignIn, takeEmailToken } from "@/lib/realEmailGate";

export type AddRealEmailError = "sendFailed" | "linkExpired" | "wrongAccount" | "taken";

/** Which message a failed confirmation shows. */
export function confirmErrorFor(code: string | undefined): AddRealEmailError {
  if (code === "FORBIDDEN") return "wrongAccount";
  if (code === "CONFLICT") return "taken";
  return "linkExpired";
}

/**
 * The add-email screen (owner decisions, 2026-11-11 and 2026-11-12). A Facebook sign-in brings its email: a free
 * address is used at once; an address that already has an account asks whether to sign in to that account, which
 * then gets Facebook linked. Otherwise the person types an email and confirms it through a link.
 */
export function useAddRealEmail() {
  const [email, setEmail] = useState("");
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [error, setError] = useState<AddRealEmailError | null>(null);
  const [leaving, setLeaving] = useState(false);

  const match = trpc.auth.socialEmailMatch.useQuery(undefined, { retry: false, refetchOnWindowFocus: false });
  const useFacebookEmail = trpc.auth.useSocialEmail.useMutation({
    // A full reload, so the session and every screen show the new email.
    onSuccess: () => window.location.assign("/dashboard"),
  });
  const discard = trpc.auth.discardSocialSignup.useMutation();

  const request = trpc.auth.addRealEmail.useMutation({
    onSuccess: (_result, variables) => {
      setSentTo(variables.email.trim().toLowerCase());
      setError(null);
    },
    onError: () => setError("sendFailed"),
  });
  const confirm = trpc.auth.confirmRealEmail.useMutation({
    onSuccess: () => window.location.assign("/dashboard"),
    onError: failure => setError(confirmErrorFor(failure.data?.code)),
  });

  const confirmMutate = confirm.mutate;
  useEffect(() => {
    const token = takeEmailToken();
    if (token) confirmMutate({ token });
  }, [confirmMutate]);

  // A free Facebook email is taken once, without asking.
  const usedFacebookEmail = useRef(false);
  const useFacebookEmailMutate = useFacebookEmail.mutate;
  useEffect(() => {
    if (match.data?.kind === "free" && !usedFacebookEmail.current) {
      usedFacebookEmail.current = true;
      useFacebookEmailMutate();
    }
  }, [match.data, useFacebookEmailMutate]);

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

  /** Removes the just-made account, then goes to sign-in; with `link`, Facebook is linked once signed in. */
  const leaveForExistingAccount = useCallback(async (link: boolean) => {
    setLeaving(true);
    try {
      await discard.mutateAsync();
      if (link) rememberLinkAfterSignIn("facebook");
    } finally {
      try { await authClient.signOut(); } catch { /* the session went with the account */ }
      window.location.assign(link ? "/login?link=facebook" : "/login");
    }
  }, [discard]);

  const existing = match.data?.kind === "taken" ? match.data : null;

  return {
    email,
    setEmail,
    sentTo,
    error,
    sending: request.isPending,
    confirming: confirm.isPending || useFacebookEmail.isPending || match.data?.kind === "free",
    checkingFacebook: match.isLoading,
    existing,
    leaving,
    acceptExisting: () => void leaveForExistingAccount(true),
    declineExisting: () => void leaveForExistingAccount(false),
    submit,
    resend,
    changeEmail,
    signOut,
  };
}
