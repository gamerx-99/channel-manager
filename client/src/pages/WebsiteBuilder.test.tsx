// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const { saveConfig, query, mutation } = vi.hoisted(() => ({
  saveConfig: vi.fn(),
  query: (data: unknown) => ({ useQuery: () => ({ data, isLoading: false, isError: false, refetch: () => undefined, isFetching: false }) }),
  mutation: (mutate: (...args: unknown[]) => void = () => undefined) => ({ useMutation: () => ({ mutate, isPending: false }) }),
}));

vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ language: "en", setLanguage: vi.fn(), toggleLanguage: vi.fn() }) }));
vi.mock("@/lib/trpc", () => ({ trpc: {
  channelManager: {
    hotels: query([{ id: "hotel-1", name: "Baan", slug: "baan", room_types: [], rooms: [] }]),
    listHotelMedia: query([]),
    getHotelSiteConfigByHotelId: query({ hotelId: "hotel-1", heroCopy: "Old headline", accentColor: "#1d6b56", visibleSections: { hero: true, story: true, rooms: true, booking: true, location: true } }),
    deleteHotelMedia: mutation(),
    setHotelMediaHero: mutation(),
    saveHotelSiteConfig: mutation(saveConfig),
  },
  auth: { me: query({ roles: ["hotel_owner"], role: "hotel_owner" }) },
} }));

import WebsiteBuilder from "./WebsiteBuilder";
(globalThis as { React?: typeof React }).React = React;
afterEach(() => { cleanup(); saveConfig.mockReset(); });

describe("WebsiteBuilder editing", () => {
  it("saves the headline and accent colour the owner typed (regression: edits were dropped)", () => {
    render(<QueryClientProvider client={new QueryClient()}><WebsiteBuilder /></QueryClientProvider>);
    const hero = document.getElementById("wb-hero-copy") as HTMLTextAreaElement;
    fireEvent.change(hero, { target: { value: "New headline" } });
    expect(hero.value).toBe("New headline");
    fireEvent.change(screen.getByLabelText("accent_color"), { target: { value: "#aa3300" } });
    fireEvent.click(screen.getAllByRole("button").find(button => /save site config/i.test(button.textContent ?? ""))!);
    expect(saveConfig).toHaveBeenCalledWith(expect.objectContaining({ hotel_id: "hotel-1", hero_copy: "New headline", accent_color: "#aa3300" }));
  });
});
