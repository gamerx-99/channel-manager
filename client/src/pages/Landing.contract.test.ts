import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import en from "@/lib/i18n/en";
import th from "@/lib/i18n/th";
import { legalContent } from "@/lib/legalContent";

describe("landing and public signup contract", () => {
  const app = readFileSync(resolve(process.cwd(), "client/src/App.tsx"), "utf8");
  const landing = readFileSync(resolve(process.cwd(), "client/src/pages/Landing.tsx"), "utf8");
  const signup = readFileSync(resolve(process.cwd(), "client/src/pages/Signup.tsx"), "utf8");

  it("serves both pages without a login, ahead of the hotel slug route", () => {
    const slugRoute = app.indexOf('path="/:slug"');
    expect(app).toContain('<Route path="/" component={Landing} />');
    expect(app.indexOf('<Route path="/signup" component={Signup} />')).toBeGreaterThan(-1);
    expect(app.indexOf('<Route path="/signup" component={Signup} />')).toBeLessThan(slugRoute);
    expect(app).not.toContain("<PrivateRoute><Landing");
    expect(app).not.toContain("<PrivateRoute><Signup");
  });

  it("keeps the legal pack's Thai and English in step, without notes for the lawyer", () => {
    for (const kind of ["terms", "privacy", "dpa"] as const) {
      const thai = legalContent.th[kind].sections;
      const english = legalContent.en[kind].sections;
      expect(english.map(section => section.items?.length)).toEqual(thai.map(section => section.items?.length));
      expect(english.map(section => section.table?.rows.length)).toEqual(thai.map(section => section.table?.rows.length));
    }
    const text = JSON.stringify(legalContent);
    expect(text).not.toMatch(/ต้องกรอก|🔴|Supabase|Vercel/);
  });

  it("serves draft terms and privacy pages without a login and links them from the footer", () => {
    const slugRoute = app.indexOf('path="/:slug"');
    const legal = readFileSync(resolve(process.cwd(), "client/src/pages/LegalPage.tsx"), "utf8");
    const hotelRepo = readFileSync(resolve(process.cwd(), "server/d1/hotel.ts"), "utf8");
    for (const path of ["terms", "privacy", "dpa"] as const) {
      expect(app).toContain(`<Route path="/${path}"><LegalPage kind="${path}" /></Route>`);
      expect(app.indexOf(`path="/${path}"`)).toBeLessThan(slugRoute);
      expect(landing).toContain(`<Link href="/${path}">`);
      expect(hotelRepo).toContain(`"${path}"`);
    }
    expect(legal).toContain('data-testid="legal-draft-notice"');
    expect(Object.keys(th.legal).sort()).toEqual(Object.keys(en.legal).sort());
  });

  it("sends visitors to signup and signed-in users to the dashboard", () => {
    expect(landing).toContain('me.data ? "/dashboard" : "/signup"');
    expect(landing).toContain('id="features"');
    expect(landing).toContain('href="/lanna-cozy-demo"');
  });

  it("creates a personal account first and keeps hotel setup for the onboarding step", () => {
    const onboarding = readFileSync(resolve(process.cwd(), "client/src/pages/AccountOnboarding.tsx"), "utf8");
    expect(signup).toContain("authClient.signUp.email");
    expect(signup).not.toContain("registerOwnHotel");
    expect(onboarding).toContain("trpc.channelManager.registerOwnHotel.useMutation");
    expect(onboarding).toContain("onboarding.staffDesc");
    expect(signup).toContain('role="alert"');
  });

  it("does not sell unconfirmed prices, trials or OTA sync, in either language", () => {
    for (const copy of [en.signup, th.signup]) {
      const text = JSON.stringify(copy);
      expect(text).not.toMatch(/฿|baht|บาท|trial|ทดลอง|free|ฟรี|OTA|Agoda|Booking\.com|Airbnb/i);
    }
    // The landing now shows the owner-confirmed Free/Pro prices (2026-11-03), but still no trial and no OTA sync.
    for (const copy of [en.landing, th.landing]) {
      expect(JSON.stringify(copy)).not.toMatch(/trial|ทดลอง|OTA|Agoda|Booking\.com|Airbnb|channel manager/i);
    }
  });
});
