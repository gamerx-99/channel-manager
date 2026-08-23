import { promises as dns } from 'node:dns';
import pg from 'pg';

const { Client } = pg;
const connectionString = process.env.SUPABASE_POOLER_DB_URL ?? process.env.SUPABASE_DB_URL;

const requiredTables = [
  'availability',
  'bookings',
  'guests',
  'hotel_domains',
  'hotel_media',
  'hotel_users',
  'hotels',
  'room_types',
  'rooms',
];

const requiredPolicies = [
  'availability_manage',
  'availability_public_select',
  'bookings_manage',
  'guests_manage',
  'hotel_domains_manage',
  'hotel_domains_public_select',
  'hotel_media_manage',
  'hotel_media_public_select',
  'hotel_users_manage',
  'hotel_users_select',
  'hotels_manage',
  'hotels_select',
  'room_types_manage',
  'room_types_public_select',
  'rooms_manage',
];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function verifyMigration() {
  assert(connectionString, 'SUPABASE_POOLER_DB_URL or SUPABASE_DB_URL is required.');
  const connection = new URL(connectionString);
  const [ipv4Host] = await dns.resolve4(connection.hostname);
  assert(ipv4Host, `No IPv4 record was returned for ${connection.hostname}.`);

  const client = new Client({
    host: ipv4Host,
    port: Number(connection.port || 5432),
    user: decodeURIComponent(connection.username),
    password: decodeURIComponent(connection.password),
    database: connection.pathname.replace(/^\//, '') || 'postgres',
    ssl: { rejectUnauthorized: false, servername: connection.hostname },
    connectionTimeoutMillis: 15_000,
  });

  try {
    await client.connect();

    const tables = await client.query(`select tablename from pg_tables where schemaname = 'public' and tablename = any($1::text[])`, [requiredTables]);
    const rls = await client.query(`select relname, relrowsecurity from pg_class where relnamespace = 'public'::regnamespace and relname = any($1::text[])`, [requiredTables]);
    const policies = await client.query(`select policyname from pg_policies where schemaname = 'public' and policyname = any($1::text[])`, [requiredPolicies]);
    const bookingConstraint = await client.query(`select conname, contype from pg_constraint where conrelid = 'public.bookings'::regclass and conname = 'prevent_double_booking'`);
    const functions = await client.query(`select proname, prosecdef, proconfig from pg_proc where pronamespace = 'public'::regnamespace and proname = any(array['is_super_admin', 'is_hotel_member', 'get_public_hotel'])`);
    const hotelsPolicy = await client.query(`select pg_get_expr(polqual, polrelid) as using_expression from pg_policy where polname = 'hotels_select' and polrelid = 'public.hotels'::regclass`);
    const publicRpc = await client.query(`select pg_get_function_result('public.get_public_hotel(text)'::regprocedure) as result_signature`);

    assert(tables.rows.length === requiredTables.length, 'Not all expected application tables exist.');
    assert(rls.rows.length === requiredTables.length && rls.rows.every(row => row.relrowsecurity), 'RLS is not enabled on every application table.');
    assert(policies.rows.length === requiredPolicies.length, 'Not all required RLS policies exist.');
    assert(bookingConstraint.rows[0]?.contype === 'x', 'The prevent_double_booking exclusion constraint is missing.');
    assert(functions.rows.length === 3 && functions.rows.every(row => row.prosecdef), 'A required SECURITY DEFINER helper/RPC is missing.');
    assert(hotelsPolicy.rows.length === 1 && hotelsPolicy.rows[0].using_expression.includes('is_hotel_member'), 'hotels_select is not restricted to hotel members.');
    assert(!hotelsPolicy.rows[0].using_expression.includes('public_enabled'), 'hotels_select exposes public_enabled access directly.');
    assert(publicRpc.rows[0]?.result_signature.includes('id uuid') && publicRpc.rows[0].result_signature.includes('address text'), 'get_public_hotel return contract is incorrect.');

    console.log(JSON.stringify({
      status: 'verified',
      tables: tables.rows.map(row => row.tablename).sort(),
      rlsEnabled: rls.rows.map(row => row.relname).sort(),
      policyCount: policies.rows.length,
      bookingConstraint: bookingConstraint.rows[0].conname,
      securityDefinerFunctions: functions.rows.map(row => row.proname).sort(),
      hotelsSelect: hotelsPolicy.rows[0].using_expression,
      publicRpc: 'get_public_hotel(text)',
    }, null, 2));
  } finally {
    await client.end().catch(() => undefined);
  }
}

verifyMigration().catch(error => {
  console.error('[Migration verification] Failed:', error.message);
  process.exitCode = 1;
});
