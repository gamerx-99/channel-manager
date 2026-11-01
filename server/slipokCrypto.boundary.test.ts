import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const serverRoot = dirname(fileURLToPath(import.meta.url));

function sourceFiles(folder: string): string[] {
  return readdirSync(folder, { withFileTypes: true }).flatMap(entry => {
    const path = join(folder, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return entry.isFile() && entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts") ? [path] : [];
  });
}

describe("SlipOK credential crypto import boundary", () => {
  it("allows encrypted-key decryption only in the slip verification procedure", () => {
    const imports = sourceFiles(serverRoot).flatMap(path => {
      const text = readFileSync(path, "utf8");
      return [...text.matchAll(/import\s*\{([^}]+)\}\s*from\s*["'][^"']*slipokCrypto["']/g)].map(match => ({
        file: relative(serverRoot, path).replaceAll("\\", "/"),
        names: match[1]!.split(",").map(name => name.trim().split(/\s+as\s+/)[0]!),
        source: text,
      }));
    });
    expect(imports.map(entry => entry.file).sort()).toEqual(["routers/paymentRouter.ts", "routers/slipokRouter.ts"]);
    expect(imports.find(entry => entry.file === "routers/paymentRouter.ts")?.names).toEqual(["decryptSlipOkKey"]);
    expect(imports.find(entry => entry.file === "routers/slipokRouter.ts")?.names.sort()).toEqual(["encryptSlipOkKey", "hashSlipOkKey"]);

    const decryptReferences = sourceFiles(serverRoot).filter(path => /\bdecryptSlipOkKey\b/.test(readFileSync(path, "utf8")));
    expect(decryptReferences.map(path => relative(serverRoot, path).replaceAll("\\", "/"))).toEqual(["routers/paymentRouter.ts", "slipokCrypto.ts"]);
    const paymentSource = readFileSync(join(serverRoot, "routers/paymentRouter.ts"), "utf8");
    const verificationBody = paymentSource.split("verifySlip:")[1]?.split("manualVerify:")[0] ?? "";
    expect(verificationBody).toContain("decryptSlipOkKey");
  });
});
