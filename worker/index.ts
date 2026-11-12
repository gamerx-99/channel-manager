import { createWorkerApp } from "./app";
import { drizzle } from "drizzle-orm/d1";
import type { ExportedHandler } from "@cloudflare/workers-types/index.ts";
import { d1Schema } from "../drizzle/d1-schema";
import type { D1ScopedDatabase } from "../server/db/scope";
import { purgeClosedHotels } from "../server/d1/hotelClosure";
import { runScheduledD1OtaSync } from "../server/d1/otaScheduler";
import { expireOutstandingBookingRequests } from "../server/d1/bookingExpiry";
import type { WorkerEnv } from "./app";
import { runSlipOkHealthChecks } from "../server/d1/slipokHealth";
import { createEmailSender } from "../server/email";

const app = createWorkerApp();

export const handleScheduledOtaSync = (env: Pick<WorkerEnv, "DB">, fetchImpl: typeof fetch = fetch) => {
  const db = drizzle(env.DB, { schema: d1Schema }) as unknown as D1ScopedDatabase;
  return runScheduledD1OtaSync(db, { fetchImpl });
};

export const handleScheduledHotelPurge = (env: Pick<WorkerEnv, "DB" | "MEDIA">) =>
  purgeClosedHotels(drizzle(env.DB, { schema: d1Schema }) as unknown as D1ScopedDatabase, env.MEDIA);

export const handleScheduledBookingExpiry = (env: Pick<WorkerEnv, "DB">) =>
  expireOutstandingBookingRequests(drizzle(env.DB, { schema: d1Schema }) as unknown as D1ScopedDatabase);

/** Each hotel's SlipOK account is checked about once a day; the cron runs every 15 minutes and skips recent checks. */
export const handleScheduledSlipOkHealth = (env: Pick<WorkerEnv, "DB" | "SLIPOK_ENCRYPTION_KEY" | "RESEND_API_KEY" | "EMAIL_FROM">) =>
  runSlipOkHealthChecks(
    drizzle(env.DB, { schema: d1Schema }) as unknown as D1ScopedDatabase,
    env,
    env.RESEND_API_KEY ? createEmailSender({ RESEND_API_KEY: env.RESEND_API_KEY, EMAIL_FROM: env.EMAIL_FROM }) : undefined,
  );

const worker: ExportedHandler<WorkerEnv> = {
  fetch: app.fetch as unknown as NonNullable<ExportedHandler<WorkerEnv>["fetch"]>,
  scheduled(_controller, env, ctx) {
    ctx.waitUntil(handleScheduledHotelPurge(env));
    ctx.waitUntil(handleScheduledBookingExpiry(env));
    ctx.waitUntil(handleScheduledSlipOkHealth(env));
  },
};

export default worker;
