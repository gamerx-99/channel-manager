import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("support accounts panel contract", () => {
  const panel = readFileSync(resolve(process.cwd(), "client/src/components/SupportAccountsPanel.tsx"), "utf8");
  const page = readFileSync(resolve(process.cwd(), "client/src/pages/AdminUsers.tsx"), "utf8");
  const routeScope = readFileSync(resolve(process.cwd(), "client/src/lib/routeScope.ts"), "utf8");

  it("is rendered on the super-admin-only users page", () => {
    expect(page).toContain("<SupportAccountsPanel />");
    expect(routeScope).toContain('pathname.startsWith("/settings/admin-users")) return "platform.manage_users"');
  });

  it("invites by email, shows acceptance state and can disable an account", () => {
    for (const marker of ["inviteSupportAccount.useMutation", "supportAccounts.useQuery", "disableSupportAccount.useMutation", "adminUsers.supportPending", "adminUsers.supportActive", "adminUsers.supportDisabled", 'type="email"', 'role="alert"', 'role="status"']) expect(panel).toContain(marker);
  });
});
