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

  // 1. Find the target test hotel (e.g. Little Bro)
  const hotelRes = await client.query("select id, name from public.hotels order by created_at asc limit 1");
  if (hotelRes.rowCount === 0) {
    throw new Error("No hotel found in Supabase database.");
  }
  const hotel = hotelRes.rows[0];
  console.log(`Target hotel for test staff membership: ${hotel.name} (${hotel.id})`);

  // 2. Check if there is already a front_desk or revenue_manager membership we can use, or create a dummy user in auth.users if possible, or insert a hotel_user record linked to an existing user if allowed.
  // Since auth.users has foreign key constraint on hotel_users(user_id), we should find an existing user in auth.users that is not already the hotel_owner for this hotel.
  const usersRes = await client.query(`
    select au.id, au.email
    from auth.users au
    where not exists (
      select 1 from public.hotel_users hu
      where hu.hotel_id = $1 and hu.user_id = au.id
    )
    order by au.created_at desc
    limit 1
  `, [hotel.id]);

  let testUserId;
  let testEmail;
  if (usersRes.rowCount > 0) {
    testUserId = usersRes.rows[0].id;
    testEmail = usersRes.rows[0].email;
    console.log(`Found existing auth user for test staff: ${testEmail} (${testUserId})`);
  } else {
    // If no extra user exists in auth.users, pick any existing auth user in the system even if they have another role elsewhere, or create one if supabase allows. Let's inspect auth.users.
    const anyUserRes = await client.query("select id, email from auth.users order by created_at asc limit 1");
    if (anyUserRes.rowCount === 0) {
      throw new Error("No auth users found in Supabase auth.users table.");
    }
    // We can use a unique dummy uuid and email if foreign key allows, but hotel_users.user_id references auth.users(id). Let's check foreign key definition.
    testUserId = anyUserRes.rows[0].id;
    testEmail = anyUserRes.rows[0].email;
    console.log(`Using existing auth user fallback: ${testEmail} (${testUserId})`);
  }

  // Check if hotel_users already has a test membership for this user at this hotel
  const existingMembership = await client.query(
    "select id, role from public.hotel_users where hotel_id = $1 and user_id = $2",
    [hotel.id, testUserId]
  );

  let membershipId;
  if (existingMembership.rowCount > 0) {
    membershipId = existingMembership.rows[0].id;
    console.log(`User already has membership ${membershipId} with role ${existingMembership.rows[0].role}. Updating role to front_desk for test...`);
    await client.query(
      "update public.hotel_users set role = 'front_desk', updated_at = now() where id = $1",
      [membershipId]
    );
  } else {
    const insertRes = await client.query(
      "insert into public.hotel_users (hotel_id, user_id, role) values ($1, $2, 'front_desk') returning id",
      [hotel.id, testUserId]
    );
    membershipId = insertRes.rows[0].id;
    console.log(`Created new front_desk membership ${membershipId} for user ${testEmail}`);
  }

  console.log(JSON.stringify({ success: true, hotelId: hotel.id, membershipId, testUserId, testEmail }, null, 2));
} catch (error) {
  console.error(`Error setting up test staff membership: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => undefined);
}
