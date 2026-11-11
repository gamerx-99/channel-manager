import { useCallback, useEffect, useRef, useState } from "react";
import { authClient } from "@/lib/auth-client";
import { trpc } from "@/lib/trpc";

/** A few pixels of slack, so a fractional scroll position still counts as the end. */
const BOTTOM_TOLERANCE_PX = 8;

/** A box that has not been laid out yet (no height) never counts as read. */
export function reachedBottom(box: { scrollTop: number; clientHeight: number; scrollHeight: number }) {
  if (box.scrollHeight <= 0 || box.clientHeight <= 0) return false;
  return box.scrollTop + box.clientHeight >= box.scrollHeight - BOTTOM_TOLERANCE_PX;
}

/**
 * The owner terms screen (owner decision, 2026-11-11): "accept" unlocks only once the terms have been scrolled
 * to the end; "decline" signs out and goes back to the home page, because the app cannot be used without accepting.
 */
export function useOwnerTerms() {
  const utils = trpc.useUtils();
  const boxRef = useRef<HTMLDivElement | null>(null);
  const [readToEnd, setReadToEnd] = useState(false);
  const [failed, setFailed] = useState(false);
  const accept = trpc.auth.acceptTerms.useMutation({
    onSuccess: async () => {
      setFailed(false);
      await utils.auth.me.invalidate();
    },
    onError: () => setFailed(true),
  });

  // A short document that fits without scrolling is read as soon as it is shown.
  useEffect(() => {
    const box = boxRef.current;
    if (box && reachedBottom(box)) setReadToEnd(true);
  }, []);

  const onScroll = useCallback(() => {
    const box = boxRef.current;
    if (box && reachedBottom(box)) setReadToEnd(true);
  }, []);

  const decline = useCallback(async () => {
    try {
      await authClient.signOut();
    } finally {
      window.location.assign("/");
    }
  }, []);

  return {
    boxRef,
    onScroll,
    readToEnd,
    accept: () => accept.mutate(),
    accepting: accept.isPending,
    failed,
    decline,
  };
}
