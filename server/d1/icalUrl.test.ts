import { afterEach, describe, expect, it, vi } from "vitest";
import { ICAL_FETCH_ERROR, ICAL_URL_ERROR, fetchPublicIcalFeed, parsePublicIcalUrl } from "./icalUrl";

afterEach(() => vi.useRealTimers());

describe("Workers-safe iCal URL guard", () => {
  it.each([
    "http://10.1.2.3/feed.ics",
    "https://127.0.0.1/feed.ics",
    "http://169.254.169.254/latest/meta-data",
    "http://192.168.1.10/feed",
    "http://192.0.2.10/feed",
    "http://224.0.0.1/feed",
    "http://[::]/feed",
    "http://[::1]/feed",
    "http://[fc00::1]/feed",
    "http://[fe80::1]/feed",
    "http://[2001:db8::1]/feed",
    "http://[::ffff:127.0.0.1]/feed",
    "http://[::ffff:7f00:1]/feed",
  ])("rejects private, loopback, mapped or reserved IP literal %s", url => {
    expect(() => parsePublicIcalUrl(url)).toThrow(ICAL_URL_ERROR);
  });

  it.each([
    "http://localhost/feed",
    "https://image.local/feed",
    "https://calendar.internal/feed",
    "https://singlelabel/feed",
    "ftp://example.com/feed",
    "https://user:pass@example.com/feed",
    "https://@example.com/feed",
    "https://example.com:8443/feed",
    "http://example.com:8080/feed",
  ])("rejects unsafe URL shape %s", url => {
    expect(() => parsePublicIcalUrl(url)).toThrow(ICAL_URL_ERROR);
  });

  it("accepts public HTTP(S), ports 80/443, and a public IPv6 literal", () => {
    expect(parsePublicIcalUrl("http://example.com:80/feed").hostname).toBe("example.com");
    expect(parsePublicIcalUrl("https://example.com:443/feed").hostname).toBe("example.com");
    expect(parsePublicIcalUrl("https://[2606:4700:4700::1111]/feed").hostname).toContain("2606");
  });
});

describe("bounded iCal fetch", () => {
  it("follows no more than three redirects and revalidates each destination", async () => {
    const tooMany = vi.fn(async () => new Response(null, { status: 302, headers: { location: "/next" } }));
    await expect(fetchPublicIcalFeed("https://example.com/start", tooMany)).rejects.toThrow(ICAL_FETCH_ERROR);
    expect(tooMany).toHaveBeenCalledTimes(4);

    const toPrivate = vi.fn(async () => new Response(null, { status: 302, headers: { location: "http://127.0.0.1/feed" } }));
    await expect(fetchPublicIcalFeed("https://example.com/start", toPrivate)).rejects.toThrow(ICAL_FETCH_ERROR);
    expect(toPrivate).toHaveBeenCalledOnce();
  });

  it("caps streaming response bodies at 2 MiB and rejects unsupported content types", async () => {
    const large = new Response(new Uint8Array(2 * 1024 * 1024 + 1), { headers: { "content-type": "text/plain" } });
    await expect(fetchPublicIcalFeed("https://example.com/feed", async () => large)).rejects.toThrow(ICAL_FETCH_ERROR);
    const wrongType = new Response("{\"error\":\"html\"}", { headers: { "content-type": "application/json" } });
    await expect(fetchPublicIcalFeed("https://example.com/feed", async () => wrongType)).rejects.toThrow(ICAL_FETCH_ERROR);
    const bodyIdentifiesCalendar = new Response("BEGIN:VCALENDAR\r\nEND:VCALENDAR", { headers: { "content-type": "application/octet-stream" } });
    await expect(fetchPublicIcalFeed("https://example.com/feed", async () => bodyIdentifiesCalendar)).resolves.toContain("BEGIN:VCALENDAR");
  });

  it("times out after ten seconds and aborts the request", async () => {
    vi.useFakeTimers();
    let signal: AbortSignal | undefined;
    const fetchImpl = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
      signal = init?.signal ?? undefined;
      return new Promise<Response>(() => undefined);
    });
    const pending = fetchPublicIcalFeed("https://example.com/feed", fetchImpl);
    const assertion = expect(pending).rejects.toThrow(ICAL_FETCH_ERROR);
    await vi.advanceTimersByTimeAsync(10_000);
    await assertion;
    expect(signal?.aborted).toBe(true);
  });
});
