import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { protectedProcedure, rateLimitedProcedure, router } from '../_core/trpc';
import {
  listManagedHotels,
  isSuperAdmin,
  listHotelOptions,
  createManagedHotel,
  getManagedHotel,
  createManagedRoomType,
  updateManagedRoomType,
  deleteManagedRoomType,
  createHotelService,
  updateHotelService,
  deleteHotelService,
  listHotelServices,
  listActiveHotelServicesBySlug,
  getPublicHotel,
  getHotelSiteConfigBySlug,
  getHotelSiteConfig as dbGetHotelSiteConfig,
  saveHotelSiteConfig as dbSaveHotelSiteConfig,
  listHotelMedia as dbListHotelMedia,
  createHotelMedia as dbCreateHotelMedia,
  deleteHotelMedia as dbDeleteHotelMedia,
  setHotelMediaHero as dbSetHotelMediaHero,
} from '../db';
import { storagePut } from '../storage';
import { getRoomTypePricingValidationError, type ChildRateConfig, type OccupancyPriceLevel } from '@shared/occupancyPricing';
import {
  requirePermission,
  requireHotelPermission,
  requireSuperAdmin,
  assertHotelExists,
  assertHotelAndRoomTypeExist,
  rethrowDomainError,
  rlsClient,
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

function validateRoomTypePricing(data: {
  base_occupancy?: number;
  max_occupancy?: number;
  capacity: number;
  occupancy_pricing?: Record<string, OccupancyPriceLevel>;
  child_rule?: 'age' | 'height';
  child_rule_limit?: number | null;
  child_rates?: ChildRateConfig;
}, ctx: z.RefinementCtx) {
  if (data.child_rule === 'height' && (data.child_rule_limit == null || !Number.isFinite(Number(data.child_rule_limit)))) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'A child height limit is required.', path: ['child_rule_limit'] });
  }
  if (!data.occupancy_pricing && !data.child_rates) return;
  if (!data.occupancy_pricing || !data.child_rates) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Occupancy pricing and child rates must be saved together.', path: ['occupancy_pricing'] });
    return;
  }
  const message = getRoomTypePricingValidationError({
    base_occupancy: data.base_occupancy ?? Math.min(2, data.capacity),
    max_occupancy: data.max_occupancy ?? data.capacity,
    occupancy_pricing: data.occupancy_pricing,
    child_rule: data.child_rule ?? 'age',
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
  child_rule: z.enum(['age', 'height']).optional(),
  child_rule_limit: z.number().nonnegative().nullable().optional(),
  children_count_toward_max: z.boolean().optional(),
}).superRefine((data, ctx) => {
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
  child_rule: z.enum(['age', 'height']).optional(),
  child_rule_limit: z.number().nonnegative().nullable().optional(),
  children_count_toward_max: z.boolean().optional(),
}).superRefine((data, ctx) => {
  if ((data.max_occupancy ?? data.capacity) < (data.base_occupancy ?? Math.min(2, data.capacity))) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Maximum occupancy must be at least base occupancy.', path: ['max_occupancy'] });
  }
  validateRoomTypePricing(data, ctx);
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

export const hotels = protectedProcedure.query(async ({ ctx }) => {
  try {
    return await listManagedHotels(rlsClient(ctx.user.accessToken));
  } catch (error) {
    return rethrowDomainError(error);
  }
});

export const canCreateHotel = protectedProcedure.query(async ({ ctx }) => {
  try {
    return await isSuperAdmin(rlsClient(ctx.user.accessToken));
  } catch (error) {
    return rethrowDomainError(error);
  }
});

export const adminHotels = protectedProcedure.query(async ({ ctx }) => {
  requirePermission(ctx.user, 'platform.manage_hotels');
  try {
    const client = await requireSuperAdmin(ctx.user.accessToken);
    return await listHotelOptions(client);
  } catch (error) {
    if (error instanceof TRPCError) throw error;
    return rethrowDomainError(error);
  }
});

export const createHotel = protectedProcedure.input(createHotelSchema).mutation(async ({ ctx, input }) => {
  requirePermission(ctx.user, 'platform.manage_hotels');
  const client = rlsClient(ctx.user.accessToken);
  try {
    if (!(await isSuperAdmin(client))) {
      throw new TRPCError({ code: 'FORBIDDEN', message: 'Only super administrators can create hotels.' });
    }
    return await createManagedHotel(client, input);
  } catch (error) {
    if (error instanceof TRPCError) throw error;
    return rethrowDomainError(error);
  }
});

export const hotel = protectedProcedure.input(hotelIdSchema).query(async ({ ctx, input }) => {
  let h;
  try {
    h = await getManagedHotel(rlsClient(ctx.user.accessToken), input);
  } catch (error) {
    return rethrowDomainError(error);
  }
  if (!h) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'This hotel is not available to your account.' });
  }
  return h;
});

export const createRoomType = protectedProcedure.input(createRoomTypeSchema).mutation(async ({ ctx, input }) => {
  requireHotelPermission(ctx.user, input.hotel_id, 'property.manage_room_structure');
  const client = rlsClient(ctx.user.accessToken);
  try {
    const hotel = await assertHotelExists(client, input.hotel_id);
    const existingRules = new Set(hotel.room_types.map(roomType => roomType.child_rule).filter(Boolean));
    if (existingRules.size > 1) {
      throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'Room types must use one shared child measurement rule before adding another room type.' });
    }
    const childRule = input.child_rule ?? hotel.room_types[0]?.child_rule ?? 'age';
    if (existingRules.size && !existingRules.has(childRule)) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'All room types in a hotel must use the same child measurement rule.' });
    }
    return await createManagedRoomType(client, { ...input, child_rule: childRule });
  } catch (error) {
    if (error instanceof TRPCError) throw error;
    return rethrowDomainError(error);
  }
});

export const updateRoomType = protectedProcedure.input(updateRoomTypeSchema).mutation(async ({ ctx, input }) => {
  requireHotelPermission(ctx.user, input.hotel_id, 'property.manage_room_structure');
  const client = rlsClient(ctx.user.accessToken);
  try {
    await assertHotelAndRoomTypeExist(client, input.hotel_id, input.room_type_id);
    const updated = await updateManagedRoomType(client, input);
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
  const client = rlsClient(ctx.user.accessToken);
  try {
    await assertHotelAndRoomTypeExist(client, input.hotel_id, input.room_type_id);
    const removed = await deleteManagedRoomType(client, input);
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
  const client = rlsClient(ctx.user.accessToken);
  try {
    await assertHotelExists(client, input.hotel_id);
    return await createHotelService(client, input);
  } catch (error) {
    if (error instanceof TRPCError) throw error;
    return rethrowDomainError(error);
  }
});

export const updateHotelServiceProcedure = protectedProcedure.input(updateHotelServiceSchema).mutation(async ({ ctx, input }) => {
  requireHotelPermission(ctx.user, input.hotel_id, 'property.manage_room_structure');
  const client = rlsClient(ctx.user.accessToken);
  try {
    const updated = await updateHotelService(client, input);
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
  const client = rlsClient(ctx.user.accessToken);
  try {
    const removed = await deleteHotelService(client, input);
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
  const client = rlsClient(ctx.user.accessToken);
  try {
    return await listHotelServices(client, input);
  } catch (error) {
    return rethrowDomainError(error);
  }
});

export const listPublicHotelServices = rateLimitedProcedure.input(listPublicHotelServicesSchema).query(async ({ input }) => {
  try {
    return await listActiveHotelServicesBySlug(rlsClient(), input.slug);
  } catch (error) {
    return rethrowDomainError(error);
  }
});

export const publicHotel = rateLimitedProcedure.input(z.string().trim().min(1).max(100)).query(async ({ input }) => {
  try {
    return await getPublicHotel(rlsClient(), input);
  } catch (error) {
    return rethrowDomainError(error);
  }
});

export const getHotelSiteConfig = rateLimitedProcedure.input(z.string().trim().min(1).max(100)).query(async ({ input }) => {
  try {
    const result = await getHotelSiteConfigBySlug(rlsClient(), input);
    return result;
  } catch (error) {
    const code = (error as { code?: string })?.code;
    const msg = error instanceof Error ? error.message : '';
    if (code === '42P01' || code === 'PGRST205' || /hotel_site_config.*does not exist/i.test(msg)) return null;
    return rethrowDomainError(error);
  }
});

export const getHotelSiteConfigByHotelId = protectedProcedure.input(z.object({ hotel_id: hotelIdSchema })).query(async ({ ctx, input }) => {
  requireHotelPermission(ctx.user, input.hotel_id, 'property.view');
  try {
    return await dbGetHotelSiteConfig(rlsClient(ctx.user.accessToken), input.hotel_id);
  } catch (error) {
    const code = (error as { code?: string })?.code;
    const msg = error instanceof Error ? error.message : '';
    if (code === '42P01' || code === 'PGRST205' || /hotel_site_config.*does not exist/i.test(msg)) return null;
    return rethrowDomainError(error);
  }
});

export const saveHotelSiteConfig = protectedProcedure.input(hotelSiteConfigSaveSchema).mutation(async ({ ctx, input }) => {
  requireHotelPermission(ctx.user, input.hotel_id, 'property.manage_profile');
  const client = rlsClient(ctx.user.accessToken);
  try {
    await assertHotelExists(client, input.hotel_id);
    return await dbSaveHotelSiteConfig(client, input);
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

export const listHotelMedia = protectedProcedure.input(z.object({ hotel_id: hotelIdSchema })).query(async ({ ctx, input }) => {
  requireHotelPermission(ctx.user, input.hotel_id, 'property.view');
  try {
    return await dbListHotelMedia(rlsClient(ctx.user.accessToken), input.hotel_id);
  } catch (error) {
    return rethrowDomainError(error);
  }
});

export const uploadHotelMedia = protectedProcedure.input(uploadHotelMediaSchema).mutation(async ({ ctx, input }) => {
  requireHotelPermission(ctx.user, input.hotel_id, 'property.manage_profile');
  const client = rlsClient(ctx.user.accessToken);
  try {
    await assertHotelExists(client, input.hotel_id);
    const match = input.base64.match(/^data:([^;]+);base64,(.+)$/);
    let buffer: Buffer;
    let contentType = 'application/octet-stream';
    if (match) {
      contentType = match[1];
      buffer = Buffer.from(match[2], 'base64');
    } else {
      buffer = Buffer.from(input.base64, 'base64');
    }

    const relKey = `hotel-media/${input.hotel_id}/${input.filename}`;
    const { url } = await storagePut(relKey, buffer, contentType);

    const existingMedia = await dbListHotelMedia(client, input.hotel_id);
    const is_hero = existingMedia.length === 0;
    const display_order = existingMedia.length;

    return await dbCreateHotelMedia(client, {
      hotel_id: input.hotel_id,
      url,
      caption: input.caption ?? input.filename,
      is_hero,
      display_order,
    });
  } catch (error) {
    return rethrowDomainError(error);
  }
});

export const deleteHotelMedia = protectedProcedure.input(deleteHotelMediaSchema).mutation(async ({ ctx, input }) => {
  requireHotelPermission(ctx.user, input.hotel_id, 'property.manage_profile');
  const client = rlsClient(ctx.user.accessToken);
  try {
    await assertHotelExists(client, input.hotel_id);
    const deleted = await dbDeleteHotelMedia(client, input.media_id);
    if (!deleted) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'This media item could not be deleted.' });
    }

    const remaining = await dbListHotelMedia(client, input.hotel_id);
    if (remaining.length > 0 && !remaining.some(m => m.is_hero)) {
      await dbSetHotelMediaHero(client, input.hotel_id, remaining[0].id);
    }

    return deleted;
  } catch (error) {
    return rethrowDomainError(error);
  }
});

export const setHotelMediaHero = protectedProcedure.input(setHotelMediaHeroSchema).mutation(async ({ ctx, input }) => {
  requireHotelPermission(ctx.user, input.hotel_id, 'property.manage_profile');
  const client = rlsClient(ctx.user.accessToken);
  try {
    await assertHotelExists(client, input.hotel_id);
    await dbSetHotelMediaHero(client, input.hotel_id, input.media_id);
    return { success: true as const };
  } catch (error) {
    return rethrowDomainError(error);
  }
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
  listHotelMedia,
  uploadHotelMedia,
  deleteHotelMedia,
  setHotelMediaHero,
});
