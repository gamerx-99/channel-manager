import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(resolve(process.cwd(), "supabase_migration_production.sql"), "utf8");

describe("Hotel Admin audit migration contract", () => {
  it("defines the property-scoped audit table and select policy", () => {
    expect(migration).toContain("create table if not exists public.hotel_admin_audit_logs");
    expect(migration).toContain("hotel_id uuid not null references public.hotels(id) on delete cascade");
    expect(migration).toContain("actor_user_id uuid not null");
    expect(migration).toContain("previous_admin_user_id uuid not null");
    expect(migration).toContain("new_admin_user_id uuid not null");
    expect(migration).toContain("created_at timestamptz not null default now()");
    expect(migration).toContain("alter table public.hotel_admin_audit_logs enable row level security");
    expect(migration).toContain("create policy hotel_admin_audit_logs_select on public.hotel_admin_audit_logs");
    expect(migration).toContain("public.current_user_has_role('hotel_owner', hotel_id)");
  });

  it("writes the transfer audit event inside transfer_hotel_admin after both role updates", () => {
    const rpcStart = migration.indexOf("create or replace function public.transfer_hotel_admin");
    const rpcEnd = migration.indexOf("create or replace function public.can_manage_rates", rpcStart);
    expect(rpcStart).toBeGreaterThanOrEqual(0);
    expect(rpcEnd).toBeGreaterThan(rpcStart);

    const rpc = migration.slice(rpcStart, rpcEnd);
    const demoteIndex = rpc.indexOf("set role = 'front_desk'");
    const promoteIndex = rpc.indexOf("set role = 'hotel_owner'");
    const auditInsertIndex = rpc.indexOf("insert into public.hotel_admin_audit_logs");

    expect(rpc).toContain("security definer");
    expect(rpc).toContain("auth.uid()");
    expect(rpc).toContain("auth.jwt() ->> 'email'");
    expect(rpc).toContain("previous_admin_membership_id");
    expect(rpc).toContain("new_admin_membership_id");
    expect(rpc).toContain("jsonb_build_object");
    expect(demoteIndex).toBeGreaterThanOrEqual(0);
    expect(promoteIndex).toBeGreaterThan(demoteIndex);
    expect(auditInsertIndex).toBeGreaterThan(promoteIndex);
    expect(rpc).toContain("return query");
  });
});
