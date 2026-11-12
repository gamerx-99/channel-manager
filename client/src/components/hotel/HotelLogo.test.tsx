import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { HotelLogo } from "./HotelLogo";
import { removeHotelLogo, uploadHotelLogoFile } from "@/lib/hotelLogo";

describe("HotelLogo", () => {
  it("draws nothing when the hotel has no logo", () => {
    expect(renderToStaticMarkup(<HotelLogo url={null} name="Hotel" />)).toBe("");
    expect(renderToStaticMarkup(<HotelLogo url={undefined} />)).toBe("");
    expect(renderToStaticMarkup(<HotelLogo url="" />)).toBe("");
  });

  it("shows the logo image when there is one", () => {
    const html = renderToStaticMarkup(<HotelLogo url="/api/media/h/l.png" name="Hotel" />);
    expect(html).toContain('src="/api/media/h/l.png"');
    expect(html).toContain('alt="Hotel"');
  });
});

describe("hotel logo requests", () => {
  it("posts the image to the hotel logo route and returns the new url", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ logo_url: "/api/media/h/l.png" }), { status: 201 }));
    await expect(uploadHotelLogoFile("hotel/1", { base64: "data:image/png;base64,AA==", filename: "l.png" }, fetchMock as any)).resolves.toEqual({ logo_url: "/api/media/h/l.png" });
    expect(fetchMock.mock.calls[0]![0]).toBe("/api/hotel-logo/hotel%2F1");
    expect(fetchMock.mock.calls[0]![1]).toMatchObject({ method: "POST", credentials: "include" });
  });

  it("surfaces the server error message", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: "Images must be 5 MiB or smaller." }), { status: 413 }));
    await expect(uploadHotelLogoFile("h", { base64: "x", filename: "l.png" }, fetchMock as any)).rejects.toThrow("Images must be 5 MiB or smaller.");
  });

  it("deletes the logo with the hotel logo route", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ logo_url: null }), { status: 200 }));
    await removeHotelLogo("h", fetchMock as any);
    expect(fetchMock.mock.calls[0]![1]).toMatchObject({ method: "DELETE" });
  });
});
