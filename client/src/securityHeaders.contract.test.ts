import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function parseHeadersFile(content: string): Map<string, Record<string, string>> {
  const blocks = new Map<string, Record<string, string>>();
  let currentPath: string | null = null;

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trimEnd();
    if (!line || line.startsWith("#")) {
      continue;
    }
    if (!line.startsWith(" ") && !line.startsWith("\t")) {
      currentPath = line.trim();
      if (!blocks.has(currentPath)) {
        blocks.set(currentPath, {});
      }
    } else if (currentPath) {
      const trimmed = line.trim();
      const colonIndex = trimmed.indexOf(":");
      if (colonIndex !== -1) {
        const headerName = trimmed.slice(0, colonIndex).trim();
        const headerValue = trimmed.slice(colonIndex + 1).trim();
        blocks.get(currentPath)![headerName] = headerValue;
      }
    }
  }

  return blocks;
}

describe("site-wide security headers contract", () => {
  const filePath = resolve(process.cwd(), "client/public/_headers");
  const rawContent = readFileSync(filePath, "utf8");
  const parsed = parseHeadersFile(rawContent);

  it("defines a site-wide /* block with all required security headers", () => {
    const rootHeaders = parsed.get("/*");
    expect(rootHeaders).toBeDefined();

    expect(rootHeaders?.["Strict-Transport-Security"]).toBe("max-age=31536000; includeSubDomains");
    expect(rootHeaders?.["X-Content-Type-Options"]).toBe("nosniff");
    expect(rootHeaders?.["X-Frame-Options"]).toBe("DENY");
    expect(rootHeaders?.["Referrer-Policy"]).toBe("strict-origin-when-cross-origin");
    expect(rootHeaders?.["Permissions-Policy"]).toBe("camera=(), microphone=(), geolocation=()");
  });

  it("configures Content-Security-Policy as Report-Only with all required app origins", () => {
    const rootHeaders = parsed.get("/*");
    expect(rootHeaders).toBeDefined();

    // Must be report-only; enforcing CSP must not be set
    expect(rootHeaders?.["Content-Security-Policy"]).toBeUndefined();
    const cspReportOnly = rootHeaders?.["Content-Security-Policy-Report-Only"];
    expect(cspReportOnly).toBeDefined();

    // Required external origins and directives
    expect(cspReportOnly).toContain("fonts.googleapis.com");
    expect(cspReportOnly).toContain("fonts.gstatic.com");
    expect(cspReportOnly).toContain("accounts.google.com");
    expect(cspReportOnly).toContain("access.line.me");
    expect(cspReportOnly).toContain("www.facebook.com");
    expect(cspReportOnly).toContain("api.qrserver.com");

    expect(cspReportOnly).toContain("default-src 'self'");
    expect(cspReportOnly).toContain("frame-ancestors 'none'");
    expect(cspReportOnly).toContain("base-uri 'self'");
  });

  it("preserves specific path blocks and their X-Robots-Tag rules", () => {
    const expectedPaths = [
      "https://:worker.lannatc.workers.dev/*",
      "/login",
      "/accept-invite",
      "/forgot-password",
      "/reset-password",
    ];

    for (const path of expectedPaths) {
      const headers = parsed.get(path);
      expect(headers, `Expected headers for path: ${path}`).toBeDefined();
      expect(headers?.["X-Robots-Tag"]).toBe("noindex");
    }
  });
});
