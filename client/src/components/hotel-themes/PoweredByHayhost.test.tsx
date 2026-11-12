import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PoweredByHayhost } from "./PoweredByHayhost";

describe("PoweredByHayhost", () => {
  it("shows the hayhost logo linked to the home page, named by the label", () => {
    const html = renderToStaticMarkup(<PoweredByHayhost label="จองผ่าน hayhost" />);
    expect(html).toContain('href="https://www.hayhostth.com/"');
    expect(html).toContain('aria-label="จองผ่าน hayhost"');
    expect(html).toContain('src="/logo-wide.png"');
  });

  it("renders plain text when the label has no hayhost word", () => {
    expect(renderToStaticMarkup(<PoweredByHayhost label="Booking" />)).toBe("<span>Booking</span>");
  });
});
