import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

function sourceFiles(folder: string): string[] {
  return readdirSync(folder, { withFileTypes: true }).flatMap(entry => {
    const path = join(folder, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return entry.isFile() && /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [path] : [];
  });
}

const files = ["server", "worker", "client/src", "shared"].flatMap(folder => sourceFiles(join(repoRoot, folder)));

// Spec 14-05: one central SlipOK account. Hotels never enter keys, so nothing
// may read or write the per-hotel key columns (kept in the schema only).
describe("central SlipOK boundary", () => {
  it("no application code touches the per-hotel SlipOK key columns", () => {
    const offenders = files.filter(path => /slipokKeyEnc|slipokKeyHash|slipokBranchId|slipok_key_enc|slipok_branch_id/.test(readFileSync(path, "utf8")));
    expect(offenders.map(path => relative(repoRoot, path))).toEqual([]);
  });

  it("reads the key only from the central secrets, never SLIP_OK_API", () => {
    const readers = files.filter(path => /SLIPOK_API_KEY|SLIPOK_BRANCH_ID/.test(readFileSync(path, "utf8")));
    expect(readers.map(path => relative(repoRoot, path).replaceAll("\\", "/"))).toEqual(["server/slipVerification.ts"]);
    expect(files.filter(path => /SLIP_OK_API|SLIP_APIKEY/.test(readFileSync(path, "utf8")))).toEqual([]);
  });

  it("removes the hotel key procedures but keeps savePromptPayId", async () => {
    const { slipokRouter } = await import("./routers/slipokRouter");
    expect(Object.keys(slipokRouter._def.procedures)).toEqual(["savePromptPayId"]);
  });
});
