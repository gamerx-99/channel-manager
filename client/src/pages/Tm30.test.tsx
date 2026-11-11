// @vitest-environment jsdom
import React from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getRequiredRoutePermission } from "@/lib/routeScope";

const HOTEL = "11111111-1111-4111-8111-111111111111";

const mocks = vi.hoisted(() => ({
  arrivals: { data: undefined as undefined | { date: string; readyCount: number; guests: Array<Record<string, unknown>> }, isLoading: false, error: null as null | { message: string } },
  useArrivals: vi.fn(),
  exportMutate: vi.fn(),
  exportOptions: {} as { onSuccess?: (result: unknown) => void; onError?: () => void },
  download: vi.fn(),
}));

vi.mock("wouter", async () => {
  const actual = await vi.importActual<typeof import("wouter")>("wouter");
  return { ...actual, Link: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => <a href={href} {...props}>{children}</a> };
});
vi.mock("@/lib/downloadFile", () => ({ downloadBase64File: mocks.download }));
vi.mock("@/lib/trpc", () => ({
  trpc: {
    channelManager: {
      tm30Arrivals: { useQuery: (...args: unknown[]) => { mocks.useArrivals(...args); return mocks.arrivals; } },
      exportTm30Arrivals: { useMutation: (options: typeof mocks.exportOptions) => { mocks.exportOptions = options; return { mutate: mocks.exportMutate, isPending: false }; } },
    },
  },
}));

import Tm30 from "./Tm30";

const guest = (overrides: Record<string, unknown> = {}) => ({ booking_id: "b1", name: "John Smith", passport_no: "P1234567", nationality_code: "GBR", room_number: "101", status: "confirmed", problem: null, ...overrides });

beforeEach(() => {
  mocks.arrivals = { data: { date: "2026-11-11", readyCount: 1, guests: [guest()] }, isLoading: false, error: null };
  mocks.useArrivals.mockReset();
  mocks.exportMutate.mockReset();
  mocks.download.mockReset();
});
afterEach(() => cleanup());

describe("TM.30 page", () => {
  it("lists the foreign guests with passport, nationality, room and status", () => {
    mocks.arrivals = { data: { date: "2026-11-11", readyCount: 1, guests: [guest(), guest({ name: "Anna Lee", passport_no: "P7654321", nationality_code: "KOR", room_number: null, status: "checked_in" })] }, isLoading: false, error: null };
    render(<Tm30 id={HOTEL} />);
    expect(screen.getByText("John Smith")).toBeTruthy();
    expect(screen.getByText("P7654321")).toBeTruthy();
    expect(screen.getByText("KOR")).toBeTruthy();
    expect(screen.getByText("Checked in")).toBeTruthy();
  });

  it("asks for today by default and for the picked date afterwards", () => {
    render(<Tm30 id={HOTEL} />);
    expect(mocks.useArrivals).toHaveBeenLastCalledWith({ hotel_id: HOTEL, date: undefined }, expect.anything());
    const input = screen.getByLabelText("Arrival date") as HTMLInputElement;
    expect(input.value).toBe("2026-11-11");
    fireEvent.change(input, { target: { value: "2026-11-09" } });
    expect(mocks.useArrivals).toHaveBeenLastCalledWith({ hotel_id: HOTEL, date: "2026-11-09" }, expect.anything());
  });

  it("downloads the file for the shown day and saves it through the browser", async () => {
    const user = userEvent.setup();
    render(<Tm30 id={HOTEL} />);
    await user.click(screen.getByTestId("tm30-download"));
    expect(mocks.exportMutate).toHaveBeenCalledWith({ hotel_id: HOTEL, date: "2026-11-11" });
    mocks.exportOptions.onSuccess?.({ base64: "QUJD", filename: "tm30.xlsx", contentType: "application/octet-stream" });
    expect(mocks.download).toHaveBeenCalledWith("QUJD", "tm30.xlsx", "application/octet-stream");
  });

  it("shows a friendly error when the file cannot be made", () => {
    render(<Tm30 id={HOTEL} />);
    expect(screen.queryByRole("alert")).toBeNull();
    act(() => { mocks.exportOptions.onError?.(); });
    expect(screen.getByRole("alert").textContent).toBe("Could not make the file. Try again.");
  });

  it("opens the Immigration login page in a new tab", () => {
    render(<Tm30 id={HOTEL} />);
    const link = screen.getByTestId("tm30-portal");
    expect(link.getAttribute("href")).toBe("https://tm30.immigration.go.th/tm30api/loginExternal.jsp");
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toBe("noopener noreferrer");
  });

  it("flags guests with incomplete details and keeps them out of the count", () => {
    mocks.arrivals = { data: { date: "2026-11-11", readyCount: 1, guests: [guest(), guest({ name: "Pim Chai", passport_no: "", problem: "passport" })] }, isLoading: false, error: null };
    render(<Tm30 id={HOTEL} />);
    expect(screen.getByText("No passport number")).toBeTruthy();
    expect(screen.getByText(/1 guest\(s\) have incomplete details/)).toBeTruthy();
    expect(screen.getByRole("link", { name: "Go to bookings" }).getAttribute("href")).toBe(`/hotels/${HOTEL}/bookings`);
  });

  it("disables the download and says so when nobody can go into the file", () => {
    mocks.arrivals = { data: { date: "2026-11-11", readyCount: 0, guests: [] }, isLoading: false, error: null };
    render(<Tm30 id={HOTEL} />);
    expect((screen.getByTestId("tm30-download") as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText("No foreign guests arrive today.")).toBeTruthy();
  });
});

describe("TM.30 route permission", () => {
  it("is gated by the TM.30 permission, not by plain booking access", () => {
    expect(getRequiredRoutePermission(`/hotels/${HOTEL}/tm30`)).toBe("operations.export_tm30");
    expect(getRequiredRoutePermission(`/hotels/${HOTEL}/bookings`)).toBe("operations.view_bookings");
  });
});
