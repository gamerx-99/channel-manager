import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { en, th } from "@/lib/i18n";

describe("Account deletion contract", () => {
  const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
  const page = read("client/src/pages/SecuritySettings.tsx");
  const panel = read("client/src/components/DeleteAccountSettings.tsx");
  const app = read("client/src/App.tsx");
  const routeScope = read("client/src/lib/routeScope.ts");

  it("shows the panel on the security page, open to every signed-in role", () => {
    expect(page).toContain("<DeleteAccountSettings />");
    expect(app).toContain('path="/settings/security"');
    expect(app).toContain("<PrivateRoute><SecuritySettings /></PrivateRoute>");
    expect(routeScope).toContain("Dashboard and security are entry surfaces");
  });

  it("warns, then needs a separate confirm step", () => {
    expect(panel).toContain('t("accountDeletion.warning")');
    expect(panel).toContain('t("accountDeletion.staysRecords")');
    expect(panel).toContain("setConfirming(true)");
    expect(panel).toContain('data-testid="delete-account-confirm"');
  });

  it("collects the email, the password and, with 2FA on, an authenticator code", () => {
    expect(panel).toContain('type="password"');
    expect(panel).toContain('autoComplete="one-time-code"');
    expect(panel).toContain("trpc.auth.verifyMfaStepUp.useMutation()");
    expect(panel).toContain("deleteAccount.mutateAsync({ password, confirmEmail: email })");
  });

  it("hides the form from blocked accounts and links owners to their staff page", () => {
    expect(panel).toContain("status.isSuccess && !blocked && confirming");
    expect(panel).toContain('data-testid="delete-account-blocked"');
    expect(panel).toContain("/hotels/${hotel.id}/staff");
    expect(panel).toContain('data-testid="delete-account-last-admin"');
  });

  it("signs out and leaves after success", () => {
    expect(panel).toContain("await signOutCurrentSession()");
    expect(panel).toContain("queryClient.clear()");
    expect(panel).toContain('window.location.assign("/login")');
  });

  it("uses no hard-coded text for the words people read", () => {
    expect(panel).not.toMatch(/(?<!=)>\s*[A-Za-zก-๙][^<{}]*</);
  });

  it("has every message in Thai and English", () => {
    expect(Object.keys(th.accountDeletion).sort()).toEqual(Object.keys(en.accountDeletion).sort());
    for (const key of Object.keys(en.accountDeletion) as Array<keyof typeof en.accountDeletion>) {
      expect(panel + read("client/src/pages/HotelStaff.tsx")).toContain(`accountDeletion.${key}`);
      expect(th.accountDeletion[key]).not.toBe(en.accountDeletion[key]);
    }
  });

  it("labels the deleted-person marker wherever a person's id is shown", () => {
    for (const path of ["client/src/pages/HotelStaff.tsx", "client/src/pages/SupportAccess.tsx", "client/src/pages/Communications.tsx"]) {
      const source = read(path);
      expect(source).toContain("DELETED_USER_ID");
      expect(source).toContain('t("accountDeletion.deletedUser")');
    }
  });
});
