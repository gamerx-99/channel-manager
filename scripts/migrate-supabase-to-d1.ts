#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import pg from "pg";
import {
  expandBookingNights,
  TABLE_COLUMN_TYPES,
  transformRecordForD1,
} from "../shared/migration/dataTransforms";

const { Client } = pg;

// Ordered table list for insertion (respects foreign key hierarchy)
const TABLES_IN_ORDER = [
  "agents",
  "service_accounts",
  "user", // Better Auth
  "hotels",
  "hotel_domains",
  "hotel_users",
  "hotel_media",
  "room_types",
  "hotel_site_config",
  "hotel_payment_settings",
  "hotel_services",
  "hotel_signup_links",
  "support_access_grants",
  "hotel_admin_audit_logs",
  "rooms",
  "rate_overrides",
  "support_access_log",
  "ota_connections",
  "room_housekeeping_status",
  "housekeeping_tasks",
  "guests",
  "bookings",
  "availability",
  "booking_nights",
  "booking_services",
  "booking_status_log",
  "payment_sessions",
  "message_threads",
  "messages",
  "notifications",
  "ota_sync_logs",
];

function escapeSqlValue(val) {
  if (val === null || val === undefined) return "NULL";
  if (typeof val === "number") return Number.isFinite(val) ? String(val) : "NULL";
  if (typeof val === "boolean") return val ? "1" : "0";
  // Escape single quotes for SQL
  const str = String(val).replace(/'/g, "''");
  return `'${str}'`;
}

function generateBatchedInsertSql(tableName, records, batchSize = 100) {
  if (!records || records.length === 0) return "";
  const statements = [];
  const columns = Object.keys(records[0]);
  const quotedColumns = columns.map(c => `\`${c}\``).join(", ");

  for (let i = 0; i < records.length; i += batchSize) {
    const chunk = records.slice(i, i + batchSize);
    const valueRows = chunk.map(row => {
      const vals = columns.map(c => escapeSqlValue(row[c]));
      return `(${vals.join(", ")})`;
    });
    statements.push(`INSERT OR REPLACE INTO \`${tableName}\` (${quotedColumns}) VALUES\n  ${valueRows.join(",\n  ")};`);
  }
  return statements.join("\n\n");
}

async function run() {
  const args = process.argv.slice(2);
  const dumpDirArg = args.find(a => a.startsWith("--dump-dir="))?.split("=")[1];
  const outputFile = args.find(a => a.startsWith("--output="))?.split("=")[1] || "d1_migration_bundle.sql";
  const allowConflicts = args.includes("--allow-conflicts");

  const tableData = new Map();
  const report = {
    source: "",
    extractedCounts: {},
    transformedCounts: {},
    bookingNightsCount: 0,
    conflicts: [],
  };

  if (dumpDirArg) {
    console.log(`[13-08] Reading JSON dumps from: ${dumpDirArg}`);
    report.source = `JSON Dump directory (${dumpDirArg})`;
    for (const table of TABLES_IN_ORDER) {
      if (table === "booking_nights") continue; // derived
      const filePath = path.join(dumpDirArg, `${table}.json`);
      try {
        const rawContent = await fs.readFile(filePath, "utf8");
        const parsed = JSON.parse(rawContent);
        tableData.set(table, Array.isArray(parsed) ? parsed : []);
        report.extractedCounts[table] = tableData.get(table).length;
      } catch {
        // Table file might not exist if empty
        tableData.set(table, []);
        report.extractedCounts[table] = 0;
      }
    }
  } else {
    const connectionString = process.env.SUPABASE_POOLER_DB_URL || process.env.SUPABASE_DB_URL;
    if (!connectionString) {
      console.error("[13-08] Error: Neither SUPABASE_POOLER_DB_URL nor SUPABASE_DB_URL is set, and --dump-dir was not specified.");
      console.error("Usage: node scripts/migrate-supabase-to-d1.mjs [--dump-dir=<dir>] [--output=<file.sql>] [--allow-conflicts]");
      process.exit(1);
    }

    console.log("[13-08] Connecting to Supabase PostgreSQL...");
    report.source = "Supabase PostgreSQL Database";
    const client = new Client({
      connectionString,
      ssl: { rejectUnauthorized: false },
      connectionTimeoutMillis: 15_000,
      query_timeout: 60_000,
    });

    try {
      await client.connect();
      console.log("[13-08] Connected. Extracting tables...");

      for (const table of TABLES_IN_ORDER) {
        if (table === "booking_nights") continue;
        if (table === "user") {
          // Extract Supabase auth.users to map to Better Auth
          try {
            const res = await client.query(`
              SELECT id, email, created_at as "createdAt", updated_at as "updatedAt",
                     COALESCE(raw_user_meta_data->>'full_name', split_part(email, '@', 1)) as name,
                     CASE WHEN email_confirmed_at IS NOT NULL THEN true ELSE false END as "emailVerified"
              FROM auth.users
            `);
            tableData.set("user", res.rows);
            report.extractedCounts["user"] = res.rows.length;
          } catch (e) {
            console.warn("[13-08] Could not read auth.users:", e.message);
            tableData.set("user", []);
            report.extractedCounts["user"] = 0;
          }
          continue;
        }

        try {
          const res = await client.query(`SELECT * FROM public.${table}`);
          tableData.set(table, res.rows);
          report.extractedCounts[table] = res.rows.length;
        } catch (e) {
          console.warn(`[13-08] Could not read table ${table}:`, e.message);
          tableData.set(table, []);
          report.extractedCounts[table] = 0;
        }
      }
    } finally {
      await client.end().catch(() => undefined);
    }
  }

  // Transform records
  console.log("[13-08] Transforming records for Cloudflare D1 types...");
  const transformedTables = new Map();

  for (const [table, rows] of tableData.entries()) {
    const transformedRows = rows.map(r => transformRecordForD1(table, r));
    transformedTables.set(table, transformedRows);
    report.transformedCounts[table] = transformedRows.length;
  }

  // Handle booking_nights backfill and overlap validation
  const rawBookings = transformedTables.get("bookings") || [];
  const bookingsForNights = rawBookings.map(b => ({
    id: b.id,
    roomId: b.room_id,
    checkIn: b.check_in,
    checkOut: b.check_out,
    status: b.status,
    expiresAt: b.expires_at,
  }));

  console.log(`[13-08] Computing booking_nights backfill for ${bookingsForNights.length} bookings...`);
  const { nights, conflicts } = expandBookingNights(bookingsForNights);
  report.bookingNightsCount = nights.length;
  report.conflicts = conflicts;

  if (conflicts.length > 0) {
    console.warn(`\n[13-08] WARNING: Detected ${conflicts.length} overlapping booking nights:`);
    console.table(conflicts);
    if (!allowConflicts) {
      console.error("[13-08] Aborting: 13-04c invariant violation. Resolve overlaps or pass --allow-conflicts to ignore.");
      process.exit(1);
    }
  } else {
    console.log(`[13-08] Clean inventory! ${nights.length} booking nights created with 0 overlaps.`);
  }

  const bookingNightsRows = nights.map(n => ({
    booking_id: n.bookingId,
    room_id: n.roomId,
    night: n.night,
  }));
  transformedTables.set("booking_nights", bookingNightsRows);
  report.transformedCounts["booking_nights"] = bookingNightsRows.length;

  // Build SQL bundle
  console.log(`[13-08] Assembling D1 migration SQL bundle into: ${outputFile}`);
  const sqlChunks = [
    "-- ==========================================================================",
    "-- Hayhost D1 Data Migration Bundle (Ticket 13-08)",
    `-- Generated At: ${new Date().toISOString()}`,
    `-- Source: ${report.source}`,
    "-- ==========================================================================\n",
    "PRAGMA foreign_keys = OFF;\n",
  ];

  for (const table of TABLES_IN_ORDER) {
    const rows = transformedTables.get(table) || [];
    if (rows.length === 0) continue;
    sqlChunks.push(`-- Table: ${table} (${rows.length} rows)`);
    sqlChunks.push(generateBatchedInsertSql(table, rows));
    sqlChunks.push("");
  }

  sqlChunks.push("-- Enable foreign keys and verify integrity");
  sqlChunks.push("PRAGMA foreign_keys = ON;");
  sqlChunks.push("PRAGMA foreign_key_check;\n");

  await fs.writeFile(outputFile, sqlChunks.join("\n"), "utf8");
  console.log(`\n[13-08] Successfully wrote D1 migration bundle (${outputFile}).`);
  console.log("\n--- Migration Summary Report ---");
  console.table(
    Object.keys(report.extractedCounts).map(t => ({
      Table: t,
      Extracted: report.extractedCounts[t],
      Transformed: report.transformedCounts[t] ?? 0,
    }))
  );
  console.log(`Derived booking_nights: ${report.bookingNightsCount} rows (0 conflicts).`);
  console.log(`\nTo load this bundle into Cloudflare D1 Staging, run:`);
  console.log(`  pnpm exec wrangler d1 execute hayhost-staging --env staging --remote --file=${outputFile}\n`);
}

run().catch(err => {
  console.error("[13-08] Fatal error during migration:", err);
  process.exit(1);
});
