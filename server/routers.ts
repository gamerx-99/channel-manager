import { accessRouter } from "./routers/accessRouter";
import { router } from './_core/trpc';
import { systemRouter } from './_core/systemRouter';
import { notificationsRouter } from './routers/notificationsRouter';
import { authRouter } from './routers/authRouter';
import { paymentRouter } from './routers/paymentRouter';
import { slipokRouter } from './routers/slipokRouter';
import { otaRouter } from './routers/otaRouter';
import {
  dashboard,
  financials,
  dashboardCalendar,
} from './routers/dashboardRouter';
import {
  createHousekeepingTask,
  listHousekeepingTasks,
  updateHousekeepingTaskStatus,
} from './routers/housekeepingRouter';
import {
  listThreads,
  createThread,
  listMessages,
  sendMessage,
} from './routers/messagingRouter';
import {
  staffRouter,
  acceptStaffInvite,
  adminUsers,
  hotelStaff,
  listHotelAdminAuditLogs,
  inviteHotelStaff,
  createSignupLink,
  listSignupLinks,
  validateSignupLink,
  completeHotelOwnerSignup,
  updateHotelStaffRole,
  transferHotelAdmin,
  removeHotelStaff,
} from './routers/staffRouter';
import {
  availability,
  bookingOccupancy,
  updateAvailabilityProcedure as updateAvailability,
  createRateOverrideProcedure as createRateOverride,
  listRateOverridesProcedure as listRateOverrides,
  deleteRateOverrideProcedure as deleteRateOverride,
} from './routers/availabilityRouter';
import {
  hotels,
  canCreateHotel,
  adminHotels,
  createHotel,
  registerOwnHotel,
  hotel,
  createRoomType,
  updateRoomType,
  deleteRoomType,
  createHotelServiceProcedure,
  updateHotelServiceProcedure,
  deleteHotelServiceProcedure,
  listHotelServicesProcedure,
  listPublicHotelServices,
  publicHotel,
  getHotelSiteConfig,
  getHotelSiteConfigByHotelId,
  saveHotelSiteConfig,
  listHotelMedia,
  uploadHotelMedia,
  deleteHotelMedia,
  setHotelMediaHero,
} from './routers/hotelRouter';
import {
  bookings,
  transitionBookingStatus,
  exportTm30,
  previewTm30,
  createBooking,
  publicHotelAvailability,
  holdRoomType,
  confirmBookingDetails,
} from './routers/bookingRouter';

export const appRouter = router({
  access: accessRouter,
  system: systemRouter,
  notifications: notificationsRouter,
  auth: authRouter,
  staff: staffRouter,
  channelManager: router({
    dashboard,
      financials,
    dashboardCalendar,
    hotels,
    canCreateHotel,
    adminUsers,
    hotelStaff,
    listHotelAdminAuditLogs,
    inviteHotelStaff,
    createSignupLink,
    listSignupLinks,
    validateSignupLink,
    completeHotelOwnerSignup,
    acceptStaffInvite,
    updateHotelStaffRole,
    transferHotelAdmin,
    removeHotelStaff,
    adminHotels,
    createHotel,
    registerOwnHotel,
    hotel,
    createRoomType,
    updateRoomType,
    deleteRoomType,
    createHotelServiceProcedure,
    updateHotelServiceProcedure,
    deleteHotelServiceProcedure,
    listHotelServicesProcedure,
    bookings,
    transitionBookingStatus,
    exportTm30,
    previewTm30,
    availability,
    bookingOccupancy,
    createBooking,
    updateAvailability,
    createRateOverride,
    listRateOverrides,
    deleteRateOverride,
    createHousekeepingTask,
    listHousekeepingTasks,
    updateHousekeepingTaskStatus,
    listThreads,
    createThread,
    listMessages,
    sendMessage,
    publicHotel,
    publicHotelAvailability,
    listPublicHotelServices,
      holdRoomType,
    confirmBookingDetails,
    getHotelSiteConfig,
    getHotelSiteConfigByHotelId,
    saveHotelSiteConfig,
    listHotelMedia,
    uploadHotelMedia,
    deleteHotelMedia,
    setHotelMediaHero,
    ota: otaRouter,
  }),

  // ── Phase 01: SlipOK per-hotel payment settings ───────────────────────────
  slipok: slipokRouter,

  // ── Phase 12B: Public booking payment flow ─────────────────────────────
  payment: paymentRouter,
});

export type AppRouter = typeof appRouter;
