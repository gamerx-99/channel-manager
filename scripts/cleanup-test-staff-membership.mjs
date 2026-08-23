import process from "node:process";
import pg from "pg";

const { Client } = pg;
const connectionString = process.env.SUPABASE_POOLER_DB_URL || process.env.SUPABASE_DB_URL;
if (!connectionString) throw new Error("SUPABASE_POOLER_DB_URL or SUPABASE_DB_URL is required");

const client = new Client({
  connectionString,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 15_000,
  query_timeout: 30_000,
});

try {
  await client.connect();
  // Delete the front_desk membership we created for admin@ip.com in hotel Little Bro
  const res = await client.query(`
    delete from public.hotel_users
    using auth.users
    where public.hotel_users.user_id = auth.users.id
      and auth.users.email = 'admin@ip.com'
      and public.hotel_users.role = 'front_desk'
    returning public.hotel_users.id, public.hotel_users.hotel_id
  `);
  console.log(JSON.stringify({ cleaned: true, deletedMemberships: res.rows }, null, 2));
} catch (error) {
  console.error(`Cleanup failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => undefined);
}
