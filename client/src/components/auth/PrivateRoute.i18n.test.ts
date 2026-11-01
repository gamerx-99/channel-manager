import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { th } from "@/lib/i18n";

describe("access restricted page text", () => {
  it("comes from the dictionaries, so Thai users read Thai (regression: always English)", () => {
    const source = readFileSync(new URL("./PrivateRoute.tsx", import.meta.url), "utf8");
    expect(source).not.toMatch(/>Access restricted<|"Return to dashboard"|>Return to dashboard</);
    expect(source).toContain('t("accessRestricted.title")');
    expect(th.accessRestricted.title).toBe("ไม่มีสิทธิ์เข้าถึง");
  });
});
