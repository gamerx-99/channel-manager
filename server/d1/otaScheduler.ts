import { and, eq, isNotNull, ne } from "drizzle-orm";
import { otaConnections } from "../../drizzle/d1-schema";
import { createD1SystemCallerContext, isD1SystemCallerContext, type D1ScopedDatabase, type D1SystemCallerContext } from "../db/scope";
import { ICAL_FETCH_ERROR } from "./icalUrl";
import { fetchAndSyncOtaConnection, type OtaIcalSyncResult } from "./ota";

export type ScheduledOtaSyncSummary = {
  total: number;
  succeeded: number;
  failed: number;
  conflicts: number;
  failures: Array<{ connectionId: string; provider: string; error: string }>;
};

type SyncConnection = (
  db: D1ScopedDatabase,
  caller: D1SystemCallerContext,
  connectionId: string,
  fetchImpl: typeof fetch,
) => Promise<OtaIcalSyncResult>;

/** Process all configured connections sequentially with server-created system authority. */
export async function runScheduledD1OtaSync(
  db: D1ScopedDatabase,
  dependencies: { fetchImpl?: typeof fetch; syncConnection?: SyncConnection } = {},
): Promise<ScheduledOtaSyncSummary> {
  const connections = await db.select({ id: otaConnections.id, provider: otaConnections.provider })
    .from(otaConnections).where(and(isNotNull(otaConnections.icalImportUrl), ne(otaConnections.status, "disconnected")));
  const summary: ScheduledOtaSyncSummary = { total: connections.length, succeeded: 0, failed: 0, conflicts: 0, failures: [] };
  const systemCaller = createD1SystemCallerContext();
  if (!isD1SystemCallerContext(systemCaller)) throw new Error("System caller creation failed.");
  const syncConnection = dependencies.syncConnection ?? fetchAndSyncOtaConnection;
  const fetchImpl = dependencies.fetchImpl ?? fetch;
  for (const connection of connections) {
    try {
      const result = await syncConnection(db, systemCaller, connection.id, fetchImpl);
      summary.succeeded += 1;
      summary.conflicts += result.conflicts.length;
    } catch {
      summary.failed += 1;
      summary.failures.push({ connectionId: connection.id, provider: connection.provider, error: ICAL_FETCH_ERROR });
    }
  }
  return summary;
}
