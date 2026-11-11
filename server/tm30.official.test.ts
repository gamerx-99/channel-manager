import { createHash } from "node:crypto";
import * as XLSX from "xlsx";
import { describe, expect, it } from "vitest";
import { TM30_OFFICIAL_TEMPLATE_BASE64, TM30_OFFICIAL_TEMPLATE_SHA256 } from "./tm30OfficialTemplate";
import { createTm30Workbook, loadTm30Template, TM30_CONTENT_TYPE, TM30_FILE_EXTENSION, TM30_HEADERS, type Tm30Booking } from "./tm30";

// The Immigration Bureau's import template ("Template-InformAccom-ImportExcel.xls", modified 2023-09-29).
const OFFICIAL_SHEETS = ["แบบแจ้งที่พัก Inform Accom", "ตัวอย่างข้อมูล Ex", "สัญชาติ Nationality", "เพศ Gender "];
const OLE2_MAGIC = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];

const booking: Tm30Booking = {
  id: "b1",
  check_out: "2026-11-13",
  status: "confirmed",
  guests: [{ first_name: "John", middle_name: null, last_name: "Smith", gender: "M", passport_no: "00123456", nationality_code: "GBR", birth_date: "1985-06-17", phone_no: "+447700900123" }],
};

describe("the embedded official TM.30 template", () => {
  it("is the file that was embedded, unchanged", () => {
    const bytes = Buffer.from(TM30_OFFICIAL_TEMPLATE_BASE64, "base64");
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(TM30_OFFICIAL_TEMPLATE_SHA256);
  });

  it("has the four official sheets and the approved header row", () => {
    const workbook = loadTm30Template();
    expect(workbook.SheetNames).toEqual(OFFICIAL_SHEETS);
    const sheet = workbook.Sheets[OFFICIAL_SHEETS[0]!]!;
    expect(TM30_HEADERS.map((_, column) => String(sheet[XLSX.utils.encode_cell({ r: 0, c: column })]?.v ?? ""))).toEqual([...TM30_HEADERS]);
  });

  it("lists the ICAO nationality codes the export validates against", () => {
    const rows = XLSX.utils.sheet_to_json<string[]>(loadTm30Template().Sheets[OFFICIAL_SHEETS[2]!]!, { header: 1 });
    const codes = rows.map(row => row[0]);
    expect(codes).toEqual(expect.arrayContaining(["THA", "GBR", "USA", "CHN", "KOR"]));
  });
});

describe("the exported file", () => {
  const buffer = createTm30Workbook([booking]);

  it("is an Excel 97-2003 file like the template, not a zip-based .xlsx", () => {
    expect([...buffer.subarray(0, 8)]).toEqual(OLE2_MAGIC);
    expect(TM30_FILE_EXTENSION).toBe("xls");
    expect(TM30_CONTENT_TYPE).toBe("application/vnd.ms-excel");
  });

  it("keeps the official sheets and puts the guests on the form sheet under the headers", () => {
    const parsed = XLSX.read(buffer, { type: "buffer" });
    expect(parsed.SheetNames).toEqual(OFFICIAL_SHEETS);
    const sheet = parsed.Sheets[OFFICIAL_SHEETS[0]!]!;
    const rows = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, blankrows: false, raw: true });
    expect(rows[0]).toEqual([...TM30_HEADERS]);
    expect(rows[1]).toEqual(["John", "", "Smith", "M", "00123456", "GBR", "17/06/1985", "13/11/2026", "+447700900123"]);
  });

  it("keeps the passport number and dates as text, so leading zeros survive", () => {
    const sheet = XLSX.read(buffer, { type: "buffer" }).Sheets[OFFICIAL_SHEETS[0]!]!;
    for (const address of ["E2", "G2", "H2"]) expect(sheet[address]?.t).toBe("s");
    expect(sheet["E2"]?.v).toBe("00123456");
  });

  it("leaves the example sheet of the official template untouched", () => {
    const sheet = XLSX.read(buffer, { type: "buffer" }).Sheets[OFFICIAL_SHEETS[1]!]!;
    expect(sheet["A2"]?.v).toBe("ALEX");
    expect(sheet["E2"]?.v).toBe("L39939000");
  });
});
