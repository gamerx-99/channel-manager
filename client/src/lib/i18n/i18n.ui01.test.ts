import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function nonWebsiteBuilderLines(file: string): string[] {
  const lines = readFileSync(resolve(process.cwd(), file), "utf8").split(/\r?\n/);
  const start = lines.findIndex((l) => /websiteBuilder:\s*\{/.test(l));
  let end = lines.length;
  if (start >= 0) {
    let depth = 0;
    for (let i = start; i < lines.length; i++) {
      depth += (lines[i].match(/\{/g) || []).length - (lines[i].match(/\}/g) || []).length;
      if (i > start && depth === 0) {
        end = i + 1;
        break;
      }
    }
  }
  return lines.filter((_, idx) => idx < start || idx >= end);
}

describe("UI-01 i18n has no developer jargon outside websiteBuilder", () => {
  for (const file of ["client/src/lib/i18n/en.ts", "client/src/lib/i18n/th.ts"]) {
    it(`${file} has no Supabase/RLS in values outside websiteBuilder`, () => {
      const lines = nonWebsiteBuilderLines(file);
      const offenders = lines.filter((l) => /Supabase|RLS/i.test(l));
      expect(offenders).toEqual([]);
    });
  }
});