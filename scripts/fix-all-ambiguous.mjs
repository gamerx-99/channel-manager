import process from "node:process";
import pg from "pg";

const { Client } = pg;
const connectionString = process.env.SUPABASE_POOLER_DB_URL || process.env.SUPABASE_DB_URL;
const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } });

try {
  await client.connect();
  await client.query(`
    CREATE OR REPLACE FUNCTION public.verify_transfer_wrapper(target_hotel_id uuid, target_membership_id uuid)
     RETURNS text
     LANGUAGE plpgsql
     SECURITY DEFINER
     SET search_path TO 'public', 'pg_temp'
     SET row_security TO 'off'
    AS $function$
    declare
      curr_id uuid;
      curr_uid uuid;
      target_role text;
      target_uid uuid;
    begin
      select hu.role, hu.user_id into target_role, target_uid
      from public.hotel_users hu
      where hu.id = target_membership_id
        and hu.hotel_id = target_hotel_id;

      if target_role is null then
        raise exception 'P0002: Membership not found';
      end if;

      if target_role in ('super_admin', 'api_service') then
        raise exception '23514: Invalid role';
      end if;

      select hu.id, hu.user_id into curr_id, curr_uid
      from public.hotel_users hu
      where hu.hotel_id = target_hotel_id
        and hu.role = 'hotel_owner';

      if curr_id is null then
        raise exception 'P0002: No current owner';
      end if;

      if curr_id <> target_membership_id then
        update public.hotel_users
        set role = 'front_desk'
        where public.hotel_users.id = curr_id;

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
          curr_id,
          curr_uid,
          target_membership_id,
          target_uid,
          jsonb_build_object('source', 'wrapper_verification')
        );
      end if;

      return 'SUCCESS';
    end;
    $function$
  `);
  console.log("Wrapper updated cleanly.");
} catch (e) {
  console.error("Error:", e);
  process.exitCode = 1;
} finally {
  await client.end();
}
