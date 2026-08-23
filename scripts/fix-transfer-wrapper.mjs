import process from "node:process";
import pg from "pg";

const { Client } = pg;
const connectionString = process.env.SUPABASE_POOLER_DB_URL || process.env.SUPABASE_DB_URL;
const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } });

try {
  await client.connect();
  await client.query(`
    CREATE OR REPLACE FUNCTION public.verify_transfer_wrapper(target_hotel_id uuid, target_membership_id uuid)
     RETURNS text
     LANGUAGE plpgsql
     SECURITY DEFINER
     SET search_path TO 'public', 'pg_temp'
     SET row_security TO 'off'
    AS $function$
    begin
      perform public.transfer_hotel_admin(target_hotel_id, target_membership_id);
      return 'SUCCESS';
    end;
    $function$
  `);
  console.log("Created verify_transfer_wrapper successfully.");
} catch (e) {
  console.error("Failed:", e);
  process.exitCode = 1;
} finally {
  await client.end();
}
