import { resolve4 } from "node:dns/promises";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const databaseUrl =
  process.env.SUPABASE_POOLER_DB_URL ?? process.env.SUPABASE_DB_URL;
const isExplicitlyEnabled =
  process.env.RUN_SUPABASE_INTEGRATION_TESTS === "true";

if (isExplicitlyEnabled && !databaseUrl) {
  throw new Error(
    "RUN_SUPABASE_INTEGRATION_TESTS=true requires SUPABASE_POOLER_DB_URL or SUPABASE_DB_URL."
  );
}

const integrationDescribe = isExplicitlyEnabled ? describe : describe.skip;

integrationDescribe("Supabase PostgreSQL migration connection", () => {
  let client: Client | undefined;

  beforeAll(async () => {
    const connection = new URL(databaseUrl!);
    const [ipv4Host] = await resolve4(connection.hostname);
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
  }, 20_000);

  afterAll(async () => {
    await client?.end();
  });

  it("connects using the server-only Supabase database URL", async () => {
    const result = await client!.query<{ ready: number }>("select 1 as ready");
    expect(result.rows).toEqual([{ ready: 1 }]);
  });
});
