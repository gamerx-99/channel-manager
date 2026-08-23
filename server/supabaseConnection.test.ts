import { promises as dns } from "node:dns";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const databaseUrl = process.env.SUPABASE_POOLER_DB_URL ?? process.env.SUPABASE_DB_URL;

describe("Supabase PostgreSQL migration connection", () => {
  let client: Client | undefined;

  beforeAll(async () => {
    expect(databaseUrl).toBeTruthy();
    const connection = new URL(databaseUrl!);
    const [ipv4Host] = await dns.resolve4(connection.hostname);
    expect(ipv4Host).toBeTruthy();

    client = new Client({
      host: ipv4Host,
      port: Number(connection.port || 5432),
      user: decodeURIComponent(connection.username),
      password: decodeURIComponent(connection.password),
      database: connection.pathname.replace(/^\//, "") || "postgres",
      ssl: {
        rejectUnauthorized: false,
        servername: connection.hostname,
      },
      connectionTimeoutMillis: 15_000,
    });
    await client.connect();
  });

  afterAll(async () => {
    await client?.end();
  });

  it("connects using the server-only Supabase database URL", async () => {
    const result = await client!.query<{ ready: number }>("select 1 as ready");
    expect(result.rows).toEqual([{ ready: 1 }]);
  });
});
