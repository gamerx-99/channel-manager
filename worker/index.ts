import { createWorkerApp } from "./app";
import { drizzle } from "drizzle-orm/d1";
import type { ExportedHandler } from "@cloudflare/workers-types/index.ts";
import { d1Schema } from "../drizzle/d1-schema";
import type { D1ScopedDatabase } from "../server/db/scope";
import { runScheduledD1OtaSync } from "../server/d1/otaScheduler";
import type { WorkerEnv } from "./app";

const app = createWorkerApp();

export const handleScheduledOtaSync = (env: Pick<WorkerEnv, "DB">, fetchImpl: typeof fetch = fetch) => {
  const db = drizzle(env.DB, { schema: d1Schema }) as unknown as D1ScopedDatabase;
  return runScheduledD1OtaSync(db, { fetchImpl });
};

const worker: ExportedHandler<WorkerEnv> = {
  fetch: app.fetch as unknown as NonNullable<ExportedHandler<WorkerEnv>["fetch"]>,
  scheduled(_controller, env, ctx) {
    ctx.waitUntil(handleScheduledOtaSync(env));
  },
};

export default worker;
