import React, { useEffect, useState } from "react";
import { trpc } from "@/lib/trpc";
import { useTranslation } from "@/lib/i18n";
import { usePageMeta } from "@/lib/pageMeta";
import { calculateServiceTotal } from "@shared/pricingModels";

export const DEFAULT_HERO_COPY = "Explore room types, rates, and availability directly from this hotel.";
export const DEFAULT_ACCENT_COLOR = "#954831";

function getTomorrowDateString(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

function getDayAfterTomorrowDateString(): string {
  const d = new Date();
  d.setDate(d.getDate() + 2);
  return d.toISOString().slice(0, 10);
}

export function usePublicHotelPage(slug: string) {
  const { t, language, setLanguage, toggleLanguage } = useTranslation();
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
  const [confirmedBookingId, setConfirmedBookingId] = useState<string | null>(null);
  const [wizardError, setWizardError] = useState<string | null>(null);
  const [paymentSuccess, setPaymentSuccess] = useState(false);
  const [remainingMs, setRemainingMs] = useState(0);

  // A private or unknown hotel answers NOT_FOUND at once; retrying it only kept
  // guests looking at a loading screen.
  const publicHotel = trpc.channelManager.publicHotel.useQuery(slug, {
    retry: (failureCount, error) => error.data?.code !== "NOT_FOUND" && failureCount < 2,
  });
  const siteConfigQuery = trpc.channelManager.getHotelSiteConfig.useQuery(slug, {
    enabled: !publicHotel.isLoading && !publicHotel.error,
  });

  const isDatesValid = Boolean(checkIn && checkOut && checkOut > checkIn);
  const propertyChildRule = publicHotel.data?.roomTypes[0]?.childRule ?? 'age';
  const childRulesConfigured = (publicHotel.data?.roomTypes.length ?? 0) > 0 && publicHotel.data!.roomTypes.every(roomType => roomType.childRule === 'age' || roomType.childRuleLimit != null);
  const childMeasurements = children.filter(value => value !== '').map(value => propertyChildRule === 'age' ? { age: Number(value) } : { height_cm: Number(value) });
  const guestsValid = adults >= 1 && children.every(value => value !== '' && Number.isFinite(Number(value)) && Number(value) >= 0);

  const availabilityQuery = trpc.channelManager.publicHotelAvailability.useQuery(
    { slug, check_in: checkIn ?? "", check_out: checkOut ?? "", adults, children: childMeasurements },
    {
      enabled: Boolean(slug && isDatesValid && wizardStep >= 2 && !publicHotel.isLoading && !publicHotel.error),
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
    onError: (err) => setWizardError(err.message),
  });

  const servicesQuery = trpc.channelManager.listPublicHotelServices.useQuery(
    { slug },
    { enabled: wizardStep >= 3 },
  );

  const confirmDetailsMutation = trpc.channelManager.confirmBookingDetails.useMutation({
    onSuccess: (data) => {
      setConfirmedBookingId(data.booking_id);
      setWizardError(null);
      setWizardStep(5);
    },
    onError: (err) => setWizardError(err.message),
  });

  const loading = publicHotel.isLoading;
  const notFound = publicHotel.error?.data?.code === "NOT_FOUND";
  const error = publicHotel.error;
  const metaHotel = publicHotel.data?.hotel;
  usePageMeta(metaHotel
    ? {
      title: t("publicHotel.metaTitle", { name: metaHotel.name }),
      description: siteConfigQuery.data?.heroCopy?.trim() || t("publicHotel.metaDescription", { name: metaHotel.name, address: metaHotel.address }),
    }
    : notFound ? { title: t("publicHotel.hotelUnavailableTitle"), description: t("publicHotel.hotelUnavailableDesc"), noindex: true } : null);

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
    setConfirmedBookingId(null);
    setWizardError(null);
    setPaymentSuccess(false);
    setRemainingMs(0);
  };

  // Lazy-expiry countdown for the held/pending booking (steps 2-5).
  // Every hook must run before the early return below, or React throws error #310.
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

  if (!publicHotel.data) return { hotel: null, roomTypes: [], media: [], heroImage: undefined, siteConfig: null, accentColor: DEFAULT_ACCENT_COLOR, visibleSections: null, heroCopy: DEFAULT_HERO_COPY, language: undefined, t, loading, error, notFound, refetch: publicHotel.refetch, booking: null };
  const { hotel, roomTypes, media } = publicHotel.data;
  const heroImage = media.find(item => item.is_hero)?.url ?? media[0]?.url;

  // hotel_site_config fallback: when no config row or table missing, use fixed copy/colors
  const siteConfig = siteConfigQuery.data ?? null;
  const heroCopy = siteConfig?.heroCopy ?? DEFAULT_HERO_COPY;
  const accentColor = siteConfig?.accentColor ?? DEFAULT_ACCENT_COLOR;
  const visibleSections = (siteConfig?.visibleSections as Record<string, boolean> | null) ?? null;
  const isVisible = (key: string) => visibleSections?.[key] !== false;

  const availableRoomTypes = availabilityQuery.data?.room_types ?? [];

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
      guest_email: guestEmail.trim() || undefined,
      guest_phone: guestPhone.trim() || undefined,
      special_requests: specialRequests.trim() || undefined,
      services,
    });
  };

  const serviceLineTotal = (service: { name: string; pricingModel: string; unitPrice: number | string }, qty: number) =>
    calculateServiceTotal(
      {
        service_name: service.name,
        pricing_model: service.pricingModel as "PER_PERSON_PER_NIGHT" | "PER_NIGHT" | "ONE_TIME",
        unit_price: Number(service.unitPrice),
        quantity: qty,
      },
      heldBooking?.nights ?? 0,
    );

  const selectedServicesTotal = (servicesQuery.data ?? []).reduce(
    (sum, s) => sum + serviceLineTotal(s, selectedServiceQty[s.id] ?? 0),
    0,
  );

  return {
    hotel, roomTypes, media, heroImage, siteConfig, accentColor, visibleSections, heroCopy,
    language, setLanguage, toggleLanguage, t, loading, error, notFound, refetch: publicHotel.refetch,
    isVisible,
    booking: {
      wizardStep, setWizardStep, checkIn, setCheckIn, checkOut, setCheckOut, adults, setAdults,
      children, setChildren, preferredRoomTypeId, setPreferredRoomTypeId, heldBooking, setHeldBooking,
      selectedServiceQty, setSelectedServiceQty, guestName, setGuestName, guestPhone, setGuestPhone,
      guestEmail, setGuestEmail, specialRequests, setSpecialRequests, confirmedBookingId, setConfirmedBookingId,
      wizardError, setWizardError, paymentSuccess, setPaymentSuccess, remainingMs,
      isDatesValid, propertyChildRule, childRulesConfigured, childMeasurements, guestsValid,
      availabilityQuery, availableRoomTypes, holdRoomTypeMutation, servicesQuery, confirmDetailsMutation,
      handleSelectRoom, handleResetBooking, handleHoldRoom, handleConfirmDetails, serviceLineTotal, selectedServicesTotal,
      isVisible: (key: string) => visibleSections?.[key] !== false,
    },
  };
}
