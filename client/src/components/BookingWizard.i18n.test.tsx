// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import BookingWizard from "./BookingWizard";
import SupportAccess from "@/pages/SupportAccess";
import { resolveMembershipPermissions } from "@shared/permissions";

vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ language: "th", setLanguage: vi.fn(), toggleLanguage: vi.fn() }) }));
vi.mock("@/lib/trpc", () => ({ trpc: {
  channelManager: { createBooking: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) }, hotels: { invalidate: vi.fn() } },
  auth: { me: { useQuery: () => ({ data: { roles: ["hotel_owner"], memberships: [{ hotelId: "h", role: "hotel_owner", permissions: resolveMembershipPermissions("hotel_owner") }] } }) } },
  access: {
    supportAccess: { useQuery: () => ({ isLoading: false, error: null, refetch: vi.fn(), data: { grants: [], log: [] } }) },
    grantSupport: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
    revokeSupport: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
  },
  useUtils: () => ({ auth: { me: { invalidate: vi.fn() } }, channelManager: { hotels: { invalidate: vi.fn() } } }),
} }));

// BookingWizard relies on the automatic JSX runtime of the Vite build; this test runner uses the classic one.
(globalThis as { React?: typeof React }).React = React;

afterEach(() => { cleanup(); });

const hotel = { id: "h", rooms: [{ id: "r", room_number: "101", room_type_id: "t", status: "available" }], room_types: [{ id: "t", name: "Deluxe", base_price: 1000 }], bookings: [] };

describe("Thai translation", () => {
  it("shows the booking wizard in Thai", () => {
    render(<BookingWizard hotel={hotel} onClose={vi.fn()} onSuccess={vi.fn()} />);
    expect(screen.getByText("เพิ่มการจอง (ขั้นที่ 1 จาก 4)")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "วันที่และห้องพัก" })).toBeTruthy();
    expect(screen.getByLabelText("ชื่อผู้เข้าพักหลัก")).toBeTruthy();
    expect(screen.getByRole("button", { name: "ถัดไป" })).toBeTruthy();
    expect(screen.queryByText(/Booking Wizard|Continue|Dates & Room/)).toBeNull();
  });

  it("shows support access in Thai", () => {
    render(<SupportAccess hotelId="h" />);
    expect(screen.getByRole("heading", { name: "สิทธิ์ทีมช่วยเหลือ" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "อนุมัติกุญแจทีมช่วยเหลือ" })).toBeTruthy();
    expect(screen.getByText("ยังไม่มีกุญแจที่ออกให้")).toBeTruthy();
  });
});

describe("room list with an overlapping booking", () => {
  it("still offers the free rooms and hides only the booked one", () => {
    const twoRooms = {
      ...hotel,
      rooms: [
        { id: "r101", room_number: "101", room_type_id: "t", status: "available" },
        { id: "r102", room_number: "102", room_type_id: "t", status: "available" },
      ],
      // Covers every day the wizard could default to.
      bookings: [{ id: "b", room_id: "r101", check_in: "2000-01-01", check_out: "2100-01-01", status: "confirmed" }],
    };
    render(<BookingWizard hotel={twoRooms} onClose={vi.fn()} onSuccess={vi.fn()} />);
    const values = Array.from(document.querySelectorAll("option")).map(option => option.getAttribute("value"));
    expect(values).toContain("r102");
    expect(values).not.toContain("r101");
  });
});
