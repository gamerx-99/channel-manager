import process from "node:process";
import pg from "pg";

const { Client } = pg;
const connectionString = process.env.SUPABASE_POOLER_DB_URL || process.env.SUPABASE_DB_URL;
const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } });

try {
  await client.connect();
  await client.query(`
    CREATE OR REPLACE FUNCTION public.transfer_hotel_admin(target_hotel_id uuid, target_membership_id uuid)
     RETURNS TABLE(id uuid, hotel_id uuid, user_id uuid, role text, created_at timestamp with time zone)
     LANGUAGE plpgsql
     SECURITY DEFINER
     SET search_path TO 'public', 'pg_temp'
     SET row_security TO 'off'
    AS $function$
    declare
      current_owner_id uuid;
      current_owner_user_id uuid;
      target_membership public.hotel_users%rowtype;
    begin
      if not (public.is_super_admin() or public.current_user_has_role('hotel_owner', target_hotel_id)) then
        raise exception '42501: You do not have permission to transfer this hotel administrator.';
      end if;
      
      select hu.id, hu.hotel_id, hu.user_id, hu.role, hu.created_at into target_membership
      from public.hotel_users hu
      where hu.id = target_membership_id
        and hu.hotel_id = target_hotel_id
      for update;
      
      if not found then
        raise exception 'P0002: The selected staff membership was not found in this hotel.';
      end if;
      
      if target_membership.role in ('super_admin', 'api_service') then
        raise exception '23514: Only a human hotel staff member can receive Hotel Admin access.';
      end if;
      
      select hu.id, hu.user_id into current_owner_id, current_owner_user_id
      from public.hotel_users hu
      where hu.hotel_id = target_hotel_id
        and hu.role = 'hotel_owner'
      for update;
      
      if current_owner_id is null then
        raise exception 'P0002: This hotel does not have a current Hotel Admin to transfer.';
      end if;
      
      if current_owner_id <> target_membership_id then
        update public.hotel_users
        set role = 'front_desk'
        where public.hotel_users.id = current_owner_id;
        
        update public.hotel_users
        set role = 'hotel_owner'
        where public.hotel_users.id = target_membership_id;
        
        insert into public.hotel_admin_audit_logs (
          hotel_id,
          actor_user_id,
          actor_email,
          action,
          previous_admin_membership_id,
          previous_admin_user_id,
          new_admin_membership_id,
          new_admin_user_id,
          details
        ) values (
          target_hotel_id,
          auth.uid(),
          auth.jwt() ->> 'email',
          'hotel_admin_transfer',
          current_owner_id,
          current_owner_user_id,
          target_membership_id,
          target_membership.user_id,
          jsonb_build_object(
            'previous_role', 'hotel_owner',
            'new_role', 'hotel_owner',
            'demoted_role', 'front_desk',
            'source', 'hotel_staff_transfer'
          )
        );
      end if;
      
      return query
      select hu.id as id, hu.hotel_id as hotel_id, hu.user_id as user_id, hu.role as role, hu.created_at as created_at
      from public.hotel_users hu
      where hu.id = target_membership_id;
    end;
    $function$
  `);
  console.log("Fixed transfer_hotel_admin function with fully qualified table aliases.");
} catch (e) {
  console.error("Failed:", e);
  process.exitCode = 1;
} finally {
  await client.end();
}
