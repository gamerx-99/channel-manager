import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROUTERS_DIR = resolve(process.cwd(), "server/routers");

// Allowlist of router files that still reference Supabase. Each R-ticket removes its own
// entry; once empty the guard becomes a hard fail.
const ALLOWLIST = new Set([
]);

const FORBIDDEN = [/rlsClient\(/, /createSupabaseAdminClient\(/, /from ['"]\.\.\/supabase['"]/, /from ['"]\.\.\/db['"]/, /from ['"]\.\.\/otaSync['"]/, /from ['"]\.\.\/storage['"]/];

describe("no Supabase in routers guard (R0)", () => {
  it("only allowlisted routers reference Supabase", () => {
    const files = readdirSync(ROUTERS_DIR).filter(f => f.endsWith(".ts"));
    const offenders: string[] = [];
    for (const file of files) {
      if (ALLOWLIST.has(file)) continue;
      const content = readFileSync(resolve(ROUTERS_DIR, file), "utf8");
      if (FORBIDDEN.some(rx => rx.test(content))) offenders.push(file);
    }
    expect(offenders).toEqual([]);
  });
});
