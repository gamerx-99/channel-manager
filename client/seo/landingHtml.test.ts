import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import th from "../src/lib/i18n/th";
import { renderLandingHtml, renderStructuredData } from "./landingHtml";

describe("static landing HTML", () => {
  it("carries the headline, every feature and every FAQ answer", () => {
    const html = renderLandingHtml();

    expect(html).toContain(`<h1>${th.landing.heroHeadline}</h1>`);
    expect(html).toContain(th.landing.featureTm30Title);
    expect(html).toContain(th.landing.faqMoneyA);
  });

  it("escapes copy", () => {
    expect(renderLandingHtml({ ...th.landing, heroHeadline: "<b>x</b>" })).toContain("&lt;b&gt;x&lt;/b&gt;");
  });

  it("publishes parseable JSON-LD that cannot close its script tag", () => {
    const script = renderStructuredData({ ...th.landing, footerTagline: "</script><b>" });
    const json = script.replace(/^<script[^>]*>/, "").replace(/<\/script>$/, "");

    expect(json).not.toContain("</script>");
    const parsed = JSON.parse(json);
    expect(parsed["@graph"].map((node: { "@type": string }) => node["@type"])).toEqual(["Organization", "SoftwareApplication", "FAQPage"]);
    expect(parsed["@graph"][2].mainEntity).toHaveLength(3);
  });
});

describe("index.html crawl contract", () => {
  const html = readFileSync(resolve(process.cwd(), "client/index.html"), "utf8");

  it("declares Thai and shows the static page only on the landing route", () => {
    expect(html).toContain('<html lang="th">');
    expect(html).toContain("<!--static-landing-->");
    expect(html).toContain("<!--structured-data-->");
    expect(html.indexOf('location.pathname !== "/"')).toBeLessThan(html.indexOf("<!--static-landing-->"));
  });

  it("keeps structured data inside root so React removes it on hotel pages", () => {
    expect(html).toContain('<div id="root"><!--static-landing--><!--structured-data--></div>');
  });
});
