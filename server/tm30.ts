import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import * as XLSX from "xlsx";

const configuredTemplatePath = process.env.TM30_TEMPLATE_PATH?.trim();
const defaultTemplatePath = resolve(
  process.cwd(),
  "server/assets/Template-InformAccom-ImportExcel.xlsx"
);

/**
 * Optional path to the approved Immigration template. The path is configurable
 * so the export works on Windows, Linux, local development, and deployment
 * environments without relying on `/home/ubuntu/upload`.
 */
export const TM30_TEMPLATE_PATH = configuredTemplatePath
  ? isAbsolute(configuredTemplatePath)
    ? configuredTemplatePath
    : resolve(process.cwd(), configuredTemplatePath)
  : defaultTemplatePath;

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
  status: "confirmed" | "checked_in" | "checked_out" | "cancelled";
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

function createMappedTemplateWorkbook(): XLSX.WorkBook {
  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.aoa_to_sheet([[...TM30_HEADERS]]);
  XLSX.utils.book_append_sheet(workbook, sheet, "TM.30");
  return workbook;
}

/**
 * Loads the configured official template when available. For local installs
 * without the optional binary, it creates a workbook with the approved header
 * mapping so preview/export remains usable. Setting TM30_TEMPLATE_PATH makes a
 * missing file an explicit configuration error instead of silently falling back.
 */
export function loadTm30Template(): XLSX.WorkBook {
  if (!existsSync(TM30_TEMPLATE_PATH)) {
    if (configuredTemplatePath) {
      throw new Error(
        `TM.30 template not found at "${TM30_TEMPLATE_PATH}". Set TM30_TEMPLATE_PATH to a readable .xls/.xlsx file.`
      );
    }
    return createMappedTemplateWorkbook();
  }

  return XLSX.read(readFileSync(TM30_TEMPLATE_PATH), {
    type: "buffer",
    cellStyles: true,
  });
}

function writeTextCell(sheet: XLSX.WorkSheet, address: string, value: string) {
  sheet[address] = { t: "s", v: value };
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
    bookType: "xlsx",
    cellStyles: true,
  }) as Buffer;
}
