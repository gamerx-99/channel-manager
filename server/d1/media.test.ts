import { readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { drizzle as sqliteProxy } from "drizzle-orm/sqlite-proxy";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { D1Database, R2Bucket, R2ObjectBody } from "@cloudflare/workers-types/index.ts";
import { d1Schema, hotelMedia, hotelUsers, hotels } from "../../drizzle/d1-schema";
import type { D1ScopedDatabase } from "../db/scope";
import { createWorkerApp, type WorkerEnv } from "../../worker/app";
import { deleteHotelMediaFromR2, MAX_HOTEL_MEDIA_BYTES, uploadHotelMediaToR2, validateHotelMediaObjectKey, validateHotelMediaUpload, servedMediaUrl } from "./media";

const migrationFolder = resolve(dirname(fileURLToPath(import.meta.url)), "../../drizzle/d1");
const { DatabaseSync } = process.getBuiltinModule("node:sqlite") as typeof import("node:sqlite");
let sqlite: InstanceType<typeof DatabaseSync>;
let db: D1ScopedDatabase;

beforeEach(() => {
  sqlite = new DatabaseSync(":memory:");
  sqlite.exec("PRAGMA foreign_keys = ON");
  for (const file of readdirSync(migrationFolder).filter(name => name.endsWith(".sql")).sort()) {
    const source = readFileSync(resolve(migrationFolder, file), "utf8");
    for (const statement of source.split("--> statement-breakpoint")) if (statement.trim()) sqlite.exec(statement);
  }
  db = sqliteProxy(async (query, params, method) => {
    const statement = sqlite.prepare(query);
    statement.setReturnArrays(true);
    if (method === "run") { statement.run(...params); return { rows: [] }; }
    if (method === "get") { const row = statement.get(...params); return { rows: row ? [row] : [] }; }
    return { rows: statement.all(...params) };
  }, { schema: d1Schema }) as unknown as D1ScopedDatabase;
  db.$client = {
    prepare: query => ({ bind: (...params) => ({ query, params }) }),
    batch: async statements => {
      sqlite.exec("BEGIN");
      try {
        const results = statements.map(statement => {
          const { query, params } = statement as { query: string; params: unknown[] };
          return { meta: { changes: Number(sqlite.prepare(query).run(...params).changes) } };
        });
        sqlite.exec("COMMIT");
        return results;
      } catch (error) { sqlite.exec("ROLLBACK"); throw error; }
    },
  };
});
afterEach(() => sqlite.close());

const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);

class MemoryR2 {
  objects = new Map<string, { data: Uint8Array; httpMetadata?: { contentType?: string; cacheControl?: string }; customMetadata?: Record<string, string> }>();
  deletes: string[] = [];

  async put(key: string, value: ArrayBuffer | ArrayBufferView | ReadableStream, options: { httpMetadata?: { contentType?: string; cacheControl?: string }; customMetadata?: Record<string, string> } = {}) {
    const data = value instanceof Uint8Array ? value : value instanceof ArrayBuffer ? new Uint8Array(value) : new Uint8Array();
    this.objects.set(key, { data: data.slice(), httpMetadata: options.httpMetadata, customMetadata: options.customMetadata });
    return {};
  }

  async get(key: string): Promise<R2ObjectBody | null> {
    const stored = this.objects.get(key);
    if (!stored) return null;
    const body = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(stored.data); controller.close(); } });
    return {
      key,
      version: "version-1",
      size: stored.data.byteLength,
      etag: "test-etag",
      httpEtag: '"test-etag"',
      checksums: {} as R2ObjectBody["checksums"],
      uploaded: new Date("2026-10-28T00:00:00.000Z"),
      httpMetadata: stored.httpMetadata,
      customMetadata: stored.customMetadata,
      body,
    } as R2ObjectBody;
  }

  async delete(key: string) {
    this.deletes.push(key);
    this.objects.delete(key);
  }
}

async function seedHotel(id: string, owner: string) {
  await db.insert(hotels).values({ id, name: `Hotel ${id}`, slug: `${id}-slug`, address: "Address", ownerContact: `${owner}@example.test` });
  await db.insert(hotelUsers).values({ id: `membership-${id}`, hotelId: id, userId: owner, role: "hotel_owner", permissionGrants: [], permissionRevokes: [] });
}

function fakeContext(userId: string | null) {
  return async () => ({ user: userId ? { id: userId } as any : null, clientIp: "test" });
}

describe("D1 hotel media on R2", () => {
  it("keeps the current 5 MiB and image MIME limits", () => {
    expect(validateHotelMediaUpload(bytes, "image/png", "photo.png")).toEqual({ contentType: "image/png", extension: "png" });
    expect(() => validateHotelMediaUpload(new Uint8Array(MAX_HOTEL_MEDIA_BYTES + 1), "image/png", "large.png"))
      .toThrow("Images must be 5 MiB or smaller.");
    expect(() => validateHotelMediaUpload(new Uint8Array([0x3c, 0x68, 0x74, 0x6d, 0x6c]), "text/plain", "photo.txt")).toThrow("Only image files can be uploaded.");
  });

  it("creates a server-generated hotel-prefixed key and makes the first upload the hero", async () => {
    await seedHotel("hotel-a", "owner-a");
    const bucket = new MemoryR2();
    const media = await uploadHotelMediaToR2(db, { userId: "owner-a" }, bucket as unknown as R2Bucket, {
      hotel_id: "hotel-a", filename: "front.png", content_type: "image/png", data: bytes,
    });
    expect(media).toMatchObject({ hotelId: "hotel-a", url: expect.stringMatching(/^\/media\/hotel-a\/[a-f0-9-]{36}\.png$/), isHero: true });
    expect([...bucket.objects.keys()]).toEqual([media.url.slice("/media/".length)]);
    expect([...bucket.objects.values()][0]?.customMetadata).toMatchObject({ hotelId: "hotel-a", mediaId: media.id });
    expect(await db.select().from(hotelMedia)).toMatchObject([{ id: media.id, isHero: true, displayOrder: 0 }]);
  });

  it("refuses cross-hotel uploads and deletes before touching R2", async () => {
    await seedHotel("hotel-a", "owner-a"); await seedHotel("hotel-b", "owner-b");
    const bucket = new MemoryR2();
    await expect(uploadHotelMediaToR2(db, { userId: "owner-a" }, bucket as unknown as R2Bucket, {
      hotel_id: "hotel-b", filename: "cross.png", content_type: "image/png", data: bytes,
    })).rejects.toMatchObject({ code: "FORBIDDEN" });
    const key = `hotel-b/${crypto.randomUUID()}.jpg`;
    bucket.objects.set(key, { data: bytes });
    await db.insert(hotelMedia).values({ id: "foreign-media", hotelId: "hotel-b", url: `/media/${key}` });
    await expect(deleteHotelMediaFromR2(db, { userId: "owner-a" }, bucket as unknown as R2Bucket, "hotel-b", "foreign-media"))
      .rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(bucket.deletes).toEqual([]);
    expect(await db.select().from(hotelMedia)).toHaveLength(1);
  });

  it.each(["../outside.jpg", "/hotel-a/file.jpg", "hotel-b/00000000-0000-4000-8000-000000000000.jpg", "hotel-a/%2e%2e%2fother.jpg"]) (
    "rejects unsafe object path %s", candidate => {
      expect(() => validateHotelMediaObjectKey("hotel-a", candidate)).toThrow();
    },
  );

  it("refuses a traversal key stored in the hotel row without deleting the row or an R2 key", async () => {
    await seedHotel("hotel-a", "owner-a");
    const bucket = new MemoryR2();
    await db.insert(hotelMedia).values({ id: "unsafe-media", hotelId: "hotel-a", url: "/media/hotel-a/../outside.jpg", isHero: true });
    await expect(deleteHotelMediaFromR2(db, { userId: "owner-a" }, bucket as unknown as R2Bucket, "hotel-a", "unsafe-media"))
      .rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(bucket.deletes).toEqual([]);
    expect(await db.select().from(hotelMedia)).toHaveLength(1);
  });

  it("deletes the R2 object with the row and promotes the next media item to hero", async () => {
    await seedHotel("hotel-a", "owner-a");
    const bucket = new MemoryR2();
    const caller = { userId: "owner-a" };
    const jpegBytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0]);
    const first = await uploadHotelMediaToR2(db, caller, bucket as unknown as R2Bucket, { hotel_id: "hotel-a", filename: "first.jpg", content_type: "image/jpeg", data: jpegBytes });
    const second = await uploadHotelMediaToR2(db, caller, bucket as unknown as R2Bucket, { hotel_id: "hotel-a", filename: "second.jpg", content_type: "image/jpeg", data: jpegBytes });
    const third = await uploadHotelMediaToR2(db, caller, bucket as unknown as R2Bucket, { hotel_id: "hotel-a", filename: "third.jpg", content_type: "image/jpeg", data: jpegBytes });
    expect(second.isHero).toBe(false);
    await expect(deleteHotelMediaFromR2(db, caller, bucket as unknown as R2Bucket, "hotel-a", first.id)).resolves.toEqual({ id: first.id });
    expect(bucket.deletes).toEqual([first.url.slice("/media/".length)]);
    expect(bucket.objects.has(first.url.slice("/media/".length))).toBe(false);
    const remaining = await db.select().from(hotelMedia).where(eq(hotelMedia.hotelId, "hotel-a"));
    expect(remaining).toHaveLength(2);
    expect(remaining.find(item => item.id === second.id)).toMatchObject({ isHero: true });
    expect(remaining.find(item => item.id === third.id)).toMatchObject({ isHero: false });
  });

  it("serves public R2 objects with immutable cache headers, ETag and 404 for missing keys", async () => {
    await seedHotel("hotel-a", "owner-a");
    const bucket = new MemoryR2();
    const media = await uploadHotelMediaToR2(db, { userId: "owner-a" }, bucket as unknown as R2Bucket, { hotel_id: "hotel-a", filename: "photo.png", content_type: "image/png", data: bytes });
    const app = createWorkerApp({ createContext: fakeContext(null), createDatabase: () => db });
    const env = { DB: {} as D1Database, MEDIA: bucket as unknown as R2Bucket } as WorkerEnv;
    const response = await app.request(servedMediaUrl(media.url), {}, env);
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("image/png");
    expect(response.headers.get("Cache-Control")).toBe("public, max-age=31536000, immutable");
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(response.headers.get("Content-Security-Policy")).toBe("default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox");
    expect(response.headers.get("Cross-Origin-Resource-Policy")).toBe("same-site");
    expect(response.headers.get("ETag")).toBe('"test-etag"');
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(bytes);
    // Old /media links still work for anything that reaches the Worker.
    expect((await app.request(media.url, {}, env)).status).toBe(200);
    expect((await app.request("/api/media/hotel-a/00000000-0000-4000-8000-000000000000.png", {}, env)).status).toBe(404);
    expect((await app.request("/media/hotel-a/00000000-0000-4000-8000-000000000000.png", {}, env)).status).toBe(404);
    expect((await app.request("/media/hotel-a/not-valid", {}, env)).status).toBe(404);
  });

  it("serves the authenticated upload and delete endpoints through the scoped D1 layer", async () => {
    await seedHotel("hotel-a", "owner-a");
    const bucket = new MemoryR2();
    const app = createWorkerApp({ createContext: fakeContext("owner-a"), createDatabase: () => db });
    const env = { DB: {} as D1Database, MEDIA: bucket as unknown as R2Bucket } as WorkerEnv;
    const response = await app.request("/api/media/hotel-a", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer test" },
      body: JSON.stringify({ filename: "photo.png", base64: "data:image/png;base64,iVBORw==" }),
    }, env);
    expect(response.status).toBe(201);
    const media = await response.json() as { id: string; url: string; is_hero: boolean };
    // Handed out under /api/: in a deployed Worker only /api/* runs before static assets.
    expect(media).toMatchObject({ url: expect.stringMatching(/^\/api\/media\/hotel-a\//), is_hero: true });
    const deleted = await app.request(`/api/media/hotel-a/${media.id}`, { method: "DELETE", headers: { authorization: "Bearer test" } }, env);
    expect(deleted.status).toBe(200);
    expect(await deleted.json()).toEqual({ id: media.id });
    expect(bucket.objects.size).toBe(0);
  });

  it("rejects malformed and oversized request bodies without leaking internals", async () => {
    await seedHotel("hotel-a", "owner-a");
    const bucket = new MemoryR2();
    const app = createWorkerApp({ createContext: fakeContext("owner-a"), createDatabase: () => db });
    const env = { DB: {} as D1Database, MEDIA: bucket as unknown as R2Bucket } as WorkerEnv;
    const headers = { "content-type": "application/json", authorization: "Bearer test" };
    const malformed = await app.request("/api/media/hotel-a", { method: "POST", headers, body: "{" }, env);
    expect(malformed.status).toBe(400);
    expect(await malformed.json()).toEqual({ error: "Invalid image upload." });
    const oversized = await app.request("/api/media/hotel-a", {
      method: "POST", headers, body: JSON.stringify({ filename: "large.png", base64: "A".repeat(10 * 1024 * 1024) }),
    }, env);
    expect(oversized.status).toBe(413);
    expect(await oversized.json()).toEqual({ error: "Upload request is too large." });
    expect(bucket.objects.size).toBe(0);
  });

  it("rejects non-raster types and declared vs detected mismatches", () => {
    const svgBytes = new TextEncoder().encode("<svg xmlns='http://www.w3.org/2000/svg'></svg>");
    expect(() => validateHotelMediaUpload(svgBytes, "image/svg+xml", "image.svg")).toThrow("Only image files can be uploaded.");

    const htmlBytes = new TextEncoder().encode("<!DOCTYPE html><html><body><h1>test</h1></body></html>");
    expect(() => validateHotelMediaUpload(htmlBytes, "image/png", "photo.png")).toThrow("Only image files can be uploaded.");

    expect(() => validateHotelMediaUpload(bytes, "image/jpeg", "photo.jpg")).toThrow("Declared content type does not match detected image type.");

    const avisBytes = new Uint8Array([0, 0, 0, 28, 0x66, 0x74, 0x79, 0x70, 0x61, 0x76, 0x69, 0x73]); // ftypavis
    expect(validateHotelMediaUpload(avisBytes, "image/avif", "photo.avif")).toEqual({ contentType: "image/avif", extension: "avif" });
  });

  it("x.html with PNG bytes produces a .png key", async () => {
    await seedHotel("hotel-a", "owner-a");
    const bucket = new MemoryR2();
    const media = await uploadHotelMediaToR2(db, { userId: "owner-a" }, bucket as unknown as R2Bucket, {
      hotel_id: "hotel-a", filename: "x.html", content_type: "image/png", data: bytes,
    });
    expect(media.url).toMatch(/^\/media\/hotel-a\/[a-f0-9-]{36}\.png$/);
  });

  it("GET of a .svg or .html key returns 404 without calling R2", async () => {
    await seedHotel("hotel-a", "owner-a");
    const bucket = new MemoryR2();
    let getCalled = false;
    const originalGet = bucket.get.bind(bucket);
    bucket.get = async (key: string) => {
      getCalled = true;
      return originalGet(key);
    };
    const app = createWorkerApp({ createContext: fakeContext(null), createDatabase: () => db });
    const env = { DB: {} as D1Database, MEDIA: bucket as unknown as R2Bucket } as WorkerEnv;

    const svgRes = await app.request("/media/hotel-a/00000000-0000-4000-8000-000000000000.svg", {}, env);
    expect(svgRes.status).toBe(404);
    expect(getCalled).toBe(false);

    const htmlRes = await app.request("/media/hotel-a/00000000-0000-4000-8000-000000000000.html", {}, env);
    expect(htmlRes.status).toBe(404);
    expect(getCalled).toBe(false);
  });

  it("serves response with exact CSP (including sandbox), nosniff, CORP same-site, and extension Content-Type even when R2 metadata says text/html", async () => {
    await seedHotel("hotel-a", "owner-a");
    const bucket = new MemoryR2();
    const key = "hotel-a/00000000-0000-4000-8000-000000000001.png";
    bucket.objects.set(key, {
      data: bytes,
      httpMetadata: { contentType: "text/html" },
    });
    const app = createWorkerApp({ createContext: fakeContext(null), createDatabase: () => db });
    const env = { DB: {} as D1Database, MEDIA: bucket as unknown as R2Bucket } as WorkerEnv;

    const response = await app.request(`/media/${key}`, {}, env);
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("image/png");
    expect(response.headers.get("Content-Security-Policy")).toBe("default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox");
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(response.headers.get("Cross-Origin-Resource-Policy")).toBe("same-site");
  });

  it("delete removes the row even when bucket.delete throws", async () => {
    await seedHotel("hotel-a", "owner-a");
    const bucket = new MemoryR2();
    const caller = { userId: "owner-a" };
    const media = await uploadHotelMediaToR2(db, caller, bucket as unknown as R2Bucket, {
      hotel_id: "hotel-a", filename: "photo.jpg", content_type: "image/jpeg", data: new Uint8Array([0xff, 0xd8, 0xff, 0xe0]),
    });
    bucket.delete = async () => {
      throw new Error("R2 network failure");
    };
    const result = await deleteHotelMediaFromR2(db, caller, bucket as unknown as R2Bucket, "hotel-a", media.id);
    expect(result).toEqual({ id: media.id });
    const remaining = await db.select().from(hotelMedia).where(eq(hotelMedia.id, media.id));
    expect(remaining).toHaveLength(0);
  });
});

describe("servedMediaUrl", () => {
  it("routes stored /media paths through /api, which run_worker_first sends to the Worker", () => {
    expect(servedMediaUrl("/media/hotel-a/x.png")).toBe("/api/media/hotel-a/x.png");
    expect(servedMediaUrl("https://cdn.example/x.png")).toBe("https://cdn.example/x.png");
    const toml = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "../../wrangler.toml"), "utf8");
    expect(toml).toMatch(/run_worker_first = \["\/api\/\*"\]/);
  });
});
