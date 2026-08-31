import fs from "node:fs/promises";
import process from "node:process";
import pg from "pg";

const { Client } = pg;

// Minimal .env loader (last occurrence wins). Never prints values.
const envFile = await fs.readFile(new URL("../.env", import.meta.url), "utf8");
for (const line of envFile.split(/\r?\n/)) {
  const match = line.match(/^([A-Za-z0-9_]+)=(.*)$/);
  if (match) process.env[match[1]] = match[2].trim();
}

const connectionString =
  process.env.SUPABASE_POOLER_DB_URL || process.env.SUPABASE_DB_URL || process.env.DATABASE_URL;

if (!connectionString) {
  console.error("[Phase 10 runner] No database connection string found in .env");
  process.exit(1);
}

const notices = [];
const client = new Client({
  connectionString,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 15_000,
  query_timeout: 180_000,
});
client.on("notice", msg => {
  const line = String(msg.message ?? "");
  notices.push(line);
  console.log(`NOTICE: ${line}`);
});

async function runSqlFile(label, path) {
  const sql = await fs.readFile(new URL(path, import.meta.url), "utf8");
  const result = await client.query(sql);
  if (result.rows && result.rows.length) {
    let allPass = true;
    for (const row of result.rows) {
      const check = row.check ?? row.check_name ?? "";
      const result2 = row.result ?? row.verdict ?? "";
      console.log(`${label}: ${check} => ${result2}`);
      if (/FAIL/i.test(String(result2))) allPass = false;
    }
    return allPass;
  }
  return true;
}

try {
  await client.connect();
  console.log("[Phase 10 runner] connected — running one-shot apply and verify");

  await runSqlFile("ONESHOT", "../PHASE10_ONESHOT_APPLY_AND_VERIFY.sql");

  const verifies = [
    ["VERIFY-20260906", "../verify_20260906_notifications_recreate_policies.sql"],
    ["VERIFY-NOTIFICATIONS", "../verify_20260904_add_notifications.sql"],
    ["VERIFY-PAYMENT", "../verify_20260904_add_hotel_payment_settings.sql"],
  ];
  let allPass = true;
  for (const [label, path] of verifies) {
    const pass = await runSqlFile(label, path);
    if (!pass) allPass = false;
  }

  const finalOk = notices.some(line => line.includes("PHASE 10 ONESHOT: ALL CHECKS PASSED"));
  if (finalOk && allPass) {
    console.log("[Phase 10 runner] RESULT: ALL CHECKS PASSED");
  } else {
    console.error("[Phase 10 runner] RESULT: FAILED — see output above");
    process.exitCode = 1;
  }
} catch (error) {
  console.error(`[Phase 10 runner] ERROR: ${error.message}`);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => undefined);
}
