import { describe, expect, it } from "vitest";
import { escapeHtml } from "./escapeHtml";

describe("escapeHtml", () => {
  it("neutralises markup and attribute breakouts", () => {
    expect(escapeHtml(`<img src=x onerror="alert('1')">&`)).toBe("&lt;img src=x onerror=&quot;alert(&#39;1&#39;)&quot;&gt;&amp;");
  });

  it("renders empty values as empty text and stringifies numbers", () => {
    expect(escapeHtml(null)).toBe("");
    expect(escapeHtml(undefined)).toBe("");
    expect(escapeHtml(42)).toBe("42");
  });
});
