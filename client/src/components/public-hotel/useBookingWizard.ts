import React, { useEffect, useRef, useState } from "react";
import { trpc } from "@/lib/trpc";
import { emailsMatch, isValidGuestEmail, suggestEmailCorrection } from "@/lib/emailCheck";
import { localizeServerMessage, storedLanguage } from "@/lib/serverErrors";
import { bangkokDate } from "@shared/finance";
import {
  isDatesValid as checkDatesValid,
  areGuestsValid,
  parseChildMeasurements,
  serviceLineTotal as computeServiceLineTotal,
  selectedServicesTotal as computeSelectedServicesTotal,
} from "./bookingRules";

const DAY_MS = 24 * 60 * 60 * 1000;

/** The date `daysAhead` days from now, as the calendar day in Thailand (not the UTC day). */
function thaiDateAhead(daysAhead: number): string {
  return bangkokDate(new Date(Date.now() + daysAhead * DAY_MS));
}

/** Today in Thailand. The earliest check-in a guest may pick. */
export function getTodayDateString(): string {
  return thaiDateAhead(0);
}

export function getTomorrowDateString(): string {
  return thaiDateAhead(1);
}

export function getDayAfterTomorrowDateString(): string {
  return thaiDateAhead(2);
}

type TFunction = (key: string, params?: any) => string;

export function useBookingWizard(args: {
  slug: string;
  t: TFunction;
  roomTypes: { childRule?: string; childRuleLimit?: string | null }[] | undefined;
  visibleSections: Record<string, boolean> | null;
  /** False while the hotel is loading or failed to load; availability waits for it. */
  hotelReady: boolean;
}) {
  const { slug, t, roomTypes, visibleSections, hotelReady } = args;

  const [wizardStep, setWizardStep] = useState<1 | 2 | 3 | 4 | 5 | 6>(1);
  const [checkIn, setCheckIn] = useState<string | null>(getTomorrowDateString());
  const [checkOut, setCheckOut] = useState<string | null>(getDayAfterTomorrowDateString());
  const [adults, setAdults] = useState(2);
  const [children, setChildren] = useState<string[]>([]);
  const [preferredRoomTypeId, setPreferredRoomTypeId] = useState<string | null>(null);
  const [heldBooking, setHeldBooking] = useState<{
    bookingId: string;
    hotelId: string;
    roomId: string;
    expiresAt: string;
    roomTypeName: string;
    roomNumber: string;
    totalPrice: number | string;
    nights: number;
  } | null>(null);
  const [selectedServiceQty, setSelectedServiceQty] = useState<Record<string, number>>({});
  const [guestName, setGuestName] = useState("");
  const [guestPhone, setGuestPhone] = useState("");
  const [guestEmail, setGuestEmail] = useState("");
  const [specialRequests, setSpecialRequests] = useState("");
  const [guestEmailConfirm, setGuestEmailConfirm] = useState("");
  const warnedEmailRef = useRef("");
  // Owner decision 2026-11-11 (sheet 3.2): the guest ticks the booking conditions before going on to payment.
  // ASSUMPTION: checked in the browser only; no consent record is sent or stored.
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [confirmedBookingId, setConfirmedBookingId] = useState<string | null>(null);
  const [wizardError, setWizardError] = useState<string | null>(null);
  const [paymentSuccess, setPaymentSuccess] = useState(false);
  const [remainingMs, setRemainingMs] = useState(0);
  const resumedFromLink = useRef(false);

  const resolvedRoomTypes = roomTypes ?? [];
  const propertyChildRule = resolvedRoomTypes[0]?.childRule ?? "age";
  const childRulesConfigured =
    resolvedRoomTypes.length > 0 &&
    resolvedRoomTypes.every((rt) => rt.childRule === "age" || rt.childRuleLimit != null);

  const isDatesValid = checkDatesValid(checkIn, checkOut);
  const guestsValid = areGuestsValid(adults, children);
  const childMeasurements = parseChildMeasurements(children, propertyChildRule);

  const availabilityQuery = trpc.channelManager.publicHotelAvailability.useQuery(
    { slug, check_in: checkIn ?? "", check_out: checkOut ?? "", adults, children: childMeasurements },
    {
      enabled: Boolean(slug && isDatesValid && wizardStep >= 2 && hotelReady),
      staleTime: 30_000,
    },
  );

  const holdRoomTypeMutation = trpc.channelManager.holdRoomType.useMutation({
    onSuccess: (data: any) => {
      setHeldBooking({
        bookingId: data.booking_id,
        hotelId: data.hotel_id,
        roomId: data.room_id,
        expiresAt: data.expires_at,
        roomTypeName: data.room_type_name,
        roomNumber: data.room_number,
        totalPrice: data.total_price,
        nights: data.nights,
      });
      setWizardError(null);
      setWizardStep(3);
    },
    onError: (err) => setWizardError(localizeServerMessage(err.message, storedLanguage())),
  });

  const servicesQuery = trpc.channelManager.listPublicHotelServices.useQuery({ slug }, { enabled: wizardStep >= 3 });

  const confirmDetailsMutation = trpc.channelManager.confirmBookingDetails.useMutation({
    onSuccess: (data) => {
      setConfirmedBookingId(data.booking_id);
      setWizardError(null);
      setWizardStep(5);
    },
    onError: (err) => setWizardError(err.message),
  });

  const availableRoomTypes = availabilityQuery.data?.room_types ?? [];

  // The payment email carries the booking and hotel IDs. The server validates
  // their relationship before creating or returning a payment session.
  useEffect(() => {
    if (!hotelReady || resumedFromLink.current || typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const bookingId = params.get("booking_id");
    const hotelId = params.get("hotel_id");
    if (!bookingId || !hotelId) return;
    resumedFromLink.current = true;
    setHeldBooking({
      bookingId,
      hotelId,
      roomId: "",
      expiresAt: "2099-01-01T00:00:00.000Z",
      roomTypeName: "",
      roomNumber: "",
      totalPrice: 0,
      nights: 0,
    });
    setConfirmedBookingId(bookingId);
    setWizardError(null);
    setWizardStep(6);
  }, [hotelReady]);

  const handleSelectRoom = (roomTypeId: string) => {
    setPreferredRoomTypeId(roomTypeId);
    setWizardError(null);
    const bookElem = document.getElementById("book");
    if (bookElem) {
      bookElem.scrollIntoView({ behavior: "smooth" });
    }
  };

  const handleHoldRoom = (roomTypeId: string) => {
    if (!checkIn || !checkOut || !isDatesValid) return;
    holdRoomTypeMutation.mutate({
      slug,
      room_type_id: roomTypeId,
      check_in: checkIn,
      check_out: checkOut,
      adults,
      children: childMeasurements,
    });
  };

  const handleConfirmDetails = (e: React.FormEvent) => {
    e.preventDefault();
    if (!heldBooking) return;
    if (!guestName.trim()) {
      setWizardError(t("publicHotel.errorEnterFullName"));
      return;
    }
    if (!isValidGuestEmail(guestEmail)) {
      setWizardError(t("publicHotel.errorInvalidEmail"));
      return;
    }
    if (!emailsMatch(guestEmail, guestEmailConfirm)) {
      setWizardError(t("publicHotel.errorEmailMismatch"));
      return;
    }
    // Domain (everything after @) looks like a typo: stop once and ask. Submitting
    // the same address again is accepted, so unusual real domains are never locked out.
    const domainSuggestion = suggestEmailCorrection(guestEmail);
    if (domainSuggestion && warnedEmailRef.current !== guestEmail.trim().toLowerCase()) {
      warnedEmailRef.current = guestEmail.trim().toLowerCase();
      setWizardError(t("publicHotel.errorEmailDomainTypo", { email: domainSuggestion }));
      return;
    }
    if (!termsAccepted) {
      setWizardError(t("guestConsent.required"));
      return;
    }

    const services = (servicesQuery.data ?? [])
      .filter((s) => (selectedServiceQty[s.id] ?? 0) > 0)
      .map((s) => ({
        hotel_service_id: s.id,
        quantity: selectedServiceQty[s.id],
      }));

    setWizardError(null);
    confirmDetailsMutation.mutate({
      booking_id: heldBooking.bookingId,
      hotel_id: heldBooking.hotelId,
      guest_name: guestName.trim(),
      guest_email: guestEmail.trim(),
      guest_phone: guestPhone.trim() || undefined,
      special_requests: specialRequests.trim() || undefined,
      services,
    });
  };

  const serviceLineTotal = (service: any, qty: number) =>
    computeServiceLineTotal(service, qty, heldBooking?.nights ?? 0);

  const selectedServicesTotal = computeSelectedServicesTotal(
    (servicesQuery.data ?? []) as any,
    selectedServiceQty,
    heldBooking?.nights ?? 0,
  );

  const handleResetBooking = () => {
    setWizardStep(1);
    setCheckIn(getTomorrowDateString());
    setCheckOut(getDayAfterTomorrowDateString());
    setAdults(2);
    setChildren([]);
    setPreferredRoomTypeId(null);
    setHeldBooking(null);
    setSelectedServiceQty({});
    setGuestName("");
    setGuestPhone("");
    setGuestEmail("");
    setSpecialRequests("");
    setTermsAccepted(false);
    setConfirmedBookingId(null);
    setWizardError(null);
    setPaymentSuccess(false);
    setRemainingMs(0);
  };

  // Lazy-expiry countdown for the held/pending booking (steps 2-5).
  useEffect(() => {
    if (!heldBooking?.expiresAt || wizardStep < 2 || wizardStep > 5) return;
    const tick = () => {
      const ms = new Date(heldBooking.expiresAt).getTime() - Date.now();
      setRemainingMs(Math.max(0, ms));
      if (ms <= 0) {
        setWizardError(t("publicHotel.holdExpiredRestart"));
        handleResetBooking();
      }
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [heldBooking?.expiresAt, wizardStep, t]);

  const isVisible = (key: string) => visibleSections?.[key] !== false;

  return {
    wizardStep,
    setWizardStep,
    checkIn,
    setCheckIn,
    checkOut,
    setCheckOut,
    adults,
    setAdults,
    children,
    setChildren,
    preferredRoomTypeId,
    setPreferredRoomTypeId,
    heldBooking,
    setHeldBooking,
    selectedServiceQty,
    setSelectedServiceQty,
    guestName,
    setGuestName,
    guestPhone,
    setGuestPhone,
    guestEmail,
    setGuestEmail,
    guestEmailConfirm,
    setGuestEmailConfirm,
    specialRequests,
    setSpecialRequests,
    termsAccepted,
    setTermsAccepted,
    confirmedBookingId,
    setConfirmedBookingId,
    wizardError,
    setWizardError,
    paymentSuccess,
    setPaymentSuccess,
    remainingMs,
    isDatesValid,
    propertyChildRule,
    childRulesConfigured,
    childMeasurements,
    guestsValid,
    availabilityQuery,
    availableRoomTypes,
    holdRoomTypeMutation,
    servicesQuery,
    confirmDetailsMutation,
    handleSelectRoom,
    handleResetBooking,
    handleHoldRoom,
    handleConfirmDetails,
    serviceLineTotal,
    selectedServicesTotal,
    isVisible,
  };
}
