// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { applyPageMeta } from "./pageMeta";

const content = (selector: string) => document.head.querySelector(selector)?.getAttribute("content") ?? null;

afterEach(() => { document.head.innerHTML = ""; document.title = ""; });

describe("applyPageMeta", () => {
  it("sets the hotel's own title and description and restores the site defaults", () => {
    document.head.innerHTML = '<meta name="description" content="site"><meta property="og:title" content="site title"><meta property="og:description" content="site">';
    document.title = "hayhost";

    const restore = applyPageMeta(document, { title: "Baan Suan — Book direct", description: "Garden rooms in Chiang Mai" });

    expect(document.title).toBe("Baan Suan — Book direct");
    expect(content('meta[name="description"]')).toBe("Garden rooms in Chiang Mai");
    expect(content('meta[property="og:title"]')).toBe("Baan Suan — Book direct");
    expect(content('meta[property="og:description"]')).toBe("Garden rooms in Chiang Mai");
    expect(content('meta[name="robots"]')).toBeNull();

    restore();
    expect(document.title).toBe("hayhost");
    expect(content('meta[name="description"]')).toBe("site");
    expect(content('meta[property="og:title"]')).toBe("site title");
    expect(document.head.querySelector('meta[name="robots"]')).toBeNull();
  });

  it("marks an unavailable hotel noindex", () => {
    const restore = applyPageMeta(document, { title: "Hotel unavailable", description: "Not published", noindex: true });
    expect(content('meta[name="robots"]')).toBe("noindex");
    restore();
    expect(document.head.querySelector('meta[name="robots"]')).toBeNull();
  });
});

describe("PublicHotel page metadata", () => {
  const source = readFileSync(resolve(process.cwd(), "client/src/pages/PublicHotel.tsx"), "utf8");

  it("uses the hotel's name and its own copy for the title and description", () => {
    expect(source).toContain('t("publicHotel.metaTitle", { name: metaHotel.name })');
    expect(source).toContain("siteConfigQuery.data?.heroCopy?.trim() ||");
    expect(source).toContain("noindex: true");
  });
});
