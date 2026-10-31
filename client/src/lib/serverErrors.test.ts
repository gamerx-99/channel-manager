import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { localizeServerMessage } from "./serverErrors";
import { en, th } from "./i18n";

describe("localizeServerMessage", () => {
  it("shows known server errors in Thai", () => {
    expect(localizeServerMessage("Hotel access denied.", "th")).toBe("คุณไม่มีสิทธิ์ทำรายการนี้ในที่พักนี้");
    expect(localizeServerMessage("This hotel has not configured PromptPay. Please contact the hotel directly.", "th")).toBe(th.serverErrors.promptPayMissing);
  });

  it("leaves English and unknown messages as they are", () => {
    expect(localizeServerMessage("Hotel access denied.", "en")).toBe("Hotel access denied.");
    expect(localizeServerMessage("Something new went wrong.", "th")).toBe("Something new went wrong.");
  });

  it("has a Thai text for every entry, different from the English", () => {
    for (const [key, text] of Object.entries(en.serverErrors)) {
      expect(th.serverErrors[key as keyof typeof th.serverErrors]).not.toBe(text);
    }
  });
});

describe("serverErrors dictionary", () => {
  const files = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return files(path);
    return /\.ts$/.test(entry.name) && !/\.test\.ts$/.test(entry.name) ? [path] : [];
  });
  const source = [...files(resolve(process.cwd(), "server")), ...files(resolve(process.cwd(), "worker"))].map(file => readFileSync(file, "utf8")).join("\n");

  it("only lists messages the server really sends", () => {
    const missing = Object.values(en.serverErrors).filter(text => !source.includes(text));
    expect(missing).toEqual([]);
  });
});
