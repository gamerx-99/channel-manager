import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { HOTEL_THEMES } from "@shared/hotelThemes";

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

  it("shows the hotel name linking back to the hotel website on the theme-coloured bar", () => {
    expect(hook).toContain("hotelHref: `/${slug}`");
    expect(page).toContain('<a className="booking-page-hotel" href={hotelHref}>{hotel.name}</a>');
    expect(page).toContain('"--booking-page-accent": accentColor');
    const css = read("client/src/components/public-hotel/public-booking-page.css");
    expect(css).toContain("background: var(--booking-page-accent)");
  });

  it("opens the booking steps without a reassurance box", () => {
    expect(page).not.toContain("BookingReassurance");
    expect(page).not.toContain("booking-reassurance");
    expect(page).toContain("{data.prefillReady && <PublicBookingSection page={data} />}");
  });

  it("fills the existing booking steps from the query", () => {
    expect(hook).toContain("parseBookingPrefill(search");
    expect(hook).toContain("today: getTodayDateString()");
  });

  it("ends with the hotel name and a linked hayhost logo", () => {
    expect(page).toContain("<span>{hotel.name}</span>");
    expect(page).toContain('href="https://www.hayhostth.com/" target="_blank" rel="noopener"');
    expect(page).toContain('<img src="/logo-wide.png" alt={t("publicBooking.footerLogoAlt")} />');
  });

  it("keeps the look in CSS: inline styles only carry runtime CSS variables", () => {
    const inlineStyles = page.match(/style=\{\{[^}]*\}\}/g) ?? [];
    for (const style of inlineStyles) expect(style).toMatch(/^style=\{\{\s*"--/);
  });

  it("defines the complete booking token set for every registered hotel theme", () => {
    const css = read("client/src/components/public-hotel/booking-themes.css");
    const tokens = ["page", "surface", "card", "ink", "muted", "border", "border-width", "radius", "heading", "body", "button", "button-text", "button-radius", "button-shadow", "selected", "selected-text", "header", "header-ink"];
    for (const { id } of HOTEL_THEMES) {
      const block = css.match(new RegExp(`\\.booking-page\\[data-booking-theme="${id}"\\]\\s*\\{([^}]*)\\}`))?.[1];
      expect(block, `${id} booking tokens`).toBeTruthy();
      for (const token of tokens) expect(block, `${id}: --bt-${token}`).toContain(`--bt-${token}:`);
    }
    expect(page).toContain('data-booking-theme={bookingTheme ?? "default"}');
  });
});
