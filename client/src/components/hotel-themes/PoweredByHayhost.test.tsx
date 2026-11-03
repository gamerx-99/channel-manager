import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PoweredByHayhost } from "./PoweredByHayhost";

describe("PoweredByHayhost", () => {
  it("links the hayhost word to the home page and keeps the rest as text", () => {
    const html = renderToStaticMarkup(<PoweredByHayhost label="จองผ่าน hayhost" />);
    expect(html).toContain("จองผ่าน ");
    expect(html).toContain('<a class="powered-by-hayhost" href="https://www.hayhostth.com/" target="_blank" rel="noopener">hayhost</a>');
  });

  it("renders plain text when the label has no hayhost word", () => {
    expect(renderToStaticMarkup(<PoweredByHayhost label="Booking" />)).toBe("<span>Booking</span>");
  });
});
