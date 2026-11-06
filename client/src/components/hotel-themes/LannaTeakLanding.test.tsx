import React from "react";
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import LannaTeakLanding from "./LannaTeakLanding";

vi.mock("./ThemeLanding", () => ({ ThemeLanding: ({ children }: any) => <div className="theme-lanna-teak">{children}</div> }));

describe("Lanna Teak landing", () => {
  it("renders hotel and room data with links to the booking page and no forbidden content", () => {
    const html = renderToStaticMarkup(<LannaTeakLanding
      hotelName="Baan Mai Sak"
      accentColor="#aa342d"
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
    expect(html).toContain('href="/baan-mai-sak/book?roomType=room-1"');
    expect(html).toContain('href="/baan-mai-sak/book?roomType=room-2"');
    expect(html).not.toContain('href="#book"');
    expect(html).toContain("Teak room");
    expect(html).not.toContain("room.jpg</figcaption>");
    expect(html).not.toContain("<figcaption>legacy-file.jpg</figcaption>");
    for (const banned of ["since", "Est.", "concierge", "Amenities", "grayscale", "Instant confirmation", "wire", "reviews", "stars"]) expect(html.toLowerCase()).not.toContain(banned.toLowerCase());
  });
});
