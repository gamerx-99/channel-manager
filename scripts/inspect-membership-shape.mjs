import process from "node:process";
import pg from "pg";

const { Client } = pg;
const connectionString = process.env.SUPABASE_POOLER_DB_URL || process.env.SUPABASE_DB_URL;
if (!connectionString) throw new Error("SUPABASE_POOLER_DB_URL or SUPABASE_DB_URL is required");
const client = new Client({ connectionString, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 15_000, query_timeout: 30_000 });
try {
  await client.connect();
  const roleCounts = await client.query(`select role, count(*)::int as membership_count from public.hotel_users group by role order by role`);
  const hotelShapes = await client.query(`
    select hotel_id, string_agg(role || ':' || count::text, ', ' order by role) as roles
    from (
      select hotel_id, role, count(*)::int as count
      from public.hotel_users
      group by hotel_id, role
    ) grouped
    group by hotel_id
    order by hotel_id
    limit 25
  `);
  console.log(JSON.stringify({ roleCounts: roleCounts.rows, hotelShapes: hotelShapes.rows }, null, 2));
} finally {
  await client.end().catch(() => undefined);
}
