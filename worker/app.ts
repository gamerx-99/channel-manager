import { Hono } from "hono";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import type { D1Database, Fetcher, R2Bucket } from "@cloudflare/workers-types/index.ts";
import { appRouter } from "../server/routers";
import { createContextFromRequest } from "../server/_core/context";
import { buildIcalExport } from "../server/icalFeed";
import { loadIcalExport } from "../server/otaIcalRoutes";

/** Runtime bindings declared in wrangler.toml. */
export type WorkerEnv = {
  ASSETS: Fetcher;
  DB: D1Database;
  MEDIA: R2Bucket;
};

export function createWorkerApp() {
  const app = new Hono<{ Bindings: WorkerEnv }>();

  app.all("/api/trpc/*", c =>
    fetchRequestHandler({
      endpoint: "/api/trpc",
      req: c.req.raw,
      router: appRouter,
      createContext: () =>
        createContextFromRequest(c.req.header("authorization"), c.req.header("cf-connecting-ip")),
    })
  );

  // Public: OTAs poll this URL; the token is the only credential. Mirrors handleIcalExport.
  app.get("/api/ical/:file", async c => {
    const token = c.req.param("file").replace(/\.ics$/i, "").toLowerCase();
    try {
      const exportData = await loadIcalExport(token);
      if (!exportData) return c.text("Calendar not found.", 404);
      return c.body(buildIcalExport({ calendarName: exportData.calendarName, events: exportData.events }), 200, {
        "Content-Type": "text/calendar; charset=utf-8",
        "Cache-Control": "no-cache, max-age=0",
      });
    } catch (error) {
      console.error("[OTA iCal export] failed:", error instanceof Error ? error.message : error);
      return c.text("Calendar is temporarily unavailable.", 500);
    }
  });

  // Everything outside /api/* is served by Workers Static Assets (see wrangler.toml).
  app.all("/api/*", c => c.json({ error: "Not found" }, 404));

  return app;
}
