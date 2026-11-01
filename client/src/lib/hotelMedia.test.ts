import { describe, expect, it, vi } from "vitest";
import { uploadHotelMediaFile } from "./hotelMedia";

describe("uploadHotelMediaFile", () => {
  it("posts the image to the Worker media route with the session cookie", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: "m1" }), { status: 201 }));
    await expect(uploadHotelMediaFile("hotel/1", { base64: "data:image/png;base64,AA==", filename: "a.png" }, fetchMock)).resolves.toEqual({ id: "m1" });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("/api/media/hotel%2F1");
    expect(init).toMatchObject({ method: "POST", credentials: "include" });
    expect(JSON.parse(init.body)).toEqual({ base64: "data:image/png;base64,AA==", filename: "a.png" });
  });

  it("surfaces the server's error message", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: "Images must be 5 MiB or smaller." }), { status: 413 }));
    await expect(uploadHotelMediaFile("h", { base64: "x", filename: "a.png" }, fetchMock)).rejects.toThrow("Images must be 5 MiB or smaller.");
  });
});
