#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { createClient } from "@supabase/supabase-js";
import { S3Client, PutObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";

const BUCKET_NAME_SUPABASE = "hotel-media";
const CONTENT_TYPE_MAP = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
  avif: "image/avif",
};

async function run() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const targetEnv = args.find(a => a.startsWith("--env="))?.split("=")[1] || "staging";
  const r2Bucket = targetEnv === "production" ? "hayhost-media" : "hayhost-media-staging";

  console.log(`[13-08 R2 Sync] Starting media sync from Supabase '${BUCKET_NAME_SUPABASE}' to R2 '${r2Bucket}'`);
  if (dryRun) {
    console.log("[13-08 R2 Sync] DRY-RUN MODE: No files will be uploaded or modified.");
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.error("[13-08 R2 Sync] Error: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_ANON_KEY) are required.");
    console.error("Usage: node scripts/sync-supabase-storage-to-r2.ts [--dry-run] [--env=staging|production]");
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  // Configure S3 client for Cloudflare R2 if credentials exist
  const r2AccountId = process.env.R2_ACCOUNT_ID;
  const r2AccessKey = process.env.R2_ACCESS_KEY_ID;
  const r2SecretKey = process.env.R2_SECRET_ACCESS_KEY;

  let s3Client = null;
  if (r2AccountId && r2AccessKey && r2SecretKey) {
    s3Client = new S3Client({
      region: "auto",
      endpoint: `https://${r2AccountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: r2AccessKey,
        secretAccessKey: r2SecretKey,
      },
    });
  } else {
    console.warn("[13-08 R2 Sync] Note: R2 credentials (R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY) not found in env.");
    console.warn("Downloaded assets will be staged in ./scratch/r2-staging/ for upload via wrangler r2 object put.");
  }

  // 1. List folders (hotel IDs) in hotel-media bucket
  console.log(`[13-08 R2 Sync] Listing objects in '${BUCKET_NAME_SUPABASE}'...`);
  const { data: rootItems, error: listErr } = await supabase.storage.from(BUCKET_NAME_SUPABASE).list("", {
    limit: 100,
    sortBy: { column: "name", order: "asc" },
  });

  if (listErr) {
    console.error(`[13-08 R2 Sync] Failed to list items from Supabase Storage:`, listErr.message);
    process.exit(1);
  }

  const objectsToSync = [];

  for (const item of rootItems || []) {
    if (item.id === null) {
      // It's a folder (hotelId)
      const hotelId = item.name;
      const { data: hotelFiles, error: subErr } = await supabase.storage.from(BUCKET_NAME_SUPABASE).list(hotelId, {
        limit: 500,
      });
      if (subErr) {
        console.warn(`[13-08 R2 Sync] Could not list folder '${hotelId}':`, subErr.message);
        continue;
      }
      for (const file of hotelFiles || []) {
        if (file.name && !file.name.startsWith(".")) {
          objectsToSync.push({
            hotelId,
            filename: file.name,
            key: `${hotelId}/${file.name}`,
          });
        }
      }
    } else {
      // Direct file in root
      objectsToSync.push({
        hotelId: "root",
        filename: item.name,
        key: item.name,
      });
    }
  }

  console.log(`[13-08 R2 Sync] Found ${objectsToSync.length} object(s) to synchronize.`);

  let syncedCount = 0;
  let skippedCount = 0;
  let errorCount = 0;

  for (const obj of objectsToSync) {
    const ext = obj.filename.split(".").pop()?.toLowerCase() || "";
    const contentType = CONTENT_TYPE_MAP[ext] || "application/octet-stream";

    console.log(` -> Processing: ${obj.key} (${contentType})`);
    if (dryRun) {
      syncedCount++;
      continue;
    }

    try {
      // Download from Supabase
      const { data: blob, error: dlErr } = await supabase.storage.from(BUCKET_NAME_SUPABASE).download(obj.key);
      if (dlErr || !blob) {
        throw new Error(dlErr ? dlErr.message : "Empty blob returned");
      }
      const buffer = Buffer.from(await blob.arrayBuffer());

      if (s3Client) {
        // Upload directly to Cloudflare R2 via S3 API
        await s3Client.send(
          new PutObjectCommand({
            Bucket: r2Bucket,
            Key: obj.key,
            Body: buffer,
            ContentType: contentType,
            CacheControl: "public, max-age=31536000, immutable",
          })
        );
      } else {
        // Save locally to scratch directory for wrangler upload
        const localDest = path.join(process.cwd(), "scratch", "r2-staging", obj.key);
        await fs.mkdir(path.dirname(localDest), { recursive: true });
        await fs.writeFile(localDest, buffer);
      }

      syncedCount++;
    } catch (err) {
      console.error(`[13-08 R2 Sync] Failed to sync ${obj.key}:`, err.message);
      errorCount++;
    }
  }

  console.log("\n--- Media Sync Summary ---");
  console.log(`Total Objects: ${objectsToSync.length}`);
  console.log(`Synchronized:  ${syncedCount}`);
  console.log(`Errors:        ${errorCount}`);

  if (!s3Client && syncedCount > 0 && !dryRun) {
    console.log(`\nAssets saved in ./scratch/r2-staging/. To upload to Cloudflare R2 via wrangler:`);
    for (const obj of objectsToSync) {
      console.log(`  pnpm exec wrangler r2 object put ${r2Bucket}/${obj.key} --file=./scratch/r2-staging/${obj.key}`);
    }
  }
}

run().catch(err => {
  console.error("[13-08 R2 Sync] Fatal error:", err);
  process.exit(1);
});
