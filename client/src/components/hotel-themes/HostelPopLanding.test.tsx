import React from "react";
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { bookingPageHref } from "@/components/public-hotel/bookingPageLink";
import HostelPopLanding from "./hostel-pop/HostelPop";

vi.mock("./ThemeLanding", () => ({ ThemeLanding: ({ children }: { children: React.ReactNode }) => <div className="theme-hostel-pop">{children}</div> }));

describe("Hostel Pop landing", () => {
  it("renders the owner's sections, shared booking links, capped gallery, and Hayhost credit", () => {
    const html = renderToStaticMarkup(<HostelPopLanding
      themeId="hostel-pop" hotelName="Haus Nimman" hotel={{ id: "hotel-1", name: "Haus Nimman", slug: "haus-nimman", address: "Old City" } as any}
      rooms={[] as any} photos={[] as any} contacts={<a href="/contact">Contact desk</a>} map={null} locationMap={<span>Map here</span>}
      bookingLink={(roomTypeId?: string) => bookingPageHref("haus-nimman", roomTypeId)}
      colours={{ buttonBackground: "#ffd23f", buttonText: "#000000", highlight: "#fd5c8e" }}
      roomTypes={[{ id: "room-1", name: "Garden Pod", capacity: 2, basePrice: "1800", amenities: ["Lockers"] }] as any}
      media={[{ url: "/hero.jpg", is_hero: true, objectPosition: "70% 30%" }, ...Array.from({ length: 8 }, (_, i) => ({ id: `p${i}`, url: `/p${i}.jpg`, caption: `Photo ${i}`, objectPosition: "30% 70%" }))] as any}
      heroImage="/hero.jpg" heroCopy="A lively stay." language="en" setLanguage={() => {}} isVisible={() => true}
      siteConfig={null} visibleSections={null} t={(key: string) => key === "hotelThemes.hostelPop.poweredBy" ? "Booking powered by hayhost" : key}
      loading={false} error={null} notFound={false} refetch={async () => ({}) as any}
    />);
    expect(html).toContain("Haus Nimman");
    expect(html).toContain("Garden Pod");
    expect(html).toContain("Lockers");
    expect(html).toContain('href="/haus-nimman/book"');
    expect(html).toContain('href="/haus-nimman/book?roomType=room-1"');
    expect(html).toContain("Photo 5");
    expect(html).toContain("--hero-position:70% 30%");
    expect(html).toContain("--photo-position:30% 70%");
    expect(html).not.toContain("Photo 6");
    expect(html).toContain("Contact desk");
    expect(html).toContain("Map here");
    expect(html).toContain('class="powered-by-hayhost"');
  });
});
