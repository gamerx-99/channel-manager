import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { BOOKING_DOCUMENT_TYPES, TAX_ID_PATTERN } from '@shared/bookingDocuments';
import { protectedProcedure, router } from '../_core/trpc';
import { getInvoiceSettings, issueBookingDocument, listBookingDocuments, saveInvoiceSettings } from '../d1/bookingDocuments';
import { requireHotelPermission, rethrowDomainError } from '../routerUtils';

const hotelInput = z.object({ hotel_id: z.string().min(1) });
const optionalText = (limit: number) => z.string().trim().max(limit).transform(value => value || null).nullable();
const taxId = z.string().trim().transform(value => value.replace(/\D/g, '') || null).nullable()
  .refine(value => value == null || TAX_ID_PATTERN.test(value), 'A tax ID has 13 digits.');

function requireDb<T>(db: T | undefined | null): T {
  if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'D1 database required.' });
  return db;
}

export const bookingDocumentsRouter = router({
  settings: protectedProcedure.input(hotelInput).query(async ({ ctx, input }) => {
    requireHotelPermission(ctx.user, input.hotel_id, 'property.view');
    try {
      return await getInvoiceSettings(requireDb(ctx.db), ctx.caller ?? { userId: ctx.user.id }, input.hotel_id);
    } catch (error) {
      return rethrowDomainError(error);
    }
  }),

  saveSettings: protectedProcedure.input(hotelInput.extend({
    enabled: z.boolean(),
    issuer_name: z.string().trim().min(1).max(200),
    address: z.string().trim().min(1).max(500),
    tax_id: taxId,
    branch: optionalText(100),
    phone: optionalText(40),
  })).mutation(async ({ ctx, input }) => {
    requireHotelPermission(ctx.user, input.hotel_id, 'property.manage_profile');
    try {
      return await saveInvoiceSettings(requireDb(ctx.db), ctx.caller ?? { userId: ctx.user.id }, input.hotel_id, {
        enabled: input.enabled, issuerName: input.issuer_name, address: input.address,
        taxId: input.tax_id, branch: input.branch, phone: input.phone,
      });
    } catch (error) {
      return rethrowDomainError(error);
    }
  }),

  list: protectedProcedure.input(hotelInput.extend({ booking_id: z.string().min(1) })).query(async ({ ctx, input }) => {
    requireHotelPermission(ctx.user, input.hotel_id, 'operations.view_bookings');
    try {
      return await listBookingDocuments(requireDb(ctx.db), ctx.caller ?? { userId: ctx.user.id }, input.hotel_id, input.booking_id);
    } catch (error) {
      return rethrowDomainError(error);
    }
  }),

  issue: protectedProcedure.input(hotelInput.extend({
    booking_id: z.string().min(1),
    type: z.enum(BOOKING_DOCUMENT_TYPES),
    buyer_name: z.string().trim().min(1).max(200),
    buyer_address: optionalText(500),
    buyer_tax_id: taxId,
    buyer_branch: optionalText(100),
  })).mutation(async ({ ctx, input }) => {
    // ASSUMPTION: staff who may manage bookings may issue documents; no separate permission yet.
    requireHotelPermission(ctx.user, input.hotel_id, 'operations.manage_bookings');
    try {
      return await issueBookingDocument(requireDb(ctx.db), ctx.caller ?? { userId: ctx.user.id }, input.hotel_id, {
        bookingId: input.booking_id,
        type: input.type,
        buyer: { name: input.buyer_name, address: input.buyer_address, taxId: input.buyer_tax_id, branch: input.buyer_branch },
      });
    } catch (error) {
      return rethrowDomainError(error);
    }
  }),
});
