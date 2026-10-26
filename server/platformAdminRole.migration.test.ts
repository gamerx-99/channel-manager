import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { CROSS_HOTEL_READ_ROLES } from "@shared/authorization";

const root = process.cwd();
const migration = readFileSync(resolve(root, "20260824_add_admin_role_and_platform_admin.sql"), "utf8");
const baseline = readFileSync(resolve(root, "supabase_migration_production.sql"), "utf8");
/** Comment lines carry the rollback script and rationale; only executable SQL is the contract. */
const executable = migration.split(/\r?\n/).filter(line => !line.trimStart().startsWith("--")).join("\n");

describe("platform admin role migration contract", () => {
  it("adds 'admin' to the hotel_users role allow-list", () => {
    expect(migration).toContain("alter table public.hotel_users");
    expect(migration).toContain("add constraint hotel_users_role_check");
    for (const role of ["super_admin", "admin", "hotel_owner", "revenue_manager", "front_desk", "housekeeping"]) {
      expect(migration).toContain(`'${role}'`);
    }
  });

  // Spec 14 added `support` to PLATFORM_ROLES without cross-hotel read, so the SQL is
  // compared with CROSS_HOTEL_READ_ROLES, the roles this function is meant to cover.
  it("defines is_platform_admin() over exactly the cross-hotel read roles", () => {
    const start = migration.indexOf("create or replace function public.is_platform_admin()");
    expect(start).toBeGreaterThanOrEqual(0);
    const fn = migration.slice(start, migration.indexOf("grant execute on function public.is_platform_admin()", start));
    expect(fn).toContain("security definer");
    expect(fn).toContain("set search_path to 'public', 'pg_temp'");
    expect(fn).toContain("set row_security to 'off'");
    expect(fn).toContain(`hu.role in (${CROSS_HOTEL_READ_ROLES.map(role => `'${role}'`).join(", ")})`);
  });

  it("routes the cross-hotel read grant through is_hotel_member only", () => {
    const start = migration.indexOf("create or replace function public.is_hotel_member(target_hotel_id uuid)");
    expect(start).toBeGreaterThanOrEqual(0);
    expect(migration.slice(start)).toContain("select public.is_platform_admin()");
    // The write path stays on can_manage_*/is_super_admin, which this migration never redefines.
    expect(executable).not.toContain("create or replace function public.is_super_admin");
    expect(executable).not.toContain("can_manage_");
  });

  it("keeps every surviving is_hotel_member policy read-only in the baseline schema", () => {
    const droppedManagePolicies = baseline.slice(baseline.indexOf("-- Replace broad property-member write policies"));
    const livePolicies = [...baseline.matchAll(/create policy (\w+) on ([\w.]+)\s+for (\w+)([\s\S]*?);\n/g)]
      .filter(match => match[4].includes("is_hotel_member(") && match[3] !== "select")
      .map(match => match[1])
      // A policy that a later block drops is not part of the applied schema.
      .filter(name => !droppedManagePolicies.includes(`drop policy if exists ${name} on `));

    expect(livePolicies).toEqual([]);
  });
});
