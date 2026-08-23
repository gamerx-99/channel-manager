import fs from 'fs';
import { promises as dns } from 'node:dns';
import path from 'path';
import pkg from 'pg';
const { Client } = pkg;

const connectionString = process.env.SUPABASE_POOLER_DB_URL ?? process.env.SUPABASE_DB_URL;

async function run() {
  if (!connectionString) {
    throw new Error('SUPABASE_DB_URL is required to run the production migration.');
  }

  const connection = new URL(connectionString);
  const [ipv4Host] = await dns.resolve4(connection.hostname);
  if (!ipv4Host) {
    throw new Error(`No IPv4 record was returned for ${connection.hostname}.`);
  }

  const client = new Client({
    host: ipv4Host,
    port: Number(connection.port || 5432),
    user: decodeURIComponent(connection.username),
    password: decodeURIComponent(connection.password),
    database: connection.pathname.replace(/^\//, '') || 'postgres',
    ssl: {
      rejectUnauthorized: false,
      servername: connection.hostname
    },
    connectionTimeoutMillis: 15_000,
  });

  try {
    console.log("[Migration] Connecting to Supabase PostgreSQL...");
    await client.connect();
    console.log("[Migration] Connected successfully.");

    const sqlPath = path.join(process.cwd(), 'supabase_migration_production.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');

    console.log("[Migration] Executing production migration script...");
    await client.query(sql);
    console.log("[Migration] Migration executed successfully!");

    // Verify created tables
    const res = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name;
    `);
    console.log("[Migration] Tables in public schema:", res.rows.map(r => r.table_name));

    // Verify get_public_hotel function exists
    const fnRes = await client.query(`
      SELECT routine_name 
      FROM information_schema.routines 
      WHERE routine_schema = 'public' 
        AND routine_name = 'get_public_hotel';
    `);
    console.log("[Migration] Verified public RPC function:", fnRes.rows.map(r => r.routine_name));

  } catch (err) {
    console.error("[Migration] Error executing migration:", err);
    process.exit(1);
  } finally {
    await client.end();
  }
}

run();
