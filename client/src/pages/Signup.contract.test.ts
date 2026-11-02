import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("personal signup contract", () => {
  const signup = read("client/src/pages/Signup.tsx");
  const app = read("client/src/App.tsx");

  it("collects personal details and submits them to Better Auth", () => {
    expect(signup).toContain("firstName: firstName.trim()");
    expect(signup).toContain("lastName: lastName.trim()");
    expect(signup).toContain("phone: phone.trim()");
    expect(signup).not.toContain("registerOwnHotel");
  });

  it("waits at email verification before the dashboard", () => {
    expect(signup).toContain("data.token === null");
    expect(signup).toContain("<CheckEmail email={email}");
    expect(signup).not.toContain("useEffect(() =>");
    expect(signup).toContain("if (data.token === null)");
    expect(signup.indexOf("if (data.token === null)")).toBeLessThan(signup.indexOf('navigate("/dashboard")'));
  });

  it("links the existing terms and privacy pages below submit", () => {
    expect(signup).toContain('href="/terms"');
    expect(signup).toContain('href="/privacy"');
    expect(signup.indexOf('href="/terms"')).toBeGreaterThan(signup.indexOf("type=\"submit\""));
    expect(app).toContain('<Route path="/terms">');
    expect(app).toContain('<Route path="/privacy">');
    expect(signup).not.toContain("type=\"checkbox\"");
  });

  it("routes a personal account to hotel onboarding only after sign-in", () => {
    expect(app).toContain("if (me && !me.roles?.length && !me.role && !me.memberships?.length) return <AccountOnboarding />");
    expect(read("client/src/pages/AccountOnboarding.tsx")).toContain("registerOwnHotel.useMutation()");
  });

  it("permits account setup on the dashboard but keeps other private pages gated", () => {
    const privateRoute = read("client/src/components/auth/PrivateRoute.tsx");
    expect(privateRoute).toContain('location === "/dashboard"');
    expect(privateRoute).toContain("authMe?.memberships?.length === 0");
    expect(privateRoute).not.toContain('location !== "/dashboard" && authRoles.length === 0');
  });
});
