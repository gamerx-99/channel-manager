type MeForTerms = {
  memberships?: ReadonlyArray<{ role?: string | null }> | null;
  termsAcceptedAt?: string | Date | null;
} | null | undefined;

/** A signed-in hotel owner who has not accepted the platform terms sees the terms screen instead of the app. Other roles are not asked. */
export function mustAcceptOwnerTerms(me: MeForTerms): boolean {
  if (!me) return false;
  const isOwner = (me.memberships ?? []).some(membership => membership.role === "hotel_owner");
  return isOwner && !me.termsAcceptedAt;
}
