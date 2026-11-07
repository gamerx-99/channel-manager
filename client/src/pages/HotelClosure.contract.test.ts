import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(__dirname, path), "utf8");

describe("hotel closure pages", () => {
  it("registers the status route behind sign-in, before the public slug route", () => {
    const app = read("../App.tsx");
    expect(app).toContain(`<Route path="/hotel-closure">`);
    expect(app.indexOf(`path="/hotel-closure"`)).toBeLessThan(app.indexOf(`path="/:slug"`));
    expect(app).toContain("<PrivateRoute><HotelClosure /></PrivateRoute>");
  });

  it("offers closing only with the owner's permission", () => {
    expect(read("../components/hotel/HotelGeneralOperations.tsx")).toContain("'property.close_hotel'");
    expect(read("../components/hotel/HotelGeneralOperations.tsx")).toContain("canClose && <HotelClosureSettings");
  });

  it("makes the owner choose, and signing in never cancels", () => {
    const page = read("./HotelClosure.tsx");
    expect(page).toContain("hotelClosure.cancel");
    expect(page).toContain("hotelClosure.continue");
    expect(page).toContain("hotel-closure-row");
    expect(read("../components/auth/PrivateRoute.tsx")).toContain("<HotelClosureRedirect />");
    expect(page.slice(page.indexOf("function HotelClosureRedirect"), page.indexOf("export default"))).not.toContain("useMutation");
  });

  it("confirms closure with the hotel name and password", () => {
    const panel = read("../components/HotelClosureSettings.tsx");
    expect(panel).toContain("hotel-closure-confirm");
    expect(panel).toContain(`type="password"`);
    expect(panel).toContain("name.trim() === hotelName.trim()");
  });
});
