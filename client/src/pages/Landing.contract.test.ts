import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import en from "@/lib/i18n/en";
import th from "@/lib/i18n/th";

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

  it("sends visitors to signup and signed-in users to the dashboard", () => {
    expect(landing).toContain('me.data ? "/dashboard" : "/signup"');
    expect(landing).toContain('href="#features"');
  });

  it("creates the account first and then the hotel on the server", () => {
    expect(signup.indexOf("authClient.signUp.email")).toBeLessThan(signup.indexOf("registerHotel.mutateAsync"));
    expect(signup).toContain("trpc.channelManager.registerOwnHotel.useMutation");
    expect(signup).toContain('role="alert"');
  });

  it("does not sell unconfirmed prices, trials or OTA sync, in either language", () => {
    for (const copy of [en.landing, th.landing, en.signup, th.signup]) {
      const text = JSON.stringify(copy);
      expect(text).not.toMatch(/฿|baht|บาท|trial|ทดลอง|free|ฟรี|OTA|Agoda|Booking\.com|Airbnb/i);
    }
  });
});
