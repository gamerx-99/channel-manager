import { z } from 'zod';
import { HOTEL_THEMES, isHotelThemeId } from '@shared/hotelThemes';
import { isValidCoordinates, validateHotelContacts } from '@shared/hotelLocationRules';
import { createD1PublicCallerContext } from '../db/scope';
import { TRPCError } from '@trpc/server';
import { protectedProcedure, rateLimitedProcedure, router } from '../_core/trpc';
import { enforcePublicBookingRateLimit } from '../publicBookingRateLimit';
import {
  listManagedHotels as d1ListManagedHotels,
  listPlatformHotelDirectory as d1ListPlatformHotelDirectory,
  getManagedHotel as d1GetManagedHotel,
  createManagedHotel as d1CreateManagedHotel,
  registerOwnHotel as d1RegisterOwnHotel,
  createManagedRoomType as d1CreateManagedRoomType,
  updateManagedRoomType as d1UpdateManagedRoomType,
  deleteManagedRoomType as d1DeleteManagedRoomType,
  createHotelService as d1CreateHotelService,
  updateHotelService as d1UpdateHotelService,
  deleteHotelService as d1DeleteHotelService,
  listHotelServices as d1ListHotelServices,
  listActiveHotelServicesBySlug as d1ListActiveHotelServicesBySlug,
  getPublicHotel as d1GetPublicHotel,
  setHotelPublicEnabled as d1SetHotelPublicEnabled,
  updateManagedHotelProfile as d1UpdateManagedHotelProfile,
} from '../d1/hotel';
import {
  getHotelSiteConfig as d1GetHotelSiteConfig,
  getHotelSiteConfigBySlug as d1GetHotelSiteConfigBySlug,
  saveHotelSiteConfig as d1SaveHotelSiteConfig,
  publishHotelSiteConfig as d1PublishHotelSiteConfig,
  discardHotelSiteConfigDraft as d1DiscardHotelSiteConfigDraft,
  listHotelMedia as d1ListHotelMedia,
  createHotelMedia as d1CreateHotelMedia,
  deleteHotelMedia as d1DeleteHotelMedia,
  setHotelMediaHero as d1SetHotelMediaHero,
  setHotelMediaObjectPosition as d1SetHotelMediaObjectPosition,
  setHotelMediaCaption as d1SetHotelMediaCaption,
  setHotelMediaGallerySelection as d1SetHotelMediaGallerySelection,
} from '../d1/siteConfig';
import { getRoomTypePricingValidationError, type ChildRateConfig, type OccupancyPriceLevel } from '@shared/occupancyPricing';
import {
  requirePermission,
  requireHotelPermission,
  rethrowDomainError,
} from '../routerUtils';

const hotelIdSchema = z.string().uuid();
const priceAdjustmentSchema = z.object({
  enabled: z.boolean(),
  mode: z.enum(['percent', 'fixed']),
  value: z.number(),
});
const childRateSchema = z.object({ mode: z.enum(['free', 'fixed', 'percent']), value: z.number().nonnegative() });
const roomTypePricingFields = {
  occupancy_pricing: z.record(z.string(), priceAdjustmentSchema).optional(),
  child_rates: z.object({
    infant: childRateSchema,
    age_groups: z.array(childRateSchema.extend({ min_age: z.number().int(), max_age: z.number().int() })).max(3),
    height: childRateSchema,
  }).optional(),
};
const roomTypeDetailFields = {
  description: z.string().trim().max(600).nullable().optional(),
  bed_type: z.string().trim().max(80).nullable().optional(),
  size_sqm: z.number().int().min(1).max(1000).nullable().optional(),
  amenities: z.array(z.string().trim().min(1).max(40)).max(12).optional(),
};

function validateRoomTypePricing(data: any, ctx: z.RefinementCtx, requirePricingWhenOccupancyChanges = false) {
  const effectiveChildRule = data.child_rule ?? 'age';
  if (effectiveChildRule === 'height' && (data.child_rule_limit == null || !Number.isFinite(Number(data.child_rule_limit)))) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'A child height limit is required.', path: ['child_rule_limit'] });
  }
  const occupancyChanged = data.base_occupancy !== undefined || data.max_occupancy !== undefined;
  if (!data.occupancy_pricing && !data.child_rates && !(requirePricingWhenOccupancyChanges && occupancyChanged)) return;
  if (requirePricingWhenOccupancyChanges && data.occupancy_pricing && data.base_occupancy === undefined) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Base occupancy is required when saving an occupancy pricing schedule.', path: ['base_occupancy'] });
  }
  if (!data.occupancy_pricing || !data.child_rates) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Occupancy pricing and child rates must be saved together.', path: ['occupancy_pricing'] });
    return;
  }
  const message = getRoomTypePricingValidationError({
    base_occupancy: data.base_occupancy ?? Math.min(2, data.capacity),
    max_occupancy: data.max_occupancy ?? data.capacity,
    occupancy_pricing: data.occupancy_pricing,
    child_rule: effectiveChildRule,
    child_rule_limit: data.child_rule_limit ?? null,
    child_rates: data.child_rates,
  });
  if (message) ctx.addIssue({ code: z.ZodIssueCode.custom, message, path: ['occupancy_pricing'] });
}

export const createHotelSchema = z.object({
  name: z.string().trim().min(1, 'Hotel name is required.').max(160),
  slug: z.string().trim().toLowerCase().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use lowercase letters, numbers, and hyphens only.').max(100),
  address: z.string().trim().min(1, 'Address is required.').max(500),
  owner_contact: z.string().trim().min(1, 'Owner contact is required.').max(180),
  public_enabled: z.boolean().default(false),
});

export const createRoomTypeSchema = z.object({
  hotel_id: hotelIdSchema,
  name: z.string().trim().min(1, 'Room type name is required.').max(120),
  capacity: z.number().int().positive('Capacity must be at least 1.'),
  base_price: z.number().positive('Base price must be greater than zero.'),
  quantity: z.number().int().positive('Number of rooms must be at least 1.'),
  base_occupancy: z.number().int().positive().optional(),
  max_occupancy: z.number().int().positive().optional(),
  ...roomTypePricingFields,
  ...roomTypeDetailFields,
  child_rule: z.enum(['age', 'height']).optional(),
  child_rule_limit: z.number().nonnegative().nullable().optional(),
  children_count_toward_max: z.boolean().optional(),
}).superRefine((data, ctx) => {
  if (data.max_occupancy !== undefined && data.max_occupancy !== data.capacity) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Maximum occupancy must match room capacity.', path: ['max_occupancy'] });
  }
  if ((data.max_occupancy ?? data.capacity) < (data.base_occupancy ?? Math.min(2, data.capacity))) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Maximum occupancy must be at least base occupancy.', path: ['max_occupancy'] });
  }
  validateRoomTypePricing(data, ctx);
});

export const updateRoomTypeSchema = z.object({
  hotel_id: hotelIdSchema,
  room_type_id: z.string().uuid(),
  name: z.string().trim().min(1, 'Room type name is required.').max(120),
  capacity: z.number().int().positive('Capacity must be at least 1.'),
  base_price: z.number().positive('Base price must be greater than zero.'),
  base_occupancy: z.number().int().positive().optional(),
  max_occupancy: z.number().int().positive().optional(),
  ...roomTypePricingFields,
  ...roomTypeDetailFields,
  child_rule: z.enum(['age', 'height']).optional(),
  child_rule_limit: z.number().nonnegative().nullable().optional(),
  children_count_toward_max: z.boolean().optional(),
}).superRefine((data, ctx) => {
  if (data.max_occupancy !== undefined && data.max_occupancy !== data.capacity) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Maximum occupancy must match room capacity.', path: ['max_occupancy'] });
  }
  if ((data.max_occupancy ?? data.capacity) < (data.base_occupancy ?? Math.min(2, data.capacity))) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Maximum occupancy must be at least base occupancy.', path: ['max_occupancy'] });
  }
  validateRoomTypePricing(data, ctx, true);
});

export const deleteRoomTypeSchema = z.object({
  hotel_id: hotelIdSchema,
  room_type_id: z.string().uuid(),
});

const hotelServicePricingModelSchema = z.enum(['PER_PERSON_PER_NIGHT', 'PER_NIGHT', 'ONE_TIME']);

export const createHotelServiceSchema = z.object({
  hotel_id: hotelIdSchema,
  name: z.string().trim().min(1, 'Service name is required.').max(120),
  pricing_model: hotelServicePricingModelSchema,
  unit_price: z.number().nonnegative('Price cannot be negative.'),
});

export const updateHotelServiceSchema = z.object({
  hotel_id: hotelIdSchema,
  service_id: z.string().uuid(),
  name: z.string().trim().min(1, 'Service name is required.').max(120),
  pricing_model: hotelServicePricingModelSchema,
  unit_price: z.number().nonnegative('Price cannot be negative.'),
  is_active: z.boolean(),
});

export const deleteHotelServiceSchema = z.object({
  hotel_id: hotelIdSchema,
  service_id: z.string().uuid(),
});

export const listHotelServicesSchema = hotelIdSchema;

export const listPublicHotelServicesSchema = z.object({
  slug: z.string().trim().min(1).max(100),
});

export const hotelSiteConfigSaveSchema = z.object({
  hotel_id: hotelIdSchema,
  hero_copy: z.string().trim().max(500).nullable().optional(),
  accent_color: z.string().regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, 'Use a hex color like #954831.').nullable().optional(),
  visible_sections: z.record(z.string(), z.boolean()).nullable().optional(),
  theme: z.string().nullable().optional().refine(value => value == null || isHotelThemeId(value), 'Unknown hotel theme.'),
  hero_media_id: z.string().uuid().nullable().optional(),
  media_positions: z.record(z.string().uuid(), z.string().regex(/^(?:0|[1-9]\\d?|100)% (?:0|[1-9]\\d?|100)%$/).nullable()).optional(),
});

export const uploadHotelMediaSchema = z.object({
  hotel_id: hotelIdSchema,
  base64: z.string().min(1, 'File data is required.'),
  filename: z.string().min(1, 'Filename is required.'),
  caption: z.string().nullable().optional(),
});

export const deleteHotelMediaSchema = z.object({
  hotel_id: hotelIdSchema,
  media_id: z.string().uuid(),
});

export const setHotelMediaHeroSchema = z.object({
  hotel_id: hotelIdSchema,
  media_id: z.string().uuid(),
});
export const setHotelMediaObjectPositionSchema = z.object({
  hotel_id: hotelIdSchema,
  media_id: z.string().uuid(),
  object_position: z.string().regex(/^(?:0|[1-9]\d?|100)% (?:0|[1-9]\d?|100)%$/).nullable(),
});
export const setHotelMediaCaptionSchema = z.object({ hotel_id: hotelIdSchema, media_id: z.string().uuid(), caption: z.string().max(120) });
export const setHotelMediaGallerySelectionSchema = z.object({ hotel_id: hotelIdSchema, media_id: z.string().uuid(), shown: z.boolean() });

export const hotels = protectedProcedure.query(async ({ ctx }) => {
  if (!ctx.db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'D1 database required.' });
  try {
    const rows = await d1ListManagedHotels(ctx.db, ctx.caller ?? { userId: ctx.user.id });
    return rows.map(h => ({
      ...h,
      created_at: typeof h.created_at === 'string' ? h.created_at : new Date(h.created_at).toISOString(),
      bookings: h.bookings.map((b: any) => ({
        ...b,
        source: b.source as any,
        status: b.status as any,
        payment_status: null as string | null,
        price: b.price,
      })),
    }));
  } catch (error) {
    return rethrowDomainError(error);
  }
});

export const canCreateHotel = protectedProcedure.query(async ({ ctx }) => {
  const roles = ctx.user.roles ?? (ctx.user.role ? [ctx.user.role] : []);
  return roles.includes('super_admin');
});

export const adminHotels = protectedProcedure.query(async ({ ctx }) => {
  requirePermission(ctx.user, 'platform.manage_hotels');
  if (!ctx.db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'D1 database required.' });
  try {
    return await d1ListPlatformHotelDirectory(ctx.db, ctx.caller ?? { userId: ctx.user.id });
  } catch (error) {
    if (error instanceof TRPCError) throw error;
    return rethrowDomainError(error);
  }
});

export const createHotel = protectedProcedure.input(createHotelSchema).mutation(async ({ ctx, input }) => {
  requirePermission(ctx.user, 'platform.manage_hotels');
  if (!ctx.db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'D1 database required.' });
  try {
    const roles = ctx.user.roles ?? (ctx.user.role ? [ctx.user.role] : []);
    if (!roles.includes('super_admin')) {
      throw new TRPCError({ code: 'FORBIDDEN', message: 'Only super administrators can create hotels.' });
    }
    return await d1CreateManagedHotel(ctx.db, ctx.caller ?? { userId: ctx.user.id }, {
      name: input.name,
      slug: input.slug,
      address: input.address,
      owner_contact: input.owner_contact,
      public_enabled: input.public_enabled,
    } as any);
  } catch (error) {
    if (error instanceof TRPCError) throw error;
    return rethrowDomainError(error);
  }
});

export const registerOwnHotel = protectedProcedure.input(createHotelSchema.omit({ public_enabled: true })).mutation(async ({ ctx, input }) => {
  if (!ctx.db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'D1 database required.' });
  await enforcePublicBookingRateLimit(ctx);
  try {
    return await d1RegisterOwnHotel(ctx.db, ctx.caller ?? { userId: ctx.user.id }, input);
  } catch (error) {
    if (error instanceof TRPCError) throw error;
    return rethrowDomainError(error);
  }
});

/** Owner switch for the public hotel page and direct booking. Self-signup hotels start private. */
export const setHotelPublished = protectedProcedure
  .input(z.object({ hotel_id: z.string().uuid(), public_enabled: z.boolean() }))
  .mutation(async ({ ctx, input }) => {
    requireHotelPermission(ctx.user, input.hotel_id, 'property.manage_profile');
    if (!ctx.db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'D1 database required.' });
    try {
      return await d1SetHotelPublicEnabled(ctx.db, ctx.caller ?? { userId: ctx.user.id }, input.hotel_id, input.public_enabled);
    } catch (error) {
      return rethrowDomainError(error);
    }
  });

export const hotel = protectedProcedure.input(hotelIdSchema).query(async ({ ctx, input }) => {
  if (!ctx.db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'D1 database required.' });
  try {
    const h = await d1GetManagedHotel(ctx.db, ctx.caller ?? { userId: ctx.user.id }, input);
    if (!h) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'This hotel is not available to your account.' });
    }
    return h as any;
  } catch (error) {
    if (error instanceof TRPCError) throw error;
    return rethrowDomainError(error);
  }
});

export const updateHotelProfile = protectedProcedure
  // ASSUMPTION: the hotel slug stays fixed because changing it would break shared guest links.
  .input(z.object({ hotel_id: hotelIdSchema, name: z.string().trim().min(1).max(160), address: z.string().trim().min(1).max(500), owner_contact: z.string().trim().min(1).max(180), latitude: z.number().min(-90).max(90).nullable().optional(), longitude: z.number().min(-180).max(180).nullable().optional(), public_phone: z.string().max(80).nullable().optional(), show_public_phone: z.boolean().optional(), facebook_url: z.string().max(500).nullable().optional(), show_facebook: z.boolean().optional(), instagram_url: z.string().max(500).nullable().optional(), show_instagram: z.boolean().optional(), x_url: z.string().max(500).nullable().optional(), show_x: z.boolean().optional() }).superRefine((input, ctx) => {
    if (!isValidCoordinates(input.latitude, input.longitude)) ctx.addIssue({ code: 'custom', message: 'ระบุตำแหน่งให้ครบทั้งละติจูดและลองจิจูด' });
    const contactError = validateHotelContacts({ phone: input.public_phone, facebook: input.facebook_url, instagram: input.instagram_url, x: input.x_url, showPhone: input.show_public_phone ?? false, showFacebook: input.show_facebook ?? false, showInstagram: input.show_instagram ?? false, showX: input.show_x ?? false });
    if (contactError) ctx.addIssue({ code: 'custom', message: contactError });
  }))
  .mutation(async ({ ctx, input }) => {
    requireHotelPermission(ctx.user, input.hotel_id, 'property.manage_profile');
    if (!ctx.db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'D1 database required.' });
    try {
      return await d1UpdateManagedHotelProfile(ctx.db, ctx.caller ?? { userId: ctx.user.id }, input);
    } catch (error) {
      return rethrowDomainError(error);
    }
  });

export const createRoomType = protectedProcedure.input(createRoomTypeSchema).mutation(async ({ ctx, input }) => {
  requireHotelPermission(ctx.user, input.hotel_id, 'property.manage_room_structure');
  if (!ctx.db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'D1 database required.' });
  try {
    const hotel = await d1GetManagedHotel(ctx.db, ctx.caller ?? { userId: ctx.user.id }, input.hotel_id);
    if (!hotel) throw new TRPCError({ code: 'NOT_FOUND', message: 'This hotel is not available to your account.' });
    const existingRules = new Set(hotel.room_types.map(roomType => roomType.child_rule).filter(Boolean));
    if (existingRules.size > 1) {
      throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'Room types must use one shared child measurement rule before adding another room type.' });
    }
    const childRule = input.child_rule ?? hotel.room_types[0]?.child_rule ?? 'age';
    if (existingRules.size && !existingRules.has(childRule)) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'All room types in a hotel must use the same child measurement rule.' });
    }
    const childRuleLimit = input.child_rule_limit ?? hotel.room_types[0]?.child_rule_limit ?? null;
    if (childRule === 'height' && childRuleLimit == null) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'A child height limit is required for this room type.' });
    }
    return await d1CreateManagedRoomType(ctx.db, ctx.caller ?? { userId: ctx.user.id }, {
      hotel_id: input.hotel_id,
      name: input.name,
      description: input.description === undefined ? undefined : input.description || null,
      bed_type: input.bed_type === undefined ? undefined : input.bed_type || null,
      size_sqm: input.size_sqm ?? null,
      amenities: input.amenities ?? [],
      capacity: input.capacity,
      base_price: input.base_price,
      quantity: input.quantity,
      base_occupancy: input.base_occupancy,
      max_occupancy: input.max_occupancy,
      occupancy_pricing: input.occupancy_pricing,
      child_rule: childRule,
      child_rule_limit: childRule === 'height' || input.child_rule_limit !== undefined ? childRuleLimit : undefined,
      child_rates: input.child_rates,
      children_count_toward_max: input.children_count_toward_max,
    } as any);
  } catch (error) {
    if (error instanceof TRPCError) throw error;
    return rethrowDomainError(error);
  }
});

export const updateRoomType = protectedProcedure.input(updateRoomTypeSchema).mutation(async ({ ctx, input }) => {
  requireHotelPermission(ctx.user, input.hotel_id, 'property.manage_room_structure');
  if (!ctx.db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'D1 database required.' });
  try {
    const hotel = await d1GetManagedHotel(ctx.db, ctx.caller ?? { userId: ctx.user.id }, input.hotel_id);
    const roomType = hotel?.room_types.find(roomType => roomType.id === input.room_type_id);
    if (!roomType) throw new TRPCError({ code: 'NOT_FOUND', message: 'This room type is not available to your account.' });
    if (input.capacity !== roomType.capacity && (!input.occupancy_pricing || !input.child_rates)) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'Occupancy pricing and child rates must be saved together when capacity changes.' });
    }
    const updated = await d1UpdateManagedRoomType(ctx.db, ctx.caller ?? { userId: ctx.user.id }, {
      hotel_id: input.hotel_id,
      room_type_id: input.room_type_id,
      name: input.name,
      description: input.description === undefined ? undefined : input.description || null,
      bed_type: input.bed_type === undefined ? undefined : input.bed_type || null,
      size_sqm: input.size_sqm,
      amenities: input.amenities,
      capacity: input.capacity,
      base_price: input.base_price,
      base_occupancy: input.base_occupancy,
      max_occupancy: input.max_occupancy,
      occupancy_pricing: input.occupancy_pricing,
      child_rule: input.child_rule,
      child_rule_limit: input.child_rule_limit,
      child_rates: input.child_rates,
      children_count_toward_max: input.children_count_toward_max,
    } as any);
    if (!updated) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'This room type could not be updated.' });
    }
    return updated;
  } catch (error) {
    if (error instanceof TRPCError) throw error;
    return rethrowDomainError(error);
  }
});

export const deleteRoomType = protectedProcedure.input(deleteRoomTypeSchema).mutation(async ({ ctx, input }) => {
  requireHotelPermission(ctx.user, input.hotel_id, 'property.manage_room_structure');
  if (!ctx.db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'D1 database required.' });
  try {
    const removed = await d1DeleteManagedRoomType(ctx.db, ctx.caller ?? { userId: ctx.user.id }, {
      hotel_id: input.hotel_id,
      room_type_id: input.room_type_id,
    } as any);
    if (!removed) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'This room type could not be deleted.' });
    }
    return { success: true as const, id: removed.id };
  } catch (error) {
    if (error instanceof TRPCError) throw error;
    return rethrowDomainError(error);
  }
});

export const createHotelServiceProcedure = protectedProcedure.input(createHotelServiceSchema).mutation(async ({ ctx, input }) => {
  requireHotelPermission(ctx.user, input.hotel_id, 'property.manage_room_structure');
  if (!ctx.db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'D1 database required.' });
  try {
    return await d1CreateHotelService(ctx.db, ctx.caller ?? { userId: ctx.user.id }, {
      hotel_id: input.hotel_id,
      name: input.name,
      pricing_model: input.pricing_model,
      unit_price: input.unit_price,
    } as any);
  } catch (error) {
    if (error instanceof TRPCError) throw error;
    return rethrowDomainError(error);
  }
});

export const updateHotelServiceProcedure = protectedProcedure.input(updateHotelServiceSchema).mutation(async ({ ctx, input }) => {
  requireHotelPermission(ctx.user, input.hotel_id, 'property.manage_room_structure');
  if (!ctx.db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'D1 database required.' });
  try {
    const updated = await d1UpdateHotelService(ctx.db, ctx.caller ?? { userId: ctx.user.id }, {
      hotel_id: input.hotel_id,
      service_id: input.service_id,
      name: input.name,
      pricing_model: input.pricing_model,
      unit_price: input.unit_price,
      is_active: input.is_active,
    } as any);
    if (!updated) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'This service could not be updated.' });
    }
    return updated;
  } catch (error) {
    if (error instanceof TRPCError) throw error;
    return rethrowDomainError(error);
  }
});

export const deleteHotelServiceProcedure = protectedProcedure.input(deleteHotelServiceSchema).mutation(async ({ ctx, input }) => {
  requireHotelPermission(ctx.user, input.hotel_id, 'property.manage_room_structure');
  if (!ctx.db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'D1 database required.' });
  try {
    const removed = await d1DeleteHotelService(ctx.db, ctx.caller ?? { userId: ctx.user.id }, {
      hotel_id: input.hotel_id,
      service_id: input.service_id,
    } as any);
    if (!removed) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'This service could not be deleted.' });
    }
    return { success: true as const, id: removed.id };
  } catch (error) {
    if (error instanceof TRPCError) throw error;
    return rethrowDomainError(error);
  }
});

export const listHotelServicesProcedure = protectedProcedure.input(listHotelServicesSchema).query(async ({ ctx, input }) => {
  requireHotelPermission(ctx.user, input, 'property.manage_room_structure');
  if (!ctx.db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'D1 database required.' });
  try {
    return await d1ListHotelServices(ctx.db, ctx.caller ?? { userId: ctx.user.id }, input);
  } catch (error) {
    return rethrowDomainError(error);
  }
});

export const listPublicHotelServices = rateLimitedProcedure.input(listPublicHotelServicesSchema).query(async ({ ctx, input }) => {
  if (!ctx.db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'D1 database required.' });
  try {
    return await d1ListActiveHotelServicesBySlug(ctx.db, createD1PublicCallerContext(), input.slug);
  } catch (error) {
    return rethrowDomainError(error);
  }
});

export const publicHotel = rateLimitedProcedure.input(z.string().trim().min(1).max(100)).query(async ({ ctx, input }) => {
  if (!ctx.db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'D1 database required.' });
  try {
    return await d1GetPublicHotel(ctx.db, createD1PublicCallerContext(), input);
  } catch (error) {
    return rethrowDomainError(error);
  }
});

export const getHotelSiteConfig = rateLimitedProcedure.input(z.string().trim().min(1).max(100)).query(async ({ ctx, input }) => {
  if (!ctx.db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'D1 database required.' });
  try {
    return await d1GetHotelSiteConfigBySlug(ctx.db, createD1PublicCallerContext(), input);
  } catch (error) {
    const code = (error as { code?: string })?.code;
    const msg = error instanceof Error ? error.message : '';
    if (code === '42P01' || code === 'PGRST205' || /hotel_site_config.*does not exist/i.test(msg)) return null;
    return rethrowDomainError(error);
  }
});

export const getHotelSiteConfigByHotelId = protectedProcedure.input(z.object({ hotel_id: hotelIdSchema })).query(async ({ ctx, input }) => {
  requireHotelPermission(ctx.user, input.hotel_id, 'property.view');
  if (!ctx.db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'D1 database required.' });
  try {
    return await d1GetHotelSiteConfig(ctx.db, ctx.caller ?? { userId: ctx.user.id }, input.hotel_id);
  } catch (error) {
    const code = (error as { code?: string })?.code;
    const msg = error instanceof Error ? error.message : '';
    if (code === '42P01' || code === 'PGRST205' || /hotel_site_config.*does not exist/i.test(msg)) return null;
    return rethrowDomainError(error);
  }
});

export const saveHotelSiteConfig = protectedProcedure.input(hotelSiteConfigSaveSchema).mutation(async ({ ctx, input }) => {
  requireHotelPermission(ctx.user, input.hotel_id, 'property.manage_profile');
  if (!ctx.db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'D1 database required.' });
  try {
    await d1GetManagedHotel(ctx.db, ctx.caller ?? { userId: ctx.user.id }, input.hotel_id);
    return await d1SaveHotelSiteConfig(ctx.db, ctx.caller ?? { userId: ctx.user.id }, {
      hotel_id: input.hotel_id,
      hero_copy: input.hero_copy,
      accent_color: input.accent_color,
      visible_sections: input.visible_sections,
      theme: input.theme,
      hero_media_id: input.hero_media_id,
      media_positions: input.media_positions,
    });
  } catch (error) {
    if (error instanceof TRPCError) throw error;
    const code = (error as { code?: string })?.code;
    const msg = error instanceof Error ? error.message : '';
    if (code === '42P01' || code === 'PGRST205' || /hotel_site_config.*does not exist/i.test(msg)) {
      return {
        hotel_id: input.hotel_id,
        hero_copy: input.hero_copy ?? null,
        accent_color: input.accent_color ?? null,
        visible_sections: input.visible_sections ?? null,
        updated_at: new Date().toISOString(),
      };
    }
    return rethrowDomainError(error);
  }
});

export const publishHotelSiteConfig = protectedProcedure.input(z.object({ hotel_id: hotelIdSchema })).mutation(async ({ ctx, input }) => {
  requireHotelPermission(ctx.user, input.hotel_id, 'property.manage_profile');
  if (!ctx.db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'D1 database required.' });
  try { return await d1PublishHotelSiteConfig(ctx.db, ctx.caller ?? { userId: ctx.user.id }, input.hotel_id); }
  catch (error) { return rethrowDomainError(error); }
});

export const discardHotelSiteConfigDraft = protectedProcedure.input(z.object({ hotel_id: hotelIdSchema })).mutation(async ({ ctx, input }) => {
  requireHotelPermission(ctx.user, input.hotel_id, 'property.manage_profile');
  if (!ctx.db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'D1 database required.' });
  try { return await d1DiscardHotelSiteConfigDraft(ctx.db, ctx.caller ?? { userId: ctx.user.id }, input.hotel_id); }
  catch (error) { return rethrowDomainError(error); }
});

export const listHotelMedia = protectedProcedure.input(z.object({ hotel_id: hotelIdSchema })).query(async ({ ctx, input }) => {
  requireHotelPermission(ctx.user, input.hotel_id, 'property.view');
  if (!ctx.db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'D1 database required.' });
  try {
    return await d1ListHotelMedia(ctx.db, ctx.caller ?? { userId: ctx.user.id }, input.hotel_id);
  } catch (error) {
    return rethrowDomainError(error);
  }
});

export const uploadHotelMedia = protectedProcedure.input(uploadHotelMediaSchema).mutation(async ({ ctx, input }) => {
  requireHotelPermission(ctx.user, input.hotel_id, 'property.manage_profile');
  // Media upload via tRPC disabled; use /api/media endpoint
  throw new TRPCError({ code: 'BAD_REQUEST', message: 'Use /api/media endpoint for uploads.' });
});

export const deleteHotelMedia = protectedProcedure.input(deleteHotelMediaSchema).mutation(async ({ ctx, input }) => {
  requireHotelPermission(ctx.user, input.hotel_id, 'property.manage_profile');
  if (!ctx.db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'D1 database required.' });
  try {
    const deleted = await d1DeleteHotelMedia(ctx.db, ctx.caller ?? { userId: ctx.user.id }, input.hotel_id, input.media_id);
    if (!deleted) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'This media item could not be deleted.' });
    }
    return { id: deleted.id };
  } catch (error) {
    if (error instanceof TRPCError) throw error;
    return rethrowDomainError(error);
  }
});

export const setHotelMediaHero = protectedProcedure.input(setHotelMediaHeroSchema).mutation(async ({ ctx, input }) => {
  requireHotelPermission(ctx.user, input.hotel_id, 'property.manage_profile');
  if (!ctx.db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'D1 database required.' });
  try {
    await d1SetHotelMediaHero(ctx.db, ctx.caller ?? { userId: ctx.user.id }, input.hotel_id, input.media_id);
    return { success: true as const };
  } catch (error) {
    if (error instanceof TRPCError) throw error;
    return rethrowDomainError(error);
  }
});

export const setHotelMediaObjectPosition = protectedProcedure.input(setHotelMediaObjectPositionSchema).mutation(async ({ ctx, input }) => {
  requireHotelPermission(ctx.user, input.hotel_id, 'property.manage_profile');
  if (!ctx.db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'D1 database required.' });
  try {
    return await d1SetHotelMediaObjectPosition(ctx.db, ctx.caller ?? { userId: ctx.user.id }, input.hotel_id, input.media_id, input.object_position);
  } catch (error) {
    if (error instanceof TRPCError) throw error;
    return rethrowDomainError(error);
  }
});

export const setHotelMediaCaption = protectedProcedure.input(setHotelMediaCaptionSchema).mutation(async ({ ctx, input }) => {
  requireHotelPermission(ctx.user, input.hotel_id, 'property.manage_profile');
  if (!ctx.db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'D1 database required.' });
  try { return await d1SetHotelMediaCaption(ctx.db, ctx.caller ?? { userId: ctx.user.id }, input.hotel_id, input.media_id, input.caption); }
  catch (error) { return rethrowDomainError(error); }
});

export const setHotelMediaGallerySelection = protectedProcedure.input(setHotelMediaGallerySelectionSchema).mutation(async ({ ctx, input }) => {
  requireHotelPermission(ctx.user, input.hotel_id, 'property.manage_profile');
  if (!ctx.db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'D1 database required.' });
  try { return await d1SetHotelMediaGallerySelection(ctx.db, ctx.caller ?? { userId: ctx.user.id }, input.hotel_id, input.media_id, input.shown); }
  catch (error) { return rethrowDomainError(error); }
});

export const hotelRouter = router({
  hotels,
  canCreateHotel,
  adminHotels,
  createHotel,
  hotel,
  createRoomType,
  updateRoomType,
  deleteRoomType,
  createHotelServiceProcedure,
  updateHotelServiceProcedure,
  deleteHotelServiceProcedure,
  listHotelServicesProcedure,
  publicHotel,
  getHotelSiteConfig,
  getHotelSiteConfigByHotelId,
  saveHotelSiteConfig,
  publishHotelSiteConfig,
  discardHotelSiteConfigDraft,
  listHotelMedia,
  uploadHotelMedia,
  deleteHotelMedia,
  setHotelMediaHero,
  setHotelMediaObjectPosition,
  updateHotelProfile,
});
