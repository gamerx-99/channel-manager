import { Hono } from "hono";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import type { D1Database, Fetcher, R2Bucket } from "@cloudflare/workers-types/index.ts";
import { TRPCError } from "@trpc/server";
import { drizzle } from "drizzle-orm/d1";
import { appRouter } from "../server/routers";
import { createContextFromRequest } from "../server/_core/context";
import type { D1CallerContext, D1ScopedDatabase } from "../server/db/scope";
import { authorizeHotelAction } from "../server/db/scope";
import { d1Schema, hotels } from "../drizzle/d1-schema";
import { eq } from "drizzle-orm";
import {
  deleteHotelMediaFromR2,
  MAX_HOTEL_MEDIA_BYTES,
  uploadHotelMediaToR2,
  validateHotelMediaObjectKey,
  validateHotelMediaUpload,
} from "../server/d1/media";
import { getOtaIcalExport } from "../server/d1/ota";
import { createD1SystemCallerContext } from "../server/db/scope";
import { createAuth, type AuthInstance } from "../server/auth";

/** Runtime bindings declared in wrangler.toml. */
export type WorkerEnv = {
  ASSETS: Fetcher;
  DB: D1Database;
  MEDIA: R2Bucket;
};

type WorkerAppDependencies = {
  createContext?: typeof createContextFromRequest;
  createDatabase?: (binding?: D1Database) => D1ScopedDatabase | undefined;
  createAuthInstance?: (binding: D1Database, baseURL?: string) => AuthInstance;
};

const MAX_UPLOAD_REQUEST_BYTES = 7 * 1024 * 1024;

const MEDIA_CONTENT_TYPES: Record<string, string> = {
  jpg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
  avif: "image/avif",
};

function defaultDatabase(binding?: D1Database): D1ScopedDatabase | undefined {
  if (!binding) return undefined;
  return drizzle(binding, { schema: d1Schema }) as unknown as D1ScopedDatabase;
}

function httpStatus(error: unknown) {
  if (!(error instanceof TRPCError)) return 500;
  if (error.code === "UNAUTHORIZED") return 401;
  if (error.code === "FORBIDDEN") return 403;
  if (error.code === "NOT_FOUND") return 404;
  if (error.code === "BAD_REQUEST")
    return error.message.includes("MiB") || error.message.includes("too large") ? 413 : 400;
  return 500;
}

async function readBoundedJson(request: Request) {
  const contentLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > MAX_UPLOAD_REQUEST_BYTES)
    throw new TRPCError({ code: "BAD_REQUEST", message: "Upload request is too large." });
  if (!request.body) throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid image upload." });
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_UPLOAD_REQUEST_BYTES) {
        await reader.cancel().catch(() => undefined);
        throw new TRPCError({ code: "BAD_REQUEST", message: "Upload request is too large." });
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    const parsed: unknown = JSON.parse(new TextDecoder().decode(bytes));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
      throw new Error("invalid object");
    return parsed as Record<string, unknown>;
  } catch {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid image upload." });
  }
}

function decodeBase64(value: string) {
  try {
    const binary = atob(value);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return bytes;
  } catch {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid image data." });
  }
}

function mediaJson(media: {
  id: string;
  hotelId: string;
  url: string;
  caption: string | null;
  isHero: boolean;
  displayOrder: number;
  createdAt: Date;
}) {
  return {
    id: media.id,
    hotel_id: media.hotelId,
    url: media.url,
    caption: media.caption,
    is_hero: media.isHero,
    display_order: media.displayOrder,
    created_at: media.createdAt.toISOString(),
  };
}

export function createWorkerApp(dependencies: WorkerAppDependencies = {}) {
  const app = new Hono<{ Bindings: WorkerEnv }>();
  const createContext = dependencies.createContext ?? createContextFromRequest;
  const createDatabase = dependencies.createDatabase ?? defaultDatabase;
  const getAuth = dependencies.createAuthInstance ?? ((db, baseURL) => createAuth({ db, baseURL }));

  const requestContext = (
    req: Request,
    clientIp?: string,
    db?: D1ScopedDatabase,
    dbRaw?: D1Database,
  ) => {
    const origin = req.url && req.url.startsWith("http") ? new URL(req.url).origin : undefined;
    return createContext({
      req,
      clientIp,
      db,
      auth: dbRaw && origin ? getAuth(dbRaw, origin) : undefined,
    });
  };

  app.all("/api/trpc/*", async c => {
    const db = c.env?.DB ? createDatabase(c.env.DB) : undefined;
    return fetchRequestHandler({
      endpoint: "/api/trpc",
      req: c.req.raw,
      router: appRouter,
      createContext: () =>
        requestContext(
          c.req.raw,
          c.req.header("cf-connecting-ip") ?? c.req.header("x-forwarded-for"),
          db,
          c.env?.DB,
        ),
    });
  });

  app.post("/api/media/:hotelId", async c => {
    const db = c.env?.DB ? createDatabase(c.env.DB) : undefined;
    const context = await requestContext(
      c.req.raw,
      c.req.header("cf-connecting-ip") ?? c.req.header("x-forwarded-for"),
      db,
      c.env?.DB,
    );
    if (!context.user) return c.json({ error: "Authentication required." }, 401);
    if (!db) return c.json({ error: "Database unavailable." }, 500);

    const hotelId = c.req.param("hotelId");
    const caller: D1CallerContext = { userId: context.user.id };
    try {
      await authorizeHotelAction(db, caller, hotelId, "property.manage_profile", "hotel_media.upload");
      const input = await readBoundedJson(c.req.raw);
      const filename = typeof input.filename === "string" ? input.filename : "";
      const caption = typeof input.caption === "string" ? input.caption : null;
      const encoded = typeof input.base64 === "string" ? input.base64 : "";
      const dataUrl = encoded.match(/^data:([^;,]+);base64,([\s\S]*)$/);
      const contentType =
        dataUrl?.[1] ?? (typeof input.content_type === "string" ? input.content_type : "");
      const base64 = dataUrl?.[2] ?? encoded;
      if (!filename || filename.length > 255 || (caption !== null && caption.length > 1_000) || !base64) {
        return c.json({ error: "Invalid image upload." }, 400);
      }
      const data = decodeBase64(base64);
      if (data.byteLength > MAX_HOTEL_MEDIA_BYTES)
        return c.json({ error: "Images must be 5 MiB or smaller." }, 413);
      try {
        validateHotelMediaUpload(data, contentType, filename);
      } catch (error) {
        return c.json({ error: error instanceof Error ? error.message : "Invalid image upload." }, 400);
      }
      const media = await uploadHotelMediaToR2(db, caller, c.env.MEDIA, {
        hotel_id: hotelId,
        filename,
        content_type: contentType,
        data,
        caption,
      });
      return c.json(mediaJson(media), 201);
    } catch (error) {
      const status = httpStatus(error);
      const message =
        status === 500
          ? "Media upload failed."
          : error instanceof Error
            ? error.message
            : "Media upload failed.";
      return new Response(JSON.stringify({ error: message }), {
        status,
        headers: { "Content-Type": "application/json; charset=UTF-8" },
      });
    }
  });

  app.delete("/api/media/:hotelId/:mediaId", async c => {
    const db = c.env?.DB ? createDatabase(c.env.DB) : undefined;
    const context = await requestContext(
      c.req.raw,
      c.req.header("cf-connecting-ip") ?? c.req.header("x-forwarded-for"),
      db,
      c.env?.DB,
    );
    if (!context.user) return c.json({ error: "Authentication required." }, 401);
    if (!db) return c.json({ error: "Database unavailable." }, 500);

    try {
      const result = await deleteHotelMediaFromR2(
        db,
        { userId: context.user.id },
        c.env.MEDIA,
        c.req.param("hotelId"),
        c.req.param("mediaId"),
      );
      if (!result) return c.json({ error: "Hotel media not found." }, 404);
      return c.json(result);
    } catch (error) {
      const status = httpStatus(error);
      const message =
        status === 500
          ? "Media delete failed."
          : error instanceof Error
            ? error.message
            : "Media delete failed.";
      return new Response(JSON.stringify({ error: message }), {
        status,
        headers: { "Content-Type": "application/json; charset=UTF-8" },
      });
    }
  });

  app.get("/media/:hotelId/:file", async c => {
    const hotelId = c.req.param("hotelId");
    const file = c.req.param("file");
    const ext = file.split(".").pop()?.toLowerCase() ?? "";
    const contentType = MEDIA_CONTENT_TYPES[ext];
    if (!contentType) {
      return c.text("Not found.", 404);
    }
    let key: string;
    try {
      key = validateHotelMediaObjectKey(hotelId, `${hotelId}/${file}`);
    } catch {
      return c.text("Not found.", 404);
    }
    // Only serve media for published hotels (S6). Unpublished properties require an authenticated preview URL.
    try {
      const db = createDatabase(c.env.DB)!;
      const [hotel] = await db.select({ publicEnabled: hotels.publicEnabled }).from(hotels).where(eq(hotels.id, hotelId)).limit(1);
      if (!hotel?.publicEnabled) return c.text("Not found.", 404);
    } catch {
      return c.text("Not found.", 404);
    }
    try {
      const object = await c.env.MEDIA.get(key);
      if (!object) return c.text("Not found.", 404);
      // ASSUMPTION: the public hotel pages are served from our own site, so same-site is enough.
      const headers = new Headers({
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=31536000, immutable",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox",
        "Cross-Origin-Resource-Policy": "same-site",
      });
      if (object.httpEtag) headers.set("ETag", object.httpEtag);
      return new Response(object.body as unknown as BodyInit, { status: 200, headers });
    } catch {
      return c.text("Media is temporarily unavailable.", 500);
    }
  });

  // Public: OTAs poll this URL; the token is the only credential. Mirrors handleIcalExport.
  app.get("/api/ical/:file", async c => {
    const token = c.req.param("file").replace(/\.ics$/i, "").toLowerCase();
    try {
      if (!c.env?.DB) return c.text("Calendar not found.", 404);
      const db = createDatabase(c.env.DB)!;
      const systemCaller = createD1SystemCallerContext();
      const ics = await getOtaIcalExport(db, systemCaller, token);
      if (!ics) return c.text("Calendar not found.", 404);
      return c.body(
        ics,
        200,
        {
          "Content-Type": "text/calendar; charset=utf-8",
          "Cache-Control": "no-cache, max-age=0",
        },
      );
    } catch (error) {
      console.error("[OTA iCal export] failed:", error instanceof Error ? error.message : error);
      return c.text("Calendar is temporarily unavailable.", 500);
    }
  });

  // Mount Better Auth endpoints (/api/auth/*)
  app.all("/api/auth/*", async c => {
    if (!c.env?.DB) {
      return c.json({ error: "Database binding not available" }, 500);
    }
    const auth = getAuth(c.env.DB, new URL(c.req.url).origin);
    return auth.handler(c.req.raw);
  });

  // Everything outside /api/* is served by Workers Static Assets (see wrangler.toml).
  app.all("/api/*", c => c.json({ error: "Not found" }, 404));

  return app;
}
