import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { getRouteScopeDecision } from "@/lib/routeScope";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("Account (personal information) page contract", () => {
  const app = read("client/src/App.tsx");
  const page = read("client/src/pages/Account.tsx");
  const menu = read("client/src/components/ProfileMenu.tsx");
  const topbar = read("client/src/components/layout/Topbar.tsx");
  const router = read("server/routers/authRouter.ts");

  it("is registered at /settings/account behind sign-in", () => {
    expect(app).toContain('<Route path="/settings/account">');
    expect(app).toContain("<PrivateRoute><Account /></PrivateRoute>");
    expect(app).toContain('const Account = React.lazy(() => import("./pages/Account"));');
  });

  it("is open to every signed-in account, including one with no hotel and any staff role", () => {
    for (const role of ["hotel_owner", "front_desk", "housekeeping", "revenue_manager"] as const) {
      expect(getRouteScopeDecision({ role, pathname: "/settings/account", visibleHotelIds: [] })).toEqual({ allowed: true });
    }
    expect(getRouteScopeDecision({ role: "hotel_owner", pathname: "/settings/account", visibleHotelIds: ["h1"], memberships: [] })).toEqual({ allowed: true });
  });

  it("reads one server query and shows details, sign-in methods, hotels and the plan note", () => {
    expect(page).toContain("trpc.auth.profile.useQuery");
    for (const key of ["account.firstName", "account.lastName", "account.phone", "account.email", "account.signInTitle", "account.hotelsTitle", "account.hotelsNote"]) expect(page).toContain(key);
    expect(page).toContain("planNameKey(hotel.plan)");
    expect(page).toContain("/hotels/${hotel.id}/billing");
  });

  it("follows the house style: shared page classes and no inline styles", () => {
    expect(page).toContain('<section className="page-intro intro-split">');
    expect(page).toContain('<span className="title-mark">.</span>');
    expect(page).toContain("panel-heading");
    expect(page).not.toContain("style={{");
  });

  it("is linked from the profile menu and has a breadcrumb", () => {
    expect(menu).toContain('href="/settings/account"');
    expect(menu).toContain('t("profileMenu.account")');
    expect(topbar).toContain('["/settings/account", "breadcrumb.account"]');
  });

  it("is served by a signed-in-only procedure that takes the account from the session", () => {
    expect(router).toContain("profile: protectedProcedure.query");
    expect(router).toContain("getAccountProfile(ctx.db, ctx.caller ?? { userId: ctx.user.id }, ctx.user.id)");
  });
});
