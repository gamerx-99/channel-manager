import process from "node:process";
import pg from "pg";

const { Client } = pg;
const connectionString = process.env.SUPABASE_POOLER_DB_URL || process.env.SUPABASE_DB_URL;

if (!connectionString) {
  throw new Error("SUPABASE_POOLER_DB_URL or SUPABASE_DB_URL is required");
}

const client = new Client({
  connectionString,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 15_000,
  query_timeout: 30_000,
});

const requiredTables = ["hotels", "hotel_users", "availability", "hotel_admin_audit_logs"];
const requiredFunctions = ["transfer_hotel_admin", "is_super_admin", "is_hotel_member", "can_manage_rates"];

try {
  await client.connect();
  const tables = await client.query(
    `select table_name
     from information_schema.tables
     where table_schema = 'public' and table_name = any($1::text[])
     order by table_name`,
    [requiredTables],
  );
  const missingTables = requiredTables.filter((name) => !tables.rows.some((row) => row.table_name === name));

  const functions = await client.query(
    `select p.proname as function_name, pg_get_function_identity_arguments(p.oid) as arguments
     from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = any($1::text[])
     order by p.proname`,
    [requiredFunctions],
  );
  const missingFunctions = requiredFunctions.filter((name) => !functions.rows.some((row) => row.function_name === name));

  const indexes = await client.query(
    `select indexname, indexdef
     from pg_indexes
     where schemaname = 'public' and indexname = 'uq_one_hotel_admin_per_hotel'`,
  );
  const uniqueAdminIndex = indexes.rows[0]?.indexdef ?? "";

  const duplicateAdmins = await client.query(
    `select hotel_id, count(*)::int as admin_count
     from public.hotel_users
     where role = 'hotel_owner'
     group by hotel_id
     having count(*) > 1`,
  );

  const policies = await client.query(
    `select count(*)::int as policy_count
     from pg_policies
     where schemaname = 'public'
       and tablename in ('availability', 'hotel_admin_audit_logs')`,
  );

  const report = {
    tables: tables.rows.map((row) => row.table_name),
    missingTables,
    functions: functions.rows,
    missingFunctions,
    uniqueAdminIndex,
    duplicateAdminHotels: duplicateAdmins.rows,
    scopedPolicyCount: policies.rows[0]?.policy_count ?? 0,
  };

  console.log(JSON.stringify(report, null, 2));

  if (
    missingTables.length > 0 ||
    missingFunctions.length > 0 ||
    !uniqueAdminIndex.includes("UNIQUE") ||
    !uniqueAdminIndex.includes("role = 'hotel_owner'") ||
    duplicateAdmins.rowCount !== 0 ||
    report.scopedPolicyCount < 2
  ) {
    process.exitCode = 1;
  }
} finally {
  await client.end().catch(() => undefined);
}
