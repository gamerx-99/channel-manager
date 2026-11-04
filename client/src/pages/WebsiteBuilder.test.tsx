// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const { saveConfig, setObjectPosition, query, mutation, language, hotelsData, mediaData } = vi.hoisted(() => ({
  saveConfig: vi.fn(),
  setObjectPosition: vi.fn(),
  language: { current: "en" as "en" | "th" },
  hotelsData: { current: [{ id: "hotel-1", name: "Baan", slug: "baan", room_types: [], rooms: [] }] as Array<{ id: string; name?: string; slug: string; room_types: unknown[]; rooms: unknown[] }> },
  mediaData: { current: [] as Array<{ id: string; url: string; isHero: boolean; displayOrder: number; objectPosition?: string | null }> },
  query: (data: unknown) => ({ useQuery: () => ({ data, isLoading: false, isError: false, refetch: () => undefined, isFetching: false }) }),
  mutation: (mutate: (...args: unknown[]) => void = () => undefined) => ({ useMutation: () => ({ mutate, isPending: false }) }),
}));

vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ language: language.current, setLanguage: vi.fn(), toggleLanguage: vi.fn() }) }));
vi.mock("@/lib/trpc", () => ({ trpc: {
  useUtils: () => ({ channelManager: { hotels: { invalidate: vi.fn() } } }),
  channelManager: {
    hotels: { useQuery: () => ({ data: hotelsData.current, isLoading: false, isError: false, refetch: () => undefined, isFetching: false }) },
    listHotelMedia: { useQuery: () => ({ data: mediaData.current, isLoading: false, isError: false, refetch: () => undefined, isFetching: false }) },
    getHotelSiteConfigByHotelId: query({ hotelId: "hotel-1", theme: null, heroCopy: "Old headline", accentColor: "#1d6b56", visibleSections: { hero: true, story: true, rooms: true, booking: true, location: true } }),
    deleteHotelMedia: mutation(),
    setHotelMediaHero: mutation(),
    setHotelMediaObjectPosition: mutation(setObjectPosition),
    setHotelMediaCaption: mutation(),
    setHotelMediaGallerySelection: mutation(),
    saveHotelSiteConfig: mutation(saveConfig),
    publishHotelSiteConfig: mutation(),
    discardHotelSiteConfigDraft: mutation(),
    setHotelPublished: mutation(),
  },
  auth: {
    me: query({
      roles: ["hotel_owner"],
      role: "hotel_owner",
      memberships: [
        {
          hotelId: "hotel-1",
          role: "hotel_owner",
          permissions: ["property.view", "property.manage_profile"],
        },
      ],
    }),
  },
} }));

import WebsiteBuilder from "./WebsiteBuilder";
(globalThis as { React?: typeof React }).React = React;
afterEach(() => { cleanup(); saveConfig.mockReset(); setObjectPosition.mockReset(); language.current = "en"; hotelsData.current = [{ id: "hotel-1", name: "Baan", slug: "baan", room_types: [], rooms: [] }]; mediaData.current = []; });

describe("WebsiteBuilder editing", () => {
  it("saves the headline and accent colour the owner typed (regression: edits were dropped)", () => {
    render(<QueryClientProvider client={new QueryClient()}><WebsiteBuilder /></QueryClientProvider>);
    const hero = document.getElementById("wb-hero-copy") as HTMLTextAreaElement;
    fireEvent.change(hero, { target: { value: "New headline" } });
    expect(hero.value).toBe("New headline");
    fireEvent.change(screen.getByLabelText("accent_color"), { target: { value: "#aa3300" } });
    fireEvent.click(screen.getAllByRole("button").find(button => /save draft/i.test(button.textContent ?? ""))!);
    expect(saveConfig).toHaveBeenCalledWith(expect.objectContaining({ hotel_id: "hotel-1", hero_copy: "New headline", accent_color: "#aa3300" }));
  });

  it("renders all three theme cards and saves a selected theme through the site config mutation", () => {
    render(<QueryClientProvider client={new QueryClient()}><WebsiteBuilder /></QueryClientProvider>);
    expect(document.querySelectorAll("button[data-theme-id]")).toHaveLength(3);
    expect(Array.from(document.querySelectorAll(".template-card-preview h3"), node => node.textContent)).toEqual(["Baan", "Baan", "Baan"]);
    expect(document.querySelectorAll(".template-card-preview")).toHaveLength(3);
    fireEvent.click(document.querySelector('button[data-theme-id="lanna-teak"]')!);
    expect(saveConfig).toHaveBeenCalledWith(expect.objectContaining({ hotel_id: "hotel-1", theme: "lanna-teak", hero_copy: "Old headline" }));
  });

  it("shows the localized fallback when the selected hotel has no name", () => {
    hotelsData.current = [{ id: "hotel-1", name: "", slug: "baan", room_types: [], rooms: [] }];
    render(<QueryClientProvider client={new QueryClient()}><WebsiteBuilder /></QueryClientProvider>);
    expect(Array.from(document.querySelectorAll(".template-card-preview h3"), node => node.textContent)).toEqual(["Your hotel", "Your hotel", "Your hotel"]);
    cleanup();
    language.current = "th";
    render(<QueryClientProvider client={new QueryClient()}><WebsiteBuilder /></QueryClientProvider>);
    expect(Array.from(document.querySelectorAll(".template-card-preview h3"), node => node.textContent)).toEqual(["โรงแรมของคุณ", "โรงแรมของคุณ", "โรงแรมของคุณ"]);
  });

  it("uses the selected hotel's uploaded hero photo in each card preview", () => {
    mediaData.current = [{ id: "hero-1", url: "https://media.example/hotel-hero.jpg", isHero: true, displayOrder: 0 }];
    render(<QueryClientProvider client={new QueryClient()}><WebsiteBuilder /></QueryClientProvider>);
    expect(Array.from(document.querySelectorAll<HTMLElement>(".template-card-preview .preview-hero"), node => node.style.backgroundImage)).toEqual([
      'url("https://media.example/hotel-hero.jpg")',
      'url("https://media.example/hotel-hero.jpg")',
      'url("https://media.example/hotel-hero.jpg")',
    ]);
  });

  it("saves the tapped point on a photo as its focal point", () => {
    mediaData.current = [{ id: "photo-1", url: "/photo.jpg", isHero: true, displayOrder: 0 }];
    render(<QueryClientProvider client={new QueryClient()}><WebsiteBuilder /></QueryClientProvider>);
    const photo = screen.getByAltText("Hotel media preview");
    vi.spyOn(photo, "getBoundingClientRect").mockReturnValue({ x: 0, y: 0, left: 0, top: 0, right: 200, bottom: 100, width: 200, height: 100, toJSON: () => ({}) });
    fireEvent.pointerDown(photo, { clientX: 50, clientY: 75 });
    expect(setObjectPosition).toHaveBeenCalledWith({ hotel_id: "hotel-1", media_id: "photo-1", object_position: "25% 75%" }, expect.objectContaining({ onSuccess: expect.any(Function) }));
    expect(screen.getByText("Choose the part of the photo to keep in view")).toBeTruthy();
  });
});
