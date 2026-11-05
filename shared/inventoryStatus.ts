export type InventoryStatus = "healthy" | "low" | "closed";

/**
 * Availability colour of one day, used by the dashboard calendar (server) and the
 * availability calendar (client) so the two never disagree.
 *
 * - closed: nothing left to sell.
 * - low: some rooms are taken and what is left is a quarter of the rooms or less (at least one room).
 * - healthy: everything else, including a day where every room is free. A one-room property with
 *   its room free (1/1) is fully available, not "running low".
 */
export function inventoryStatus(available: number, totalRooms: number): InventoryStatus {
  if (available <= 0) return "closed";
  if (available < totalRooms && available <= Math.max(1, Math.ceil(totalRooms * 0.25))) return "low";
  return "healthy";
}
