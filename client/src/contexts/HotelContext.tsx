import React, { createContext, useContext, useEffect, useMemo, useState, useCallback } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";

export const SELECTED_HOTEL_STORAGE_KEY = "selected-hotel-id";

export type VisibleHotel = {
  id: string;
  name: string;
  slug: string;
  address?: string | null;
  public_enabled?: boolean;
  [key: string]: any;
};

export type HotelContextValue = {
  hotels: VisibleHotel[];
  selectedHotel: VisibleHotel | null;
  selectedHotelId: string | null;
  isLoading: boolean;
  isError: boolean;
  setSelectedHotelId: (hotelId: string) => void;
  clearSelectedHotel: () => void;
  refetchHotels: () => Promise<unknown>;
};

const HotelContext = createContext<HotelContextValue | undefined>(undefined);

export type HotelProviderProps = {
  children: React.ReactNode;
  /** Optional override of visible hotels (e.g. for testing or pre-fetched query results) */
  hotels?: VisibleHotel[];
  /** Optional override of loading state */
  isLoading?: boolean;
  /** Optional override of error state */
  isError?: boolean;
  /** Optional override for refetching hotels */
  onRefetch?: () => Promise<unknown>;
};

export function HotelProvider({
  children,
  hotels: propHotels,
  isLoading: propIsLoading,
  isError: propIsError,
  onRefetch,
}: HotelProviderProps) {
  const [location] = useLocation();

  // If hotels are passed via props (e.g. in tests), skip the TRPC hook query.
  const queryResult = trpc.channelManager.hotels.useQuery(undefined, {
    enabled: propHotels === undefined,
  });

  const hotels: VisibleHotel[] = useMemo(() => {
    return propHotels ?? queryResult.data ?? [];
  }, [propHotels, queryResult.data]);

  const isLoading = propIsLoading ?? (propHotels === undefined ? queryResult.isLoading : false);
  const isError = propIsError ?? (propHotels === undefined ? queryResult.isError : false);

  const refetchHotels = useCallback(async () => {
    if (onRefetch) {
      return onRefetch();
    }
    return queryResult.refetch();
  }, [onRefetch, queryResult]);

  // Extract hotel UUID from URL if on a /hotels/:id route
  const routeHotelId = useMemo(() => {
    const match = /^\/hotels\/([0-9a-f-]{36})(?:\/|$)/i.exec(location);
    return match?.[1] ?? null;
  }, [location]);

  // Determine the effective active hotel ID
  const [selectedHotelId, setSelectedHotelIdState] = useState<string | null>(() => {
    const stored = typeof window !== "undefined" ? localStorage.getItem(SELECTED_HOTEL_STORAGE_KEY) : null;
    return stored;
  });

  // Sync state whenever hotels list, route, or localStorage changes
  useEffect(() => {
    if (isLoading) return;

    if (!hotels.length) {
      setSelectedHotelIdState(null);
      return;
    }

    // 1. If route has a valid hotel ID in allowed hotels, it takes precedence
    if (routeHotelId && hotels.some(h => h.id === routeHotelId)) {
      setSelectedHotelIdState(routeHotelId);
      localStorage.setItem(SELECTED_HOTEL_STORAGE_KEY, routeHotelId);
      return;
    }

    // 2. Check current state or localStorage
    const currentOrStoredId = selectedHotelId ?? (typeof window !== "undefined" ? localStorage.getItem(SELECTED_HOTEL_STORAGE_KEY) : null);
    if (currentOrStoredId && hotels.some(h => h.id === currentOrStoredId)) {
      if (selectedHotelId !== currentOrStoredId) {
        setSelectedHotelIdState(currentOrStoredId);
      }
      localStorage.setItem(SELECTED_HOTEL_STORAGE_KEY, currentOrStoredId);
      return;
    }

    // 3. Fallback to the first allowed hotel
    const fallbackId = hotels[0].id;
    setSelectedHotelIdState(fallbackId);
    localStorage.setItem(SELECTED_HOTEL_STORAGE_KEY, fallbackId);
  }, [hotels, routeHotelId, isLoading, selectedHotelId]);

  const setSelectedHotelId = useCallback((hotelId: string) => {
    if (!hotels.some(h => h.id === hotelId)) {
      console.warn(`[HotelContext] Attempted to select unauthorized or unknown hotel: ${hotelId}`);
      return;
    }
    setSelectedHotelIdState(hotelId);
    if (typeof window !== "undefined") {
      localStorage.setItem(SELECTED_HOTEL_STORAGE_KEY, hotelId);
    }
  }, [hotels]);

  const clearSelectedHotel = useCallback(() => {
    setSelectedHotelIdState(null);
    if (typeof window !== "undefined") {
      localStorage.removeItem(SELECTED_HOTEL_STORAGE_KEY);
    }
  }, []);

  const selectedHotel = useMemo(() => {
    if (!selectedHotelId || !hotels.length) return null;
    return hotels.find(h => h.id === selectedHotelId) ?? null;
  }, [hotels, selectedHotelId]);

  const value: HotelContextValue = useMemo(() => ({
    hotels,
    selectedHotel,
    selectedHotelId,
    isLoading,
    isError,
    setSelectedHotelId,
    clearSelectedHotel,
    refetchHotels,
  }), [
    hotels,
    selectedHotel,
    selectedHotelId,
    isLoading,
    isError,
    setSelectedHotelId,
    clearSelectedHotel,
    refetchHotels,
  ]);

  return <HotelContext.Provider value={value}>{children}</HotelContext.Provider>;
}

export function useHotel(): HotelContextValue {
  const context = useContext(HotelContext);
  if (!context) {
    throw new Error("useHotel must be used within a HotelProvider");
  }
  return context;
}

export const useSelectedHotel = useHotel;
