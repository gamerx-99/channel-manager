import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(resolve(process.cwd(), "20261027_rls_write_hardening.sql"), "utf8");
const verify = readFileSync(resolve(process.cwd(), "verify_20261027_rls_write_hardening.sql"), "utf8");
/** Comment lines carry the rationale and rollback notes; only executable SQL is the contract. */
const executable = sql.split(/\r?\n/).filter(line => !line.trimStart().startsWith("--")).join("\n");

function policy(name: string) {
  const start = executable.indexOf(`create policy ${name} `);
  expect(start, `policy ${name}`).toBeGreaterThanOrEqual(0);
  return executable.slice(start, executable.indexOf(";", start));
}

describe("20261027_rls_write_hardening.sql", () => {
  it("runs in one transaction", () => {
    expect(executable.trimStart().startsWith("begin;")).toBe(true);
    expect(executable.trimEnd().endsWith("commit;")).toBe(true);
  });

  it("stops hotel staff managers from writing any platform role", () => {
    const body = policy("hotel_users_manage_scoped");
    expect(body.match(/role not in \('super_admin', 'admin', 'support'\)/g)).toHaveLength(2);
  });

  it("leaves no write policy on plain hotel membership", () => {
    const writes = executable.split(/create policy /).slice(1).filter(statement => /for (insert|update|delete|all)/.test(statement));
    expect(writes.length).toBeGreaterThan(0);
    for (const statement of writes) {
      expect(statement.slice(0, statement.indexOf(";")), statement.slice(0, 60)).not.toContain("is_hotel_member");
    }
  });

  it.each([
    ['"hotel_payment_settings_upsert"', "can_manage_property"],
    ['"hotel_payment_settings_update"', "can_manage_property"],
    ['"payment_sessions_insert"', "can_manage_bookings"],
    ['"payment_sessions_update"', "can_manage_bookings"],
    ["booking_services_insert", "can_manage_bookings"],
    ["rate_overrides_insert", "can_manage_rates"],
    ["rate_overrides_update", "can_manage_rates"],
    ["housekeeping_tasks_insert", "can_manage_housekeeping"],
    ["housekeeping_tasks_update", "can_manage_housekeeping"],
    ["message_threads_insert", "can_manage_bookings"],
    ["messages_insert", "can_manage_bookings"],
    ["hotel_services_insert", "can_manage_property"],
  ])("gates %s on %s, matching the app permission", (name, helper) => {
    expect(policy(name)).toContain(`public.${helper}(`);
  });

  it("keeps member read access where the old FOR ALL policy provided it", () => {
    expect(policy("booking_services_select")).toContain("public.is_hotel_member(b.hotel_id)");
    expect(policy("hotel_services_member_select")).toContain("public.is_hotel_member(hotel_id)");
  });

  it("ships a read-only verify script that checks the same contract", () => {
    expect(verify).toContain("FROM pg_policies");
    expect(verify).not.toMatch(/\b(insert|update|delete|drop|alter|create)\s/i);
    expect(verify).toContain("no_member_only_write_policies_left");
  });
});
