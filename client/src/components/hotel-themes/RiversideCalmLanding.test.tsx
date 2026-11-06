import React from "react";
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { bookingPageHref } from "@/components/public-hotel/bookingPageLink";
import RiversideCalmLanding from "./riverside-calm/RiversideCalm";

vi.mock("./ThemeLanding", () => ({ ThemeLanding: ({ children }: { children: React.ReactNode }) => <div className="theme-riverside-calm">{children}</div> }));

describe("Riverside Calm landing", () => {
  it("renders the owner's sections, shared booking links, capped gallery, and Hayhost credit", () => {
    const html = renderToStaticMarkup(<RiversideCalmLanding
      themeId="riverside-calm" hotelName="Haus Nimman" hotel={{ id: "hotel-1", name: "Haus Nimman", slug: "haus-nimman", address: "Ping River" } as any}
      rooms={[] as any} photos={[] as any} contacts={<a href="/contact">Contact desk</a>} map={null} locationMap={<span>Map here</span>}
      bookingLink={(roomTypeId?: string) => bookingPageHref("haus-nimman", roomTypeId)}
      colours={{ buttonBackground: "#0d575a", buttonText: "#ffffff", highlight: "#2f6f73" }}
      roomTypes={[{ id: "room-1", name: "River Room", capacity: 2, basePrice: "1800", amenities: ["Balcony"] }] as any}
      media={[{ url: "/hero.jpg", is_hero: true, objectPosition: "70% 30%" }, ...Array.from({ length: 8 }, (_, i) => ({ id: `p${i}`, url: `/p${i}.jpg`, caption: `Photo ${i}`, objectPosition: "30% 70%" }))] as any}
      heroImage="/hero.jpg" heroCopy="A tranquil stay." language="en" setLanguage={() => {}} isVisible={() => true}
      siteConfig={null} visibleSections={null} t={(key: string) => key === "hotelThemes.riversideCalm.poweredBy" ? "Booking powered by hayhost" : key}
      loading={false} error={null} notFound={false} refetch={async () => ({}) as any}
    />);
    expect(html).toContain("Haus Nimman");
    expect(html).toContain("River Room");
    expect(html).toMatch(/class="room-image-wrap"><img src="\/p0.jpg"/);
    expect(html).toContain("Balcony");
    expect(html).toContain('href="/haus-nimman/book"');
    expect(html).toContain('href="/haus-nimman/book?roomType=room-1"');
    expect(html).toContain("Photo 5");
    expect(html).not.toContain("Photo 6");
    expect(html).toContain("--hero-position:70% 30%");
    expect(html).toContain("--photo-position:30% 70%");
    expect(html).toContain("Contact desk");
    expect(html).toContain("Map here");
    expect(html).toContain('class="powered-by-hayhost"');
  });

  it("omits a hidden gallery and keeps the sticky booking bar mobile-only", () => {
    const html = renderToStaticMarkup(<RiversideCalmLanding {...({
      themeId: "riverside-calm", hotelName: "Haus Nimman", hotel: { slug: "haus-nimman", address: "Ping River" },
      roomTypes: [{ id: "r1", name: "River Room", capacity: 2, basePrice: 1800 }], media: [{ url: "/p0.jpg", caption: "Hidden photo" }],
      bookingLink: () => "/haus-nimman/book", colours: { buttonBackground: "#0d575a", buttonText: "#ffffff", highlight: "#2f6f73" },
      heroCopy: "Quiet", language: "en", setLanguage: () => {}, isVisible: (key: string) => key !== "gallery", t: (key: string) => key,
    } as any)} />);
    expect(html).not.toContain('id="gallery"');
    expect(html).not.toContain('href="#gallery"');
    expect(html).not.toContain("Hidden photo");
    expect(html).toMatch(/class="room-image-wrap"><img src="\/p0.jpg"/);
    const css = readFileSync(new URL("./riverside-calm/riverside-calm.css", import.meta.url), "utf8");
    const baseStickyRule = css.match(/\.theme-riverside-calm \.sticky-bar \{[^}]*\}/)?.[0];
    expect(baseStickyRule).toContain("display: none;");
    expect(baseStickyRule).not.toContain("display: flex;");
    expect(css.split("@media (max-width: 768px)")[0]).not.toContain(".theme-riverside-calm.has-sticky-bar");
    expect(css).toMatch(/@media \(max-width: 768px\) \{\s*\.theme-riverside-calm\.has-sticky-bar \{ padding-bottom: 84px; \}/);
    expect(css).toMatch(/@media \(max-width: 768px\) \{[\s\S]*?\.theme-riverside-calm \.sticky-bar \{[^}]*display: flex;/);
  });
});
