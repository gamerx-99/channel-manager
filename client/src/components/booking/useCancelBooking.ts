import { FormEvent, useState } from "react";
import { trpc } from "@/lib/trpc";
import { isCancelReasonValid } from "./cancelBooking";

/** The cancel dialog: a required reason, then channelManager.cancelBooking; the room goes back on sale. */
export function useCancelBooking(hotelId: string, bookingId: string, onDone: () => void) {
  const utils = trpc.useUtils();
  const [reason, setReason] = useState("");
  const [error, setError] = useState<"failed" | "statusChanged" | null>(null);
  const cancel = trpc.channelManager.cancelBooking.useMutation({
    onSuccess: async () => {
      setError(null);
      await Promise.all([
        utils.channelManager.bookings.invalidate(hotelId),
        utils.channelManager.dashboard.invalidate(),
        utils.channelManager.bookingOccupancy.invalidate(),
      ]);
      onDone();
    },
    onError: failure => setError(failure.data?.code === "CONFLICT" || failure.data?.code === "PRECONDITION_FAILED" ? "statusChanged" : "failed"),
  });
  const valid = isCancelReasonValid(reason);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!valid || cancel.isPending) return;
    setError(null);
    cancel.mutate({ hotel_id: hotelId, booking_id: bookingId, reason: reason.trim() });
  };

  return { reason, setReason, valid, submit, cancelling: cancel.isPending, error };
}
