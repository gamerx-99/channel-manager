import React from "react";
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import MinimalWhiteLanding from "./MinimalWhiteLanding";

vi.mock("./ThemeLanding", () => ({ ThemeLanding: ({ children }: any) => <div className="theme-minimal-white">{children}</div> }));

describe("Minimal White landing", () => {
  it("renders provided hotel and room data with booking and without never-render content", () => {
    const html = renderToStaticMarkup(<MinimalWhiteLanding
      hotelName="Haus Nimman"
      accentColor="#4f5d48"
      hotel={{ id: "hotel-1", name: "Haus Nimman", slug: "haus-nimman", address: "Nimman Road, Chiang Mai" } as any}
      roomTypes={[{ id: "room-1", name: "Garden Room", capacity: 2, basePrice: 1800 }, { id: "room-2", name: "Loft Room", capacity: 3, basePrice: 2400 }] as any}
      media={[{ url: "/hero.jpg", is_hero: true }, { url: "/room.jpg", caption: "Courtyard" }, { url: "/gallery.jpg", caption: "Morning light" }] as any}
      heroImage="/hero.jpg"
      heroCopy="A quiet place to rest in the heart of Chiang Mai."
      language="en"
      setLanguage={() => {}}
      isVisible={() => true}
      booking={<div id="booking-slot">Booking slot</div>}
      siteConfig={null} visibleSections={null} t={(key: string) => key} loading={false} error={null} notFound={false} refetch={async () => ({}) as any}
    />);

    expect(html).toContain("Haus Nimman");
    expect(html).toContain("Garden Room");
    expect(html).toContain("฿1,800");
    expect(html).toContain("Loft Room");
    expect(html).toContain("฿2,400");
    expect(html).toContain("Room 01");
    expect(html).toContain("Booking slot");
    for (const banned of ["since", "Est.", "concierge", "Amenities", "grayscale", "Instant confirmation", "wire", "reviews", "stars", "WhatsApp", "aria-label=\"line\"", "phone number"]) expect(html.toLowerCase()).not.toContain(banned.toLowerCase());
  });
});
