import fs from "node:fs/promises";
import process from "node:process";
import pg from "pg";

const { Client } = pg;
const connectionString = process.env.SUPABASE_POOLER_DB_URL || process.env.SUPABASE_DB_URL;

if (!connectionString) {
  throw new Error("SUPABASE_POOLER_DB_URL or SUPABASE_DB_URL is required");
}

const sql = await fs.readFile(new URL("../supabase_migration_production.sql", import.meta.url), "utf8");
const client = new Client({
  connectionString,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 15_000,
  query_timeout: 120_000,
});

try {
  await client.connect();
  await client.query("BEGIN");
  await client.query(sql);
  await client.query("COMMIT");
  console.log("Supabase Postgres migration applied successfully.");
} catch (error) {
  try {
    await client.query("ROLLBACK");
  } catch {
    // Preserve the original migration error.
  }
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Supabase Postgres migration failed: ${message}`);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => undefined);
}
