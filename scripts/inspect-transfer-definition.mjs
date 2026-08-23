import process from "node:process";
import pg from "pg";

const { Client } = pg;
const connectionString = process.env.SUPABASE_POOLER_DB_URL || process.env.SUPABASE_DB_URL;
const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } });

try {
  await client.connect();
  const res = await client.query(`
    select pg_get_functiondef(p.oid) as definition
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'transfer_hotel_admin'
  `);
  console.log(res.rows[0]?.definition || "Function not found");
} catch (e) {
  console.error(e);
} finally {
  await client.end();
}
