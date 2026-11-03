import React from "react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import Landing from "./Landing";

vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ language: "th", toggleLanguage: vi.fn() }) }));
vi.mock("@/lib/trpc", () => ({ trpc: { auth: { me: { useQuery: () => ({ data: null }) } } } }));
vi.mock("wouter", () => ({ Link: ({ href, children, ...props }: React.PropsWithChildren<{href:string}>) => <a href={href} {...props}>{children}</a> }));
vi.mock("@/components/hotel-themes/TemplateCardPreview", () => ({ default: () => <div className="template-card-preview" /> }));

describe("landing marketing contract", () => {
  const html = renderToStaticMarkup(<Landing />);
  it("renders the ten requested sections in order", () => {
    const ids = ["landing-main", "templates", "how", "features", "pricing", "faq"];
    for (const id of ids) expect(html).toContain(`id="${id}"`);
    expect(html).toContain("<header class=\"landing-nav\">");
    expect(html).toContain("<footer class=\"landing-footer\">");
    expect((html.match(/<section\b/g) ?? []).length).toBe(8); // Hero, value cards, templates, steps, features, pricing, FAQ and CTA.
    expect(html.indexOf("landing-section-hero")).toBeLessThan(html.indexOf("landing-values"));
    expect(html.indexOf("landing-values")).toBeLessThan(html.indexOf("id=\"templates\""));
    expect(html.indexOf("id=\"templates\"")).toBeLessThan(html.indexOf("id=\"how\""));
    expect(html.indexOf("id=\"how\"")).toBeLessThan(html.indexOf("id=\"features\""));
    expect(html.indexOf("id=\"features\"")).toBeLessThan(html.indexOf("id=\"pricing\""));
    expect(html.indexOf("id=\"pricing\"")).toBeLessThan(html.indexOf("id=\"faq\""));
    expect(html.indexOf("id=\"faq\"")).toBeLessThan(html.indexOf("landing-cta"));
  });
  it("keeps pricing claims accurate and avoids minute-count claims", () => {
    const pricing = html.slice(html.indexOf("id=\"pricing\""), html.indexOf("id=\"faq\""));
    expect(pricing).toContain("299");
    expect(pricing).not.toContain("ไม่จำกัด");
    expect(pricing).not.toContain("ไม่จำกัดจำนวนห้อง");
    expect(html).not.toMatch(/\b\d+\s*(?:นาที|minutes?)\b/i);
  });
  it("computes the displayed footer year from the current date", () => {
    expect(html).toContain(`© ${new Date().getFullYear()} hayhost`);
    expect(readFileSync(resolve(process.cwd(), "client/src/pages/Landing.tsx"), "utf8")).toContain("new Date().getFullYear()");
  });
  it("keeps the static crawler landing aligned with the React section and pricing content", () => {
    const staticHtml = readFileSync(resolve(process.cwd(), "client/index.html"), "utf8");
    expect((staticHtml.match(/<section\b/g) ?? []).length).toBe(8);
    for (const marker of ["เว็บไซต์รับจองของที่พักคุณ พร้อมหลังบ้านในที่เดียว", "299", "/terms", "/privacy", "/dpa", "contact@hayhostth.com"]) {
      expect(staticHtml).toContain(marker);
    }
    expect(staticHtml).toContain("new Date().getFullYear()");
  });
});

