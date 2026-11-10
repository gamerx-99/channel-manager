import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { BOOKING_DOCUMENT_TYPES, TAX_ID_PATTERN } from '@shared/bookingDocuments';
import { protectedProcedure, router } from '../_core/trpc';
import { getBookingDocument, getInvoiceSettings, issueBookingDocument, listBookingDocuments, listHotelDocuments, saveInvoiceSettings } from '../d1/bookingDocuments';
import { createEmailSender } from '../email';
import { generateBookingDocumentPdf, uint8ArrayToBase64 } from '../pdf/bookingDocumentPdf';
import { requireHotelPermission, rethrowDomainError } from '../routerUtils';

const hotelInput = z.object({ hotel_id: z.string().min(1) });
const optionalText = (limit: number) => z.string().trim().max(limit).nullable().optional().transform(value => value || null);
const taxId = z.string().trim().nullable().optional().transform(value => (value ? value.replace(/\D/g, '') || null : null))
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
    vat_enabled: z.boolean(),
    vat_rate: z.number().min(0).max(100).multipleOf(0.01),
    withholding_enabled: z.boolean(),
    withholding_rate: z.number().min(0).max(100).multipleOf(0.01),
  })).mutation(async ({ ctx, input }) => {
    requireHotelPermission(ctx.user, input.hotel_id, 'property.manage_profile');
    try {
      return await saveInvoiceSettings(requireDb(ctx.db), ctx.caller ?? { userId: ctx.user.id }, input.hotel_id, {
        enabled: input.enabled, issuerName: input.issuer_name, address: input.address,
        taxId: input.tax_id, branch: input.branch, phone: input.phone,
        vatEnabled: input.vat_enabled, vatRate: input.vat_rate,
        withholdingEnabled: input.withholding_enabled, withholdingRate: input.withholding_rate,
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

  listHotel: protectedProcedure.input(hotelInput.extend({
    limit: z.number().int().min(1).max(100).default(50),
  })).query(async ({ ctx, input }) => {
    requireHotelPermission(ctx.user, input.hotel_id, 'operations.view_bookings');
    try {
      return await listHotelDocuments(requireDb(ctx.db), ctx.caller ?? { userId: ctx.user.id }, input.hotel_id, input.limit);
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
    idempotency_key: optionalText(100),
  })).mutation(async ({ ctx, input }) => {
    // ASSUMPTION: staff who may manage bookings may issue documents; no separate permission yet.
    requireHotelPermission(ctx.user, input.hotel_id, 'operations.manage_bookings');
    try {
      return await issueBookingDocument(requireDb(ctx.db), ctx.caller ?? { userId: ctx.user.id }, input.hotel_id, {
        bookingId: input.booking_id,
        type: input.type,
        buyer: { name: input.buyer_name, address: input.buyer_address, taxId: input.buyer_tax_id, branch: input.buyer_branch },
        idempotencyKey: input.idempotency_key,
      });
    } catch (error) {
      return rethrowDomainError(error);
    }
  }),

  getPdf: protectedProcedure.input(hotelInput.extend({
    document_id: z.string().optional(),
    snapshot: z.custom<any>().optional(),
  })).mutation(async ({ ctx, input }) => {
    requireHotelPermission(ctx.user, input.hotel_id, 'operations.view_bookings');
    try {
      let snapshot = input.snapshot;
      if (!snapshot && input.document_id) {
        const doc = await getBookingDocument(requireDb(ctx.db), ctx.caller ?? { userId: ctx.user.id }, input.hotel_id, input.document_id);
        snapshot = doc.snapshot;
      }
      if (!snapshot) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Document ID or snapshot required.' });
      const pdfBytes = await generateBookingDocumentPdf(snapshot);
      const base64 = uint8ArrayToBase64(pdfBytes);
      const filename = `${snapshot.type}_${snapshot.number}_${snapshot.issuedOn}.pdf`;
      return { base64, filename, contentType: 'application/pdf' };
    } catch (error) {
      return rethrowDomainError(error);
    }
  }),

  emailDocument: protectedProcedure.input(hotelInput.extend({
    document_id: z.string().min(1),
    recipient_email: z.string().email(),
  })).mutation(async ({ ctx, input }) => {
    requireHotelPermission(ctx.user, input.hotel_id, 'operations.manage_bookings');
    try {
      const doc = await getBookingDocument(requireDb(ctx.db), ctx.caller ?? { userId: ctx.user.id }, input.hotel_id, input.document_id);
      const snapshot = doc.snapshot;
      const pdfBytes = await generateBookingDocumentPdf(snapshot);
      const emailSender = createEmailSender(ctx.billingEnv);
      const result = await emailSender.sendBookingDocumentEmail({
        to: input.recipient_email,
        guestName: snapshot.buyer.name,
        hotelName: snapshot.issuer.name,
        documentType: snapshot.type,
        documentNumber: snapshot.number,
        pdfBytes,
      });
      return { success: true, messageId: result.id };
    } catch (error) {
      return rethrowDomainError(error);
    }
  }),
});
