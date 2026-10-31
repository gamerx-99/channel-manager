import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ holdRoomType: vi.fn(), confirmBookingDetails: vi.fn() }));
vi.mock("../server/d1/booking", async importOriginal => ({
  ...(await importOriginal<typeof import("../server/d1/booking")>()),
  ...mocks,
}));

let app: Awaited<ReturnType<typeof loadApp>>;

async function loadApp() {
  const { createWorkerApp } = await import("./app");
  return createWorkerApp({ createDatabase: () => ({}) as any });
}

beforeAll(async () => {
  // The router graph is large; the cold import alone can take several seconds.
  app = await loadApp();
}, 30_000);

beforeEach(() => vi.clearAllMocks());

const holdBody = JSON.stringify({
  json: {
    slug: "demo-hotel",
    room_type_id: "f1a1b1c1-d1e1-41f1-81f1-111111111111",
    check_in: "2026-12-01",
    check_out: "2026-12-02",
    adults: 2,
    children: [],
  },
});

function holdRequest(headers: Record<string, string>, env: Record<string, unknown>) {
  return app.request(
    "/api/trpc/channelManager.holdRoomType",
    { method: "POST", headers: { "content-type": "application/json", ...headers }, body: holdBody },
    { DB: {}, ...env },
  );
}

describe("PUBLIC_BOOKING_LIMITER binding in the Worker", () => {
  it("answers 429 TOO_MANY_REQUESTS when the binding refuses the CF-Connecting-IP", async () => {
    const limit = vi.fn().mockResolvedValue({ success: false });

    const res = await holdRequest({ "cf-connecting-ip": "198.51.100.4" }, { PUBLIC_BOOKING_LIMITER: { limit } });

    expect(res.status).toBe(429);
    const body = (await res.json()) as { error: { json: { data: { code: string } } } };
    expect(body.error.json.data.code).toBe("TOO_MANY_REQUESTS");
    expect(limit).toHaveBeenCalledWith({ key: "198.51.100.4" });
    expect(mocks.holdRoomType).not.toHaveBeenCalled();
  });

  it("lets the hold through when the binding allows it", async () => {
    const limit = vi.fn().mockResolvedValue({ success: true });
    mocks.holdRoomType.mockResolvedValueOnce({ booking_id: "88ed76e4-cc93-4aa7-9c4d-30999d35ada4" });

    const res = await holdRequest({ "cf-connecting-ip": "198.51.100.5" }, { PUBLIC_BOOKING_LIMITER: { limit } });

    expect(res.status).toBe(200);
    expect(limit).toHaveBeenCalledWith({ key: "198.51.100.5" });
    expect(mocks.holdRoomType).toHaveBeenCalledTimes(1);
  });

  it("keys on CF-Connecting-IP, not X-Forwarded-For", async () => {
    const limit = vi.fn().mockResolvedValue({ success: true });
    mocks.holdRoomType.mockResolvedValueOnce({ booking_id: "88ed76e4-cc93-4aa7-9c4d-30999d35ada4" });

    await holdRequest(
      { "cf-connecting-ip": "198.51.100.6", "x-forwarded-for": "10.0.0.1" },
      { PUBLIC_BOOKING_LIMITER: { limit } },
    );

    expect(limit).toHaveBeenCalledWith({ key: "198.51.100.6" });
  });

  it("works as before when the environment has no binding", async () => {
    mocks.holdRoomType.mockResolvedValueOnce({ booking_id: "88ed76e4-cc93-4aa7-9c4d-30999d35ada4" });

    const res = await holdRequest({ "cf-connecting-ip": "198.51.100.7" }, {});

    expect(res.status).toBe(200);
    expect(mocks.holdRoomType).toHaveBeenCalledTimes(1);
  });
});
