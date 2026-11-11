/** How many rooms of one room type the plan holds back (Free plan: rooms after the first three of the hotel). */
export function roomTypePlanLimit(roomIdsOfType: readonly string[], cappedRoomIds: readonly string[] | undefined) {
  const capped = new Set(cappedRoomIds ?? []);
  const heldBack = roomIdsOfType.filter(id => capped.has(id)).length;
  return {
    heldBack,
    sellable: roomIdsOfType.length - heldBack,
    total: roomIdsOfType.length,
    /** Every room of the type is held back: the whole row is shown greyed out. */
    allHeldBack: roomIdsOfType.length > 0 && heldBack === roomIdsOfType.length,
  };
}
