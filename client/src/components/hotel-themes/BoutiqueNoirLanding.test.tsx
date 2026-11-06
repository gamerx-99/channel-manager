import React from "react";
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { bookingPageHref } from "@/components/public-hotel/bookingPageLink";
import BoutiqueNoirLanding from "./boutique-noir/BoutiqueNoir";

vi.mock("./ThemeLanding", () => ({ ThemeLanding: ({ children }: any) => <div className="theme-boutique-noir">{children}</div> }));

describe("Boutique Noir landing", () => {
  it("renders the owner's editorial sections, shared booking links, capped gallery, and Hayhost credit", () => {
    const html = renderToStaticMarkup(<BoutiqueNoirLanding
      themeId="boutique-noir" hotelName="Haus Nimman" hotel={{ id: "hotel-1", name: "Haus Nimman", slug: "haus-nimman", address: "Old City" } as any}
      rooms={[] as any} photos={[] as any} contacts={null} map={null} locationMap={null}
      bookingLink={(roomTypeId?: string) => bookingPageHref("haus-nimman", roomTypeId)}
      colours={{ buttonBackground: "#b8955a", buttonText: "#141414", highlight: "#e7c182" }}
      roomTypes={[{ id: "room-1", name: "Garden Room", capacity: 2, basePrice: "1800", amenities: ["Garden"] }] as any}
      media={[{ url: "/hero.jpg", is_hero: true }, ...Array.from({ length: 8 }, (_, i) => ({ id: `p${i}`, url: `/p${i}.jpg`, caption: `Photo ${i}` }))] as any}
      heroImage="/hero.jpg" heroCopy="A quiet place to rest." language="en" setLanguage={() => {}} isVisible={() => true}
      siteConfig={null} visibleSections={null} t={(key: string) => key === "hotelThemes.boutiqueNoir.poweredBy" ? "Booking powered by hayhost" : key}
      loading={false} error={null} notFound={false} refetch={async () => ({}) as any}
    />);
    expect(html).toContain("Haus Nimman");
    expect(html).toContain("Garden Room");
    expect(html).toContain('href="/haus-nimman/book?roomType=room-1"');
    expect(html).toContain("Photo 5");
    expect(html).not.toContain("Photo 6");
    expect(html).toContain('class="powered-by-hayhost"');
  });
});
