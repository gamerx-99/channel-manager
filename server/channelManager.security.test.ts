import * as XLSX from "xlsx";
import { describe, expect, it } from "vitest";
import {
  createTm30Workbook,
  loadTm30Template,
  TM30_HEADERS,
  type Tm30Booking,
} from "./tm30";

const persistedBookingFixture: Tm30Booking[] = [
  {
    id: "9c72eb82-3f44-4ef1-a99c-08a9aa851054",
    check_out: "2026-08-31",
    status: "confirmed",
    guests: [
      {
        first_name: "Sofia",
        middle_name: "Marie",
        last_name: "Anderson",
        gender: "F",
        passport_no: "P12345678",
        nationality_code: "SWE",
        birth_date: "1992-05-17",
        phone_no: "+4681234567",
      },
    ],
  },
];

describe("TM.30 export against the approved Immigration mapping", () => {
  it("loads a configured template or the approved local mapping with the expected headers", () => {
    const workbook = loadTm30Template();
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const headers = TM30_HEADERS.map((_, column) =>
      String(sheet[XLSX.utils.encode_cell({ r: 0, c: column })]?.v ?? "")
    );

    expect(headers).toEqual([...TM30_HEADERS]);
  });

  it("calls the application export function and writes persisted guest fields into the template", () => {
    const generatedWorkbook = createTm30Workbook(persistedBookingFixture);
    const parsedWorkbook = XLSX.read(generatedWorkbook, { type: "buffer" });
    const sheet = parsedWorkbook.Sheets[parsedWorkbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet, {
      header: 1,
      blankrows: false,
    }) as string[][];

    expect(rows[0]).toEqual([...TM30_HEADERS]);
    expect(rows[1]).toEqual([
      "Sofia",
      "Marie",
      "Anderson",
      "F",
      "P12345678",
      "SWE",
      "17/05/1992",
      "31/08/2026",
      "+4681234567",
    ]);
  });

  it("rejects a persisted guest row that violates the ICAO nationality requirement", () => {
    const invalidBooking: Tm30Booking[] = [
      {
        ...persistedBookingFixture[0],
        guests: [
          { ...persistedBookingFixture[0].guests[0], nationality_code: "TH" },
        ],
      },
    ];

    expect(() => createTm30Workbook(invalidBooking)).toThrow(
      "ICAO 3-letter code"
    );
  });
});
