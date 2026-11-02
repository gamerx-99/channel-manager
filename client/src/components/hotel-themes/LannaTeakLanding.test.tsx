import React from "react";
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import LannaTeakLanding from "./LannaTeakLanding";

vi.mock("./ThemeLanding", () => ({ ThemeLanding: ({ children }: any) => <div className="theme-lanna-teak">{children}</div> }));

describe("Lanna Teak landing", () => {
  it("renders hotel and room data with the booking slot and no forbidden content", () => {
    const html = renderToStaticMarkup(<LannaTeakLanding
      hotelName="Baan Mai Sak"
      accentColor="#aa342d"
      hotel={{ id: "hotel-1", name: "Baan Mai Sak", slug: "baan-mai-sak", address: "Lamphun, Thailand" } as any}
      roomTypes={[{ id: "room-1", name: "Teak Suite", capacity: 2, basePrice: 3200 }, { id: "room-2", name: "Garden Room", capacity: 3, basePrice: 2800 }] as any}
      media={[{ url: "/hero.jpg", is_hero: true }, { url: "/room.jpg", caption: "Teak room" }] as any}
      heroImage="/hero.jpg"
      heroCopy="A quiet stay surrounded by northern Thai craft and gardens."
      language="en"
      setLanguage={() => {}}
      isVisible={() => true}
      booking={<div id="booking-slot">Booking slot</div>}
      siteConfig={null} visibleSections={null} t={(key: string) => key} loading={false} error={null} notFound={false} refetch={async () => ({}) as any}
    />);

    expect(html).toContain("Baan Mai Sak");
    expect(html).toContain("Teak Suite");
    expect(html).toContain("฿3,200");
    expect(html).toContain("Garden Room");
    expect(html).toContain("฿2,800");
    expect(html).toContain("Booking slot");
    for (const banned of ["since", "Est.", "concierge", "Amenities", "grayscale", "Instant confirmation", "wire", "reviews", "stars"]) expect(html.toLowerCase()).not.toContain(banned.toLowerCase());
  });
});
