import { TRPCError } from '@trpc/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { HumanRole } from '@shared/authorization';
import { resolveEffectiveRate, getRequiredMinStayNights } from './pricing';
import { throwOnError, isMissingTableError } from './db/utils';
import type {
  HotelRecord,
  RoomTypeRecord,
  CreateHotelInput,
  CreateRoomTypeInput,
  UpdateRoomTypeInput,
  DeleteRoomTypeInput,
  GuestRecord,
  BookingServiceRecord,
  PaymentStatus,
  PaymentSessionStatus,
  BookingRecord,
  PaymentSessionRecord,
  AvailabilityRecord,
  LegacyTemplateUser,
  PublicRoomTypeAvailability,
  PublicHotelAvailabilityResult,
  RateOverrideRecord,
  HotelOptionRecord,
  HotelUserAssignmentRecord,
  CreateHotelUserInput,
  HotelAdminAuditLogRecord,
  HotelStaffRecord,
  HousekeepingTaskStatus,
  HousekeepingTaskRecord,
  MessageThreadRecord,
  MessageRecord,
  HotelSiteConfigRecord,
  HotelMediaRecord,
  NotificationRecord,
  SlipOkSettingsRow,
  CreatePaymentSessionInput,
} from './db/types';

export * from './db/types';
export * from './db/utils';
export * from './db/housekeeping';
export * from './db/messaging';
export * from './db/siteConfig';
export * from './db/hotel';
export * from './db/auth';
export * from './db/availability';
export * from './db/booking';
export * from './db/staff';
export * from './db/payment';
export * from './db/notification';
