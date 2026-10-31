import { describe, expect, it } from "vitest";
import { buildTm30PrintHtml } from "./tm30Print";

const PAYLOAD = `<img src=x onerror=alert(1)>`;

describe("buildTm30PrintHtml", () => {
  it("escapes guest, header and hotel values so a booking cannot run script", () => {
    const html = buildTm30PrintHtml(PAYLOAD, [PAYLOAD], [[PAYLOAD, "</td><script>alert(2)</script>"]], "now");

    expect(html).not.toContain("<img");
    expect(html).not.toContain("<script>alert(2)");
    expect(html).toContain("&lt;img src=x onerror=alert(1)&gt;");
  });

  it("keeps the print script and the empty state", () => {
    const html = buildTm30PrintHtml("Hotel", ["A\nB"], [], "now");

    expect(html).toContain("<script>window.print();</script>");
    expect(html).toContain("<th>A B</th>");
    expect(html).toContain("No records");
  });
});
