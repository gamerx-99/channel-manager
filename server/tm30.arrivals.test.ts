import { beforeEach, describe, expect, it, vi } from "vitest";
import * as XLSX from "xlsx";
import { selectTm30Arrivals, tm30GuestProblem, type Tm30ArrivalInput, type Tm30Guest } from "./tm30";

const HOTEL = "11111111-1111-4111-8111-111111111111";

function guest(overrides: Partial<Tm30Guest> = {}): Tm30Guest {
  return { first_name: "John", middle_name: null, last_name: "Smith", gender: "M", passport_no: "P1234567", nationality_code: "GBR", birth_date: "1985-06-17", phone_no: null, ...overrides };
}

function booking(overrides: Partial<Tm30ArrivalInput> = {}): Tm30ArrivalInput {
  return { id: "b1", check_in: "2026-11-11", check_out: "2026-11-13", status: "confirmed", room_number: "101", guests: [guest()], ...overrides };
}

describe("tm30GuestProblem", () => {
  it("accepts a complete record and names the first thing missing otherwise", () => {
    expect(tm30GuestProblem(guest())).toBeNull();
    expect(tm30GuestProblem(guest({ first_name: " " }))).toBe("name");
    expect(tm30GuestProblem(guest({ passport_no: "" }))).toBe("passport");
    expect(tm30GuestProblem(guest({ gender: null }))).toBe("gender");
    expect(tm30GuestProblem(guest({ nationality_code: "UK" }))).toBe("nationality");
    expect(tm30GuestProblem(guest({ birth_date: "17/06/1985" }))).toBe("birth_date");
  });
});

describe("selectTm30Arrivals", () => {
  it("lists only foreign guests arriving on the day, with their room and status", () => {
    const result = selectTm30Arrivals([
      booking({ id: "today", guests: [guest(), guest({ first_name: "Anna", last_name: "Lee", passport_no: "P7654321" })] }),
      booking({ id: "tomorrow", check_in: "2026-11-12" }),
      booking({ id: "yesterday", check_in: "2026-11-10" }),
      booking({ id: "thai-guest", guests: [] }),
    ], "2026-11-11");
    expect(result.listed.map(item => [item.booking_id, item.name, item.room_number, item.status])).toEqual([
      ["today", "John Smith", "101", "confirmed"],
      ["today", "Anna Lee", "101", "confirmed"],
    ]);
  });

  it("includes guests already checked in and leaves out bookings that are not a stay", () => {
    const result = selectTm30Arrivals([
      booking({ id: "in", status: "checked_in" }),
      booking({ id: "cancelled", status: "cancelled" }),
      booking({ id: "held", status: "held" }),
      booking({ id: "unpaid", status: "pending_payment" }),
      booking({ id: "expired", status: "expired" }),
    ], "2026-11-11");
    expect(result.listed.map(item => item.booking_id)).toEqual(["in"]);
  });

  it("keeps incomplete guests on the list with the problem, but out of the file", () => {
    const result = selectTm30Arrivals([booking({ guests: [guest(), guest({ first_name: "Pim", passport_no: "", last_name: "Chai" })] })], "2026-11-11");
    expect(result.listed.map(item => item.problem)).toEqual([null, "passport"]);
    expect(result.ready).toHaveLength(1);
    expect(result.ready[0]!.guests.map(item => item.first_name)).toEqual(["John"]);
  });

  it("returns nothing ready when nobody has a complete record", () => {
    const result = selectTm30Arrivals([booking({ guests: [guest({ gender: null })] })], "2026-11-11");
    expect(result.listed).toHaveLength(1);
    expect(result.ready).toEqual([]);
  });
});

// ---- the procedures: permission boundary and the file they return
const bookingMocks = vi.hoisted(() => ({ listBookingsForHotel: vi.fn() }));

describe("channelManager.tm30Arrivals and exportTm30Arrivals", () => {
  async function app(role: "hotel_owner" | "front_desk" | "housekeeping", permissions?: string[]) {
    vi.resetModules();
    vi.doMock("./d1/booking", async () => ({ ...(await vi.importActual<object>("./d1/booking")), listBookingsForHotel: bookingMocks.listBookingsForHotel }));
    const { appRouter } = await import("./routers");
    return appRouter.createCaller({
      req: {} as Request,
      res: {} as Response,
      user: { id: "u1", email: "u@example.test", name: "U", accessToken: "t", appMetadata: {}, userMetadata: {}, role, roles: [role], memberships: [{ hotelId: HOTEL, role, ...(permissions ? { permissions } : {}) }] },
      db: {} as never,
      caller: { userId: "u1", roles: [role], access: "authenticated" } as never,
    } as never);
  }

  const listed = (guests: Tm30Guest[]) => [{ id: "b1", check_in: "2026-11-11", check_out: "2026-11-13", status: "confirmed", rooms: { room_number: "101" }, guests }];

  beforeEach(() => bookingMocks.listBookingsForHotel.mockReset());

  it("shows the owner the arrivals of the chosen day", async () => {
    bookingMocks.listBookingsForHotel.mockResolvedValue(listed([guest(), guest({ passport_no: "" })]));
    const result = await (await app("hotel_owner")).channelManager.tm30Arrivals({ hotel_id: HOTEL, date: "2026-11-11" });
    expect(result.date).toBe("2026-11-11");
    expect(result.readyCount).toBe(1);
    expect(result.guests.map(item => item.problem)).toEqual([null, "passport"]);
  });

  it("defaults to today in Thailand", async () => {
    bookingMocks.listBookingsForHotel.mockResolvedValue([]);
    const result = await (await app("hotel_owner")).channelManager.tm30Arrivals({ hotel_id: HOTEL });
    expect(result.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("returns an Excel file with only the complete guests", async () => {
    bookingMocks.listBookingsForHotel.mockResolvedValue(listed([guest(), guest({ passport_no: "" })]));
    const result = await (await app("hotel_owner")).channelManager.exportTm30Arrivals({ hotel_id: HOTEL, date: "2026-11-11" });
    expect(result.filename).toBe("tm30-11111111-2026-11-11.xls");
    expect(result.rowCount).toBe(1);
    const workbook = XLSX.read(Buffer.from(result.base64, "base64"), { type: "buffer" });
    const rows = XLSX.utils.sheet_to_json<string[]>(workbook.Sheets[workbook.SheetNames[0]!]!, { header: 1 });
    expect(rows).toHaveLength(2);
    expect(rows[1]![4]).toBe("P1234567");
  });

  it("refuses to make an empty file", async () => {
    bookingMocks.listBookingsForHotel.mockResolvedValue(listed([guest({ gender: null })]));
    await expect((await app("hotel_owner")).channelManager.exportTm30Arrivals({ hotel_id: HOTEL, date: "2026-11-11" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("denies staff without the TM.30 permission", async () => {
    const staff = await app("housekeeping");
    await expect(staff.channelManager.tm30Arrivals({ hotel_id: HOTEL })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(staff.channelManager.exportTm30Arrivals({ hotel_id: HOTEL })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(bookingMocks.listBookingsForHotel).not.toHaveBeenCalled();
  });
});
