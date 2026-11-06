import React from "react";
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import CafeHomestayLanding from "./CafeHomestayLanding";

vi.mock("./ThemeLanding", () => ({ ThemeLanding: ({ children }: any) => <div className="theme-cafe-homestay">{children}</div> }));

describe("Cafe Homestay landing", () => {
  it("renders hotel and room data with links to the booking page and no forbidden content", () => {
    const html = renderToStaticMarkup(<CafeHomestayLanding
      hotelName="Nap & Latte Homestay"
      accentColor="#a45b3f"
      hotel={{ id: "hotel-1", name: "Nap & Latte Homestay", slug: "nap-latte", address: "Pai, Thailand" } as any}
      roomTypes={[{ id: "room-1", name: "Garden Room", capacity: 2, basePrice: 1800 }, { id: "room-2", name: "Loft Room", capacity: 3, basePrice: 2400 }] as any}
      media={[{ url: "/hero.jpg", is_hero: true }, { url: "/room.jpg", caption: "Garden" }, { url: "/gallery.jpg", caption: "Morning coffee" }, { url: "/legacy-file.jpg", caption: null }] as any}
      heroImage="/hero.jpg"
      heroCopy="A quiet homestay with a small cafe and garden."
      language="en"
      setLanguage={() => {}}
      isVisible={() => true}
      siteConfig={null} visibleSections={null} t={(key: string) => key} loading={false} error={null} notFound={false} refetch={async () => ({}) as any}
    />);

    expect(html).toContain("Nap &amp; Latte Homestay");
    expect(html).toContain("Garden Room");
    expect(html).toContain("฿1,800");
    expect(html).toContain("Loft Room");
    expect(html).toContain("฿2,400");
    // The booking steps moved to the hayhost booking page; the theme links there instead.
    expect(html).toContain('class="theme-book-button" href="/nap-latte/book"');
    expect(html).toContain('href="/nap-latte/book?roomType=room-1"');
    expect(html).toContain('href="/nap-latte/book?roomType=room-2"');
    expect(html).toContain("Morning coffee");
    expect(html).not.toContain("gallery.jpg</figcaption>");
    expect(html).not.toContain("<figcaption>legacy-file.jpg</figcaption>");
    for (const banned of ["since", "Est.", "concierge", "Amenities", "grayscale", "Instant confirmation", "wire", "reviews", "stars", "WhatsApp", "aria-label=\"line\"", "phone number"]) expect(html.toLowerCase()).not.toContain(banned.toLowerCase());
  });
});
