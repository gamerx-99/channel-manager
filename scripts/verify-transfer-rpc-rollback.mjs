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

  const hotelRes = await client.query("select h.id as hid from public.hotels h limit 1");
  const hotelId = hotelRes.rows[0].hid;

  const ownerRes = await client.query("select hu.id as huid, hu.user_id as uuid from public.hotel_users hu where hu.hotel_id = $1 and hu.role = 'hotel_owner' limit 1", [hotelId]);
  const ownerId = ownerRes.rows[0].huid;
  const ownerUserId = ownerRes.rows[0].uuid;

  const userRes = await client.query("select au.id as auid from auth.users au where au.id <> $1 limit 1", [ownerUserId]);
  const dummyUserId = userRes.rows[0].auid;

  await client.query("BEGIN");

  const insRes = await client.query(
    "insert into public.hotel_users (hotel_id, user_id, role) values ($1, $2, 'front_desk') returning id as new_id",
    [hotelId, dummyUserId]
  );
  const recipientMembershipId = insRes.rows[0].new_id;

  await client.query("select set_config('request.jwt.claim.sub', $1, true)", [ownerUserId]);
  await client.query("select set_config('request.jwt.claim.email', 'test@example.com', true)");

  const transferRes = await client.query("select * from public.transfer_hotel_admin($1::uuid, $2::uuid)", [hotelId, recipientMembershipId]);

  const auditRes = await client.query("select al.id from public.hotel_admin_audit_logs al where al.hotel_id = $1 and al.action = 'hotel_admin_transfer' limit 1", [hotelId]);

  await client.query("ROLLBACK");

  const verified = transferRes.rowCount === 1 && auditRes.rowCount === 1;

  console.log(JSON.stringify({
    verified,
    rollbackOnly: true,
    hotelId,
    transferOutput: transferRes.rows[0],
    auditLogged: auditRes.rowCount === 1
  }, null, 2));

  if (!verified) process.exitCode = 1;
} catch (error) {
  try { await client.query("ROLLBACK"); } catch {}
  console.error(`Verification error: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => undefined);
}
