import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const app = read("client/src/App.tsx");
const page = read("client/src/pages/PublicBooking.tsx");
const hook = read("client/src/components/public-hotel/usePublicBookingPage.ts");

describe("PublicBooking page contract", () => {
  it("registers /:slug/book before the /:slug catch-all, without a sign-in gate", () => {
    const bookRoute = app.indexOf('<Route path="/:slug/book">');
    const hotelRoute = app.indexOf('<Route path="/:slug">');
    expect(bookRoute).toBeGreaterThan(-1);
    expect(hotelRoute).toBeGreaterThan(bookRoute);
    const routeBlock = app.slice(bookRoute, hotelRoute);
    expect(routeBlock).toContain("<PublicBooking slug={params.slug} />");
    expect(routeBlock).not.toContain("PrivateRoute");
  });

  it("loads the hotel through the public hotel hook and has loading, unavailable and error states", () => {
    expect(hook).toContain("usePublicHotelPage(slug)");
    expect(page).toContain("usePublicBookingPage(slug)");
    expect(page).toContain('role="status"');
    expect(page).toContain('data-testid="public-booking-not-found"');
    expect(page).toContain('data-testid="public-booking-load-error"');
    expect(page).toContain("onClick={() => void data.refetch?.()}");
  });

  it("shows the hotel name linking back to the hotel website on an accent-coloured bar", () => {
    expect(hook).toContain("hotelHref: `/${slug}`");
    expect(page).toContain('<a className="booking-page-hotel" href={hotelHref}>{hotel.name}</a>');
    expect(page).toContain('"--booking-page-accent": accentColor');
    const css = read("client/src/components/public-hotel/public-booking-page.css");
    expect(css).toContain("background: var(--booking-page-accent)");
  });

  it("opens with the reassurance banner: both lines, the address and the hotel contacts", () => {
    const banner = read("client/src/components/public-hotel/BookingReassurance.tsx");
    const th = read("client/src/lib/i18n/th.ts");
    expect(th).toContain('bookingWith: "ท่านกำลังจองห้องพักกับ {{name}}"');
    expect(th).toContain('contactDirect: "หากมีข้อสงสัยหรือพบปัญหา ติดต่อที่พักได้โดยตรง"');
    expect(banner).toContain('t("publicBooking.bookingWith", { name: hotelName })');
    expect(banner).toContain('t("publicBooking.contactDirect")');
    expect(banner).toContain("<span>{shownAddress}</span>");
    expect(banner).toContain("<HotelContactsList");
    // The server already leaves out contacts the hotel switched off; the client must not re-check show_*.
    expect(banner).not.toMatch(/show_/);
    expect(page).not.toMatch(/show_/);
    expect(page).toContain("address={hotel.address}");
    expect(page).toContain("lineUrl={hotel.line_url}");
    const main = page.slice(page.indexOf('<main className="booking-page-main">'));
    expect(main.indexOf("<BookingReassurance")).toBeGreaterThan(-1);
  });

  it("runs the existing booking steps under the banner and fills them from the query", () => {
    const main = page.slice(page.indexOf('<main className="booking-page-main">'));
    expect(main.indexOf("<PublicBookingSection page={data} />")).toBeGreaterThan(main.indexOf("<BookingReassurance"));
    expect(hook).toContain("parseBookingPrefill(search");
    expect(hook).toContain("today: getTodayDateString()");
  });

  it("ends with the hayhost credit", () => {
    expect(page).toContain('<PoweredByHayhost label={t("publicBooking.footerBooking")} />');
  });

  it("keeps the look in CSS: inline styles only carry runtime CSS variables", () => {
    const inlineStyles = page.match(/style=\{\{[^}]*\}\}/g) ?? [];
    for (const style of inlineStyles) expect(style).toMatch(/^style=\{\{\s*"--/);
  });
});
