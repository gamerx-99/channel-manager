import type { BookingStatus } from "@shared/bookingLifecycle";
import * as XLSX from "xlsx";
import { TM30_OFFICIAL_TEMPLATE_BASE64 } from "./tm30OfficialTemplate";

/** The Immigration Bureau's import template is an Excel 97-2003 file, so the export is one too (.xls). */
export const TM30_FILE_EXTENSION = "xls";
export const TM30_CONTENT_TYPE = "application/vnd.ms-excel";

export const TM30_HEADERS = [
  "ชื่อ\nFirst Name *",
  "ชื่อกลาง\nMiddle Name",
  "นามสกุล\nLast Name",
  "เพศ\nGender *",
  "เลขหนังสือเดินทาง\nPassport No. *",
  "สัญชาติ\nNationality *",
  "วัน เดือน ปี เกิด\nBirth Date\nDD/MM/YYYY(ค.ศ. / A.D.) \nเช่น 17/06/1985 หรือ 10/00/1985 หรือ 00/00/1985",
  "วันที่แจ้งออกจากที่พัก\nCheck-out Date\nDD/MM/YYYY(ค.ศ. / A.D.) \nเช่น 14/06/2023",
  "เบอร์โทรศัพท์\nPhone No.",
] as const;

export type Tm30Guest = {
  first_name: string;
  middle_name: string | null;
  last_name: string;
  gender: "M" | "F" | null;
  passport_no: string;
  nationality_code: string;
  birth_date: string;
  phone_no: string | null;
};

export type Tm30Booking = {
  id: string;
  check_out: string;
  status: BookingStatus;
  guests: Tm30Guest[];
};

export type Tm30ExportRow = [
  string,
  string,
  string,
  "M" | "F",
  string,
  string,
  string,
  string,
  string,
];

function formatTm30Date(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match)
    throw new Error(
      `TM.30 requires ISO dates from persisted records; received "${value}".`
    );
  return `${match[3]}/${match[2]}/${match[1]}`;
}

function validateGuest(
  guest: Tm30Guest,
  bookingId: string
): asserts guest is Tm30Guest & { gender: "M" | "F" } {
  if (
    !guest.first_name.trim() ||
    !guest.last_name.trim() ||
    !guest.passport_no.trim()
  ) {
    throw new Error(
      `Booking ${bookingId} has an incomplete guest name or passport number for TM.30.`
    );
  }
  if (!guest.gender || !["M", "F"].includes(guest.gender)) {
    throw new Error(
      `Booking ${bookingId} has a guest without gender M or F for TM.30.`
    );
  }
  if (!/^[A-Z]{3}$/.test(guest.nationality_code)) {
    throw new Error(
      `Booking ${bookingId} has a nationality code that is not an ICAO 3-letter code.`
    );
  }
}

export function buildTm30Rows(bookings: Tm30Booking[]): Tm30ExportRow[] {
  const rows: Tm30ExportRow[] = [];
  for (const booking of bookings) {
    if (booking.status === "cancelled") continue;
    for (const guest of booking.guests) {
      validateGuest(guest, booking.id);
      rows.push([
        guest.first_name.trim(),
        guest.middle_name?.trim() ?? "",
        guest.last_name.trim(),
        guest.gender,
        guest.passport_no.trim(),
        guest.nationality_code.trim(),
        formatTm30Date(guest.birth_date),
        formatTm30Date(booking.check_out),
        guest.phone_no?.trim() ?? "",
      ]);
    }
  }
  if (!rows.length)
    throw new Error("No active booking guests are available for TM.30 export.");
  return rows;
}

export function createMappedTemplateWorkbook(): XLSX.WorkBook {
  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.aoa_to_sheet([[...TM30_HEADERS]]);
  XLSX.utils.book_append_sheet(workbook, sheet, "TM.30");
  return workbook;
}

export type Tm30TemplateLoader = () => XLSX.WorkBook;
let customTemplateLoader: Tm30TemplateLoader | null = null;

export function registerTm30TemplateLoader(loader: Tm30TemplateLoader | null) {
  customTemplateLoader = loader;
}

/**
 * Loads the official Immigration template (the form sheet plus the example, nationality and gender sheets),
 * embedded because Cloudflare Workers have no filesystem. Replace it with `scripts/embed-tm30-template.mjs`
 * when Immigration publishes a new one.
 */
export function loadTm30Template(): XLSX.WorkBook {
  if (customTemplateLoader) {
    return customTemplateLoader();
  }
  return XLSX.read(TM30_OFFICIAL_TEMPLATE_BASE64, { type: "base64", cellStyles: true });
}

/** Text format ("@") like the official template, so a passport number or 00/00/1985 is never turned into a number or date. */
function writeTextCell(sheet: XLSX.WorkSheet, address: string, value: string) {
  sheet[address] = { t: "s", v: value, z: "@" };
}

/** Creates a TM.30 workbook from the configured template or approved mapping. */
export function createTm30Workbook(bookings: Tm30Booking[]): Buffer {
  const workbook = loadTm30Template();
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  if (!sheet)
    throw new Error("The TM.30 template does not contain a first worksheet.");

  const templateHeaders = TM30_HEADERS.map((_, column) =>
    String(sheet[XLSX.utils.encode_cell({ r: 0, c: column })]?.v ?? "")
  );
  if (JSON.stringify(templateHeaders) !== JSON.stringify(TM30_HEADERS)) {
    throw new Error(
      "The supplied TM.30 template header does not match the approved official mapping."
    );
  }

  const rows = buildTm30Rows(bookings);
  rows.forEach((row, rowIndex) => {
    row.forEach((value, columnIndex) =>
      writeTextCell(
        sheet,
        XLSX.utils.encode_cell({ r: rowIndex + 1, c: columnIndex }),
        value
      )
    );
  });
  sheet["!ref"] = XLSX.utils.encode_range({
    s: { r: 0, c: 0 },
    e: { r: rows.length, c: TM30_HEADERS.length - 1 },
  });
  return XLSX.write(workbook, {
    type: "buffer",
    bookType: "biff8",
    cellStyles: true,
  }) as Buffer;
}

export type Tm30GuestProblem = "name" | "passport" | "gender" | "nationality" | "birth_date";

/** Why a guest cannot go into the TM.30 file yet, or null when the record is complete. Does not throw. */
export function tm30GuestProblem(guest: Tm30Guest): Tm30GuestProblem | null {
  if (!guest.first_name.trim() || !guest.last_name.trim()) return "name";
  if (!guest.passport_no.trim()) return "passport";
  if (!guest.gender || !["M", "F"].includes(guest.gender)) return "gender";
  if (!/^[A-Z]{3}$/.test(guest.nationality_code)) return "nationality";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(guest.birth_date)) return "birth_date";
  return null;
}

export type Tm30ArrivalInput = Tm30Booking & { check_in: string; room_number: string | null };

export type Tm30ArrivalGuest = {
  booking_id: string;
  name: string;
  passport_no: string;
  nationality_code: string;
  room_number: string | null;
  status: BookingStatus;
  problem: Tm30GuestProblem | null;
};

/** A guest is expected or has arrived; held, unpaid, expired and cancelled bookings are not on the list. */
const TM30_ARRIVAL_STATUSES: readonly BookingStatus[] = ["confirmed", "checked_in"];

/**
 * The foreign guests (bookings that carry passport details) arriving on `date`:
 * `listed` is everyone shown on the page, `ready` is what can go into the file (complete records only).
 */
export function selectTm30Arrivals(bookings: readonly Tm30ArrivalInput[], date: string) {
  const listed: Tm30ArrivalGuest[] = [];
  const ready: Tm30Booking[] = [];
  for (const booking of bookings) {
    if (booking.check_in !== date || !TM30_ARRIVAL_STATUSES.includes(booking.status)) continue;
    const complete: Tm30Guest[] = [];
    for (const guest of booking.guests) {
      const problem = tm30GuestProblem(guest);
      listed.push({
        booking_id: booking.id,
        name: [guest.first_name, guest.middle_name, guest.last_name].map(part => part?.trim()).filter(Boolean).join(" "),
        passport_no: guest.passport_no.trim(),
        nationality_code: guest.nationality_code.trim(),
        room_number: booking.room_number,
        status: booking.status,
        problem,
      });
      if (!problem) complete.push(guest);
    }
    if (complete.length) ready.push({ id: booking.id, check_out: booking.check_out, status: booking.status, guests: complete });
  }
  return { listed, ready };
}
