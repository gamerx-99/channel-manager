import pkg from 'pg';
const { Client } = pkg;

// Try user postgres with session pooler but without prefix or with project ref as parameter
const client = new Client({
  host: 'aws-0-ap-southeast-1.pooler.supabase.com',
  port: 6543,
  database: 'postgres',
  user: 'postgres',
  password: decodeURIComponent('2uLuQe%2F!%3FLKaUrQ'),
  ssl: { rejectUnauthorized: false },
  connectionString: undefined
});

async function test() {
  try {
    await client.connect();
    console.log("Connected!");
  } catch (e) {
    console.error("Err:", e);
  } finally {
    await client.end();
  }
}
test();
