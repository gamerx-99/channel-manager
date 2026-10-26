import type { HumanRole } from '@shared/authorization';
import type { BookingStatus } from '@shared/bookingLifecycle';
import type { ChildRateConfig, OccupancyPriceLevel } from '@shared/occupancyPricing';

export type HotelRecord = {
  id: string;
  name: string;
  slug: string;
  address: string;
  public_enabled: boolean;
  created_at: string;
};

export type RoomTypeRecord = {
  id: string;
  hotel_id: string;
  name: string;
  capacity: number;
  base_price: number | string;
  base_occupancy: number;
  max_occupancy: number;
  occupancy_pricing: Record<string, OccupancyPriceLevel>;
  child_rule: 'age' | 'height';
  child_rule_limit: number | string | null;
  child_rates: ChildRateConfig;
  children_count_toward_max: boolean;
};

export type CreateHotelInput = Pick<HotelRecord, 'name' | 'slug' | 'address' | 'public_enabled'> & {
  owner_contact: string;
};

export type RoomTypeOccupancyPricingInput = Pick<RoomTypeRecord,
  'base_occupancy' | 'max_occupancy' | 'occupancy_pricing' | 'child_rule' |
  'child_rule_limit' | 'child_rates' | 'children_count_toward_max'>;
export type CreateRoomTypeInput = Pick<RoomTypeRecord, 'hotel_id' | 'name' | 'capacity' | 'base_price'> & Partial<RoomTypeOccupancyPricingInput> & { quantity: number };

export type UpdateRoomTypeInput = Omit<CreateRoomTypeInput, 'quantity'> & { room_type_id: string };
export type DeleteRoomTypeInput = Pick<UpdateRoomTypeInput, 'hotel_id' | 'room_type_id'>;

export type HotelServicePricingModel = 'PER_PERSON_PER_NIGHT' | 'PER_NIGHT' | 'ONE_TIME';

export type HotelServiceRecord = {
  id: string;
  hotel_id: string;
  name: string;
  pricing_model: HotelServicePricingModel;
  unit_price: number | string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type CreateHotelServiceInput = {
  hotel_id: string;
  name: string;
  pricing_model: HotelServicePricingModel;
  unit_price: number;
};

export type UpdateHotelServiceInput = {
  hotel_id: string;
  service_id: string;
  name: string;
  pricing_model: HotelServicePricingModel;
  unit_price: number;
  is_active: boolean;
};

export type DeleteHotelServiceInput = {
  hotel_id: string;
  service_id: string;
};

export type GuestRecord = {
  id: string;
  booking_id: string;
  first_name: string;
  middle_name: string | null;
  last_name: string;
  gender: 'M' | 'F' | null;
  passport_no: string;
  nationality_code: string;
  birth_date: string;
  phone_no: string | null;
};

export type BookingServiceRecord = {
  id: string;
  booking_id: string;
  service_name: string;
  pricing_model: 'PER_PERSON_PER_NIGHT' | 'PER_NIGHT' | 'ONE_TIME';
  unit_price: number | string;
  quantity: number;
  total_price: number | string;
  created_at: string;
};

export type PaymentStatus = 'unpaid' | 'pending' | 'verified' | 'failed';
export type PaymentSessionStatus = 'pending' | 'paid' | 'expired' | 'failed';

export type BookingRecord = {
  id: string;
  hotel_id: string;
  room_id: string | null;
  guest_name: string;
  check_in: string;
  check_out: string;
  price: number | string;
  /** 'ota_ical' rows are dates blocked by an OTA calendar feed (price 0, no guests). */
  source: 'manual' | 'walk-in' | 'phone' | 'ota_ical';
  status: BookingStatus;
  /** DB default 'unpaid' — omit on insert, present on reads */
  payment_status?: PaymentStatus;
  payment_method?: 'cash' | 'transfer' | 'promptpay' | null;
  created_by?: string | null;
  created_at: string;
  rooms: { room_number: string; room_types: { name: string } | null } | null;
  guests: GuestRecord[];
  services?: BookingServiceRecord[];
  /** Occupancy snapshot at booking time */
  adults_count?: number;
  children_count?: number;
};

export type PaymentSessionRecord = {
  id: string;
  booking_id: string;
  hotel_id: string;
  amount: number | string;
  status: PaymentSessionStatus;
  qr_reference: string;
  qr_string: string | null;
  expires_at: string;
  verified_at: string | null;
  slip_url: string | null;
  created_at: string;
};

export type AvailabilityRecord = {
  id: string;
  room_type_id: string;
  date: string;
  price: number | string;
  rooms_available: number;
  room_types: { id: string; hotel_id: string; name: string };
};

/**
 * Compatibility surface for the unused template OAuth SDK. Channel Manager
 * authentication is now Supabase Auth; no user record is read from or written
 * to the template MySQL/TiDB database.
 */
export type LegacyTemplateUser = {
  id: number;
  openId: string;
  name: string | null;
  email: string | null;
  loginMethod: string | null;
  role: 'user' | 'admin';
  createdAt: Date;
  updatedAt: Date;
  lastSignedIn: Date;
};

export type PublicRoomTypeAvailability = {
  id: string;
  name: string;
  capacity: number;
  base_price: number;
  total_price: number;
  avg_nightly_price: number;
  nights: number;
  rooms_available: number;
  min_stay_nights: number | null;
  is_available: boolean;
  min_stay_violated: boolean;
  nightly_prices: number[];
};

export type PublicGuestCounts = {
  adults: number;
  children: Array<{ age: number } | { height_cm: number }>;
};

export type PublicHotelAvailabilityResult = {
  hotel: Pick<HotelRecord, 'id' | 'name' | 'slug' | 'address'>;
  check_in: string;
  check_out: string;
  nights: number;
  room_types: PublicRoomTypeAvailability[];
};

export type CreatePublicBookingInput = {
  slug: string;
  room_type_id: string;
  check_in: string;
  check_out: string;
  guest_name: string;
  guest_email?: string | null;
  guest_phone?: string | null;
  special_requests?: string | null;
};

export type RateOverrideRecord = {
  id: string;
  room_type_id: string;
  start_date: string;
  end_date: string;
  override_price: number | string;
  min_stay_nights: number | null;
  created_at: string;
};

export type HotelOptionRecord = {
  id: string;
  name: string;
};

export type HotelUserAssignmentRecord = {
  id: string;
  hotel_id: string;
  user_id: string;
  role: HumanRole;
  created_at: string;
  hotels: { name: string } | null;
};

export type CreateHotelUserInput = {
  hotel_id: string;
  user_id: string;
  role: HumanRole;
};

export type HotelAdminAuditLogRecord = {
  id: string;
  hotel_id: string;
  actor_user_id: string;
  actor_email: string | null;
  action: 'hotel_admin_transfer';
  previous_admin_membership_id: string;
  previous_admin_user_id: string;
  new_admin_membership_id: string;
  new_admin_user_id: string;
  details: Record<string, unknown>;
  created_at: string;
};

export type HotelStaffRecord = HotelUserAssignmentRecord & {
  email: string | null;
  confirmed_at: string | null;
  last_sign_in_at: string | null;
};

export type HousekeepingTaskStatus = 'pending' | 'in_progress' | 'done';

export type HousekeepingTaskRecord = {
  id: string;
  room_id: string;
  booking_id: string | null;
  assigned_to: string | null;
  due_date: string;
  status: HousekeepingTaskStatus;
  created_at: string;
};

export type MessageThreadRecord = {
  id: string;
  hotel_id: string;
  booking_id: string | null;
  created_at: string;
};

export type MessageRecord = {
  id: string;
  thread_id: string;
  sender_user_id: string | null;
  body: string;
  created_at: string;
};

export const DEFAULT_HOTEL_SITE_CONFIG_HERO_COPY =
  'Explore room types, rates, and availability directly from this hotel.';
export const DEFAULT_HOTEL_SITE_CONFIG_ACCENT_COLOR = '#954831';

export type HotelSiteConfigRecord = {
  hotel_id: string;
  hero_copy: string | null;
  accent_color: string | null;
  visible_sections: Record<string, boolean> | null;
  updated_at: string;
};

export type HotelMediaRecord = {
  id: string;
  hotel_id: string;
  url: string;
  caption: string | null;
  is_hero: boolean;
  display_order: number;
  created_at: string;
};

export type NotificationRecord = {
  id: string;
  hotel_id: string;
  type: string;
  message: string;
  is_read: boolean;
  created_at: string;
};

export type SlipOkSettingsRow = {
  id: string;
  hotel_id: string;
  slipok_key_enc: string | null;
  slipok_key_hash: string | null;
  slipok_branch_id: string | null;
  slipok_enabled: boolean;
  created_at: string;
  updated_at: string;
};

export type CreatePaymentSessionInput = {
  booking_id: string;
  hotel_id: string;
  amount: number;
  qr_reference: string;
  qr_string: string;
  expires_at: string;
};
