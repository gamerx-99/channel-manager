import { trpc } from "@/lib/trpc";

/** Fails closed until the server explicitly reports the candidate enabled. */
export function useBillingCandidateEnabled() {
  const query = trpc.system.billingCandidateEnabled.useQuery(undefined, {
    staleTime: 60_000,
    retry: false,
  });
  return { enabled: query.data === true, ready: query.isSuccess };
}
