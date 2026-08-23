import { promises as dns } from 'node:dns';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const { Client } = pg;
const connectionString = process.env.SUPABASE_POOLER_DB_URL ?? process.env.SUPABASE_DB_URL;
const isExplicitlyEnabled = process.env.RUN_SUPABASE_INTEGRATION_TESTS === 'true';

if (isExplicitlyEnabled && !connectionString) {
  throw new Error('RUN_SUPABASE_INTEGRATION_TESTS=true requires SUPABASE_POOLER_DB_URL or SUPABASE_DB_URL.');
}

const integrationDescribe = isExplicitlyEnabled && connectionString ? describe : describe.skip;
let client: pg.Client;

async function createClient(connectionUrl: string) {
  const connection = new URL(connectionUrl);
  const [ipv4Host] = await dns.resolve4(connection.hostname);
  if (!ipv4Host) throw new Error(`No IPv4 record was returned for ${connection.hostname}.`);

  return new Client({
    host: ipv4Host,
    port: Number(connection.port || 5432),
    user: decodeURIComponent(connection.username),
    password: decodeURIComponent(connection.password),
    database: connection.pathname.replace(/^\//, '') || 'postgres',
    ssl: { rejectUnauthorized: false, servername: connection.hostname },
    connectionTimeoutMillis: 15_000,
  });
}

integrationDescribe('Supabase RLS and public hotel integration', () => {
  beforeAll(async () => {
    client = await createClient(connectionString!);
    await client.connect();
  }, 20_000);

  afterAll(async () => {
    await client?.end();
  });

  it('enables RLS on every Channel Manager table and retains the approved double-booking constraint', async () => {
    const tables = ['hotels', 'hotel_users', 'hotel_media', 'room_types', 'rooms', 'bookings', 'guests', 'availability', 'hotel_domains'];
    const { rows: rlsRows } = await client.query<{ relname: string; relrowsecurity: boolean }>(
      `select relname, relrowsecurity
       from pg_class
       where relnamespace = 'public'::regnamespace
         and relname = any($1::text[])`,
      [tables],
    );

    expect(rlsRows).toHaveLength(tables.length);
    expect(rlsRows.every(row => row.relrowsecurity)).toBe(true);

    const { rows: constraintRows } = await client.query<{ conname: string; contype: string }>(
      `select conname, contype
       from pg_constraint
       where conrelid = 'public.bookings'::regclass
         and conname = 'prevent_double_booking'`,
    );
    expect(constraintRows).toEqual([{ conname: 'prevent_double_booking', contype: 'x' }]);
  });

  it('prevents anon direct hotel reads while public RPC returns only the approved public fields', async () => {
    const slug = `rls-proof-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    let transactionOpen = false;

    try {
      await client.query('begin');
      transactionOpen = true;
      const { rows: insertedHotels } = await client.query<{ id: string }>(
        `insert into public.hotels (name, slug, address, owner_contact, public_enabled)
         values ($1, $2, $3, $4, true)
         returning id`,
        ['RLS Proof Hotel', slug, '9 Privacy Lane', 'must-not-leak@example.invalid'],
      );
      expect(insertedHotels).toHaveLength(1);

      await client.query('set local role anon');
      const directRead = await client.query(
        'select id, owner_contact from public.hotels where slug = $1',
        [slug],
      );
      expect(directRead.rows).toEqual([]);

      const publicRead = await client.query<Record<string, unknown>>(
        'select * from public.get_public_hotel($1)',
        [slug],
      );
      expect(publicRead.rows).toHaveLength(1);
      expect(publicRead.rows[0]).toMatchObject({
        id: insertedHotels[0].id,
        name: 'RLS Proof Hotel',
        slug,
        address: '9 Privacy Lane',
      });
      expect(Object.keys(publicRead.rows[0]).sort()).toEqual(['address', 'created_at', 'id', 'name', 'slug']);
      expect(publicRead.rows[0]).not.toHaveProperty('owner_contact');
    } finally {
      if (transactionOpen) await client.query('rollback');
    }
  });
});
