import React from "react";
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { bookingPageHref } from "@/components/public-hotel/bookingPageLink";
import LannaTeakLanding from "./lanna-teak/LannaTeak";

vi.mock("./ThemeLanding", () => ({ ThemeLanding: ({ children }: any) => <div className="theme-lanna-teak">{children}</div> }));

describe("Lanna Teak landing", () => {
  it("renders the no-photo hero with its hotel name and styled placeholder layers", () => {
    const hotelName = "บ้านไม้สักริมแม่น้ำเชียงใหม่ รีสอร์ทแอนด์สปา";
    const html = renderToStaticMarkup(<LannaTeakLanding
      bookingLink={() => "/baan-mai-sak/book"}
      themeId="lanna-teak"
      rooms={[] as any}
      photos={[] as any}
      contacts={null}
      map={null}
      locationMap={null}
      colours={{ buttonBackground: "#123456", buttonText: "#ffffff", highlight: "#654321" }}
      hotelName={hotelName}
      hotel={{ id: "hotel-1", name: hotelName, slug: "baan-mai-sak", address: "" } as any}
      roomTypes={[] as any}
      media={[] as any}
      heroImage={undefined}
      heroCopy="พักผ่อนท่ามกลางธรรมชาติ"
      language="th"
      setLanguage={() => {}}
      isVisible={() => true}
      siteConfig={null} visibleSections={null} t={(key: string) => key} loading={false} error={null} notFound={false} refetch={async () => ({}) as any}
    />);

    expect(html).toMatch(/<section class="lanna-hero">[\s\S]*<div class="lanna-hero-frame lanna-hero-frame--placeholder">/);
    expect(html).toContain('<div class="lanna-hero-placeholder"></div>');
    expect(html).toMatch(new RegExp(`<div class="lanna-hero-text">[\\s\\S]*?<h1>${hotelName}</h1>`));
    expect(html).toContain('class="lanna-hero-cta theme-book-button"');
    expect(html).not.toContain('class="lanna-hero-img"');

    const css = ["themes.css", "lanna-teak/lanna-teak.css"]
      .map(file => readFileSync(resolve(process.cwd(), "client/src/components/hotel-themes", file), "utf8"))
      .join("\n");
    expect(css).toMatch(/\.theme-lanna-teak \.lanna-hero-frame\s*\{/);
    for (const className of ["lanna-hero-placeholder", "lanna-hero-overlay", "lanna-hero-text"]) {
      expect(css).toMatch(new RegExp(`\\.theme-lanna-teak \\.lanna-hero \\.lanna-hero-frame--placeholder \\.${className}\\s*\\{`));
    }
  });

  it("keeps placeholder text contrast, word wrapping, and mobile navigation independent of CSS order", () => {
    const shared = readFileSync(resolve(process.cwd(), "client/src/components/hotel-themes/themes.css"), "utf8");
    const local = readFileSync(resolve(process.cwd(), "client/src/components/hotel-themes/lanna-teak/lanna-teak.css"), "utf8");
    const rule = (selector: string) => {
      const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      return local.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`))?.[1] ?? "";
    };
    const placeholder = ".theme-lanna-teak .lanna-hero .lanna-hero-frame--placeholder";

    expect(shared).toContain(".theme-lanna-teak .lanna-hero .lanna-kicker{color:#f0d9b0}");
    expect(rule(`${placeholder} .lanna-kicker`)).toContain("color: var(--t-primary)");
    for (const selector of [`${placeholder} h1`, `${placeholder} .lanna-hero-text p`]) {
      expect(rule(selector)).toContain("color: var(--t-primary)");
      expect(rule(selector)).toContain("overflow-wrap: break-word");
    }
    expect(rule(`${placeholder} .lanna-hero-cta`)).toContain("background: var(--t-primary)");
    expect(rule(`${placeholder} .lanna-hero-cta`)).toContain("color: var(--t-on-primary)");
    expect(local).not.toMatch(/overflow-wrap:\s*anywhere/);

    const primary = shared.match(/\.theme-lanna-teak\{[^}]*--t-primary:(#[0-9a-f]{6})/)?.[1];
    expect(primary).toBeDefined();
    const luminance = (hex: string) => {
      const channels = hex.match(/[0-9a-f]{2}/gi)!.map(channel => {
        const value = parseInt(channel, 16) / 255;
        return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
      });
      return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
    };
    // The darkest gradient stop is the lowest-contrast part of this light placeholder.
    expect((luminance("c4aa98") + 0.05) / (luminance(primary!.slice(1)) + 0.05)).toBeGreaterThanOrEqual(4.5);

    const mobile = local.split("@media (max-width: 760px)")[1];
    expect(mobile).toContain("grid-template-columns: minmax(0, 1fr) auto");
    expect(rule(".theme-lanna-teak .lanna-header .lanna-mark")).toContain("-webkit-line-clamp: 2");
    expect(mobile).toContain("overflow-x: auto");
    expect(mobile).toContain("white-space: nowrap");
    expect(mobile).toContain(".theme-lanna-teak .lanna-page .lanna-header nav a:nth-child(2)");
  });

  it("renders hotel and room data with links to the booking page and no forbidden content", () => {
    const html = renderToStaticMarkup(<LannaTeakLanding
      bookingLink={(roomTypeId?: string) => bookingPageHref("baan-mai-sak", roomTypeId)}
      themeId="lanna-teak"
      rooms={[] as any}
      photos={[] as any}
      contacts={null}
      map={null}
      locationMap={null}
      colours={{ buttonBackground: "#123456", buttonText: "#ffffff", highlight: "#654321" }}
      hotelName="Baan Mai Sak"
      hotel={{ id: "hotel-1", name: "Baan Mai Sak", slug: "baan-mai-sak", address: "12 River Road" } as any}
      roomTypes={[{ id: "room-1", name: "Teak Suite", capacity: 2, basePrice: 3200 }, { id: "room-2", name: "Garden Room", capacity: 3, basePrice: 2800 }] as any}
      media={[{ url: "/hero.jpg", is_hero: true }, { url: "/room.jpg", caption: "Teak room" }, { url: "/legacy-file.jpg", caption: null }] as any}
      heroImage="/hero.jpg"
      heroCopy="A quiet stay surrounded by northern Thai craft and gardens."
      language="en"
      setLanguage={() => {}}
      isVisible={() => true}
      siteConfig={null} visibleSections={null} t={(key: string) => key} loading={false} error={null} notFound={false} refetch={async () => ({}) as any}
    />);

    expect(html).toContain("Baan Mai Sak");
    expect(html).toContain("Teak Suite");
    expect(html).toContain("฿3,200");
    expect(html).toContain("Garden Room");
    expect(html).toContain("฿2,800");
    // The booking steps moved to the hayhost booking page; the theme links there instead.
    expect(html).toContain('class="lanna-reserve theme-book-button" href="/baan-mai-sak/book"');
    expect(html).toContain('class="lanna-hero-cta theme-book-button" href="/baan-mai-sak/book"');
    expect(html).toContain('class="lanna-hero-frame"');
    expect(html).not.toContain("lanna-hero-frame--placeholder");
    expect(html).toContain('href="/baan-mai-sak/book?roomType=room-1"');
    expect(html).toContain('href="/baan-mai-sak/book?roomType=room-2"');
    expect(html).not.toContain('href="#book"');
    expect(html).toContain("Teak room");
    expect(html).not.toContain("room.jpg</figcaption>");
    expect(html).not.toContain("<figcaption>legacy-file.jpg</figcaption>");
    for (const banned of ["since", "Est.", "concierge", "Amenities", "grayscale", "Instant confirmation", "wire", "reviews", "stars"]) expect(html.toLowerCase()).not.toContain(banned.toLowerCase());
  });
});
