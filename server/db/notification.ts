import type { SupabaseClient } from '@supabase/supabase-js';
import { throwOnError } from './utils';
import type { NotificationRecord } from './types';

export async function listNotifications(client: SupabaseClient, hotelId: string) {
  const { data, error } = await client
    .from('notifications')
    .select('*')
    .eq('hotel_id', hotelId)
    .order('created_at', { ascending: false })
    .limit(50);
  throwOnError(error);
  return (data || []) as NotificationRecord[];
}

export async function listAllNotifications(client: SupabaseClient) {
  const { data, error } = await client
    .from('notifications')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(100);
  throwOnError(error);
  return (data || []) as NotificationRecord[];
}

export async function markNotificationRead(client: SupabaseClient, notificationId: string) {
  const { data, error } = await client
    .from('notifications')
    .update({ is_read: true })
    .eq('id', notificationId)
    .select()
    .maybeSingle();
  throwOnError(error);
  return data as NotificationRecord | null;
}

export async function markAllNotificationsRead(client: SupabaseClient, hotelId: string) {
  const { error } = await client
    .from('notifications')
    .update({ is_read: true })
    .eq('hotel_id', hotelId)
    .eq('is_read', false);
  throwOnError(error);
}

export async function markSystemNotificationsRead(client: SupabaseClient) {
  const { error } = await client
    .from('notifications')
    .update({ is_read: true })
    .eq('is_read', false);
  throwOnError(error);
}

export async function insertNotification(client: SupabaseClient, input: { hotel_id: string; type: string; message: string }) {
  const { error } = await client
    .from('notifications')
    .insert([{
      hotel_id: input.hotel_id,
      type: input.type,
      message: input.message
    }]);
  throwOnError(error);
}
