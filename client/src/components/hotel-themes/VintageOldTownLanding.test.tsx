import React from "react";
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { bookingPageHref } from "@/components/public-hotel/bookingPageLink";
import VintageOldTownLanding from "./vintage-old-town/VintageOldTown";

vi.mock("./ThemeLanding", () => ({ ThemeLanding: ({ children }: { children: React.ReactNode }) => <div className="theme-vintage-old-town">{children}</div> }));

const base = {
  themeId: "vintage-old-town", hotelName: "Haus Nimman",
  hotel: { id: "hotel-1", name: "Haus Nimman", slug: "haus-nimman", address: "42 Example Road" },
  rooms: [], photos: [], contacts: <a href="/contact">Contact desk</a>, map: null, locationMap: <span>Map here</span>,
  bookingLink: (roomTypeId?: string) => bookingPageHref("haus-nimman", roomTypeId),
  colours: { buttonBackground: "#c2562e", buttonText: "#ffffff", highlight: "#2e7c7a" },
  roomTypes: [{ id: "room-1", name: "Standard Room", capacity: 2, basePrice: "1800", description: "A room", amenities: ["Desk"] }],
  media: [{ url: "/hero.jpg", is_hero: true, objectPosition: "70% 30%" }, ...Array.from({ length: 8 }, (_, i) => ({ id: `p${i}`, url: `/p${i}.jpg`, caption: `Photo ${i}`, objectPosition: "30% 70%" }))],
  heroImage: "/hero.jpg", heroCopy: "A restful stay.", language: "en", setLanguage: () => {},
  isVisible: () => true, siteConfig: null, visibleSections: null,
  t: (key: string) => key === "hotelThemes.vintageOldTown.poweredBy" ? "Booking powered by hayhost" : key,
  loading: false, error: null, notFound: false, refetch: async () => ({}),
} as any;

describe("Vintage Old Town landing", () => {
  it("renders hotel-owned data, shared booking links, capped photos and footer credit", () => {
    const html = renderToStaticMarkup(<VintageOldTownLanding {...base} />);
    expect(html).toContain("Haus Nimman");
    expect(html).toContain("42 Example Road");
    expect(html).toContain("Standard Room");
    expect(html).toContain("1,800");
    expect(html).toContain("Desk");
    expect(html).toContain('href="/haus-nimman/book"');
    expect(html).toContain('href="/haus-nimman/book?roomType=room-1"');
    expect(html).toContain("Photo 5");
    expect(html).not.toContain("Photo 6");
    expect(html).toContain("--photo-position:30% 70%");
    expect(html).toContain("Contact desk");
    expect(html).toContain("Map here");
    expect(html).toContain('class="powered-by-hayhost"');
    for (const fact of ["1962", "Chong Kham", "Mae Hong Son", "SIAM", "Town centre", "shophouse", "teak"]) expect(html).not.toContain(fact);
  });

  it("respects section visibility and only shows the sticky booking bar on phones", () => {
    const html = renderToStaticMarkup(<VintageOldTownLanding {...base} isVisible={(key: string) => key !== "gallery" && key !== "booking"} />);
    expect(html).not.toContain('id="gallery"');
    expect(html).not.toContain('href="#gallery"');
    expect(html).not.toContain('href="/haus-nimman/book"');
    const css = readFileSync(new URL("./vintage-old-town/vintage-old-town.css", import.meta.url), "utf8");
    expect(css.match(/\.theme-vintage-old-town \.sticky-bar \{[^}]*\}/)?.[0]).toContain("display: none;");
    expect(css).toMatch(/@media \(max-width: 768px\)[\s\S]*\.theme-vintage-old-town \.sticky-bar \{[^}]*display: flex;/);
  });
});

