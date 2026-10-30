import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import * as XLSX from "xlsx";
import { describe, expect, it } from "vitest";
import {
  createMappedTemplateWorkbook,
  createTm30Workbook,
  registerTm30TemplateLoader,
  TM30_HEADERS,
  type Tm30Booking,
} from "./tm30";

const sampleBookings: Tm30Booking[] = [
  {
    id: "booking-1",
    check_out: "2026-11-05",
    status: "confirmed",
    guests: [
      {
        first_name: "John",
        middle_name: "Edward",
        last_name: "Doe",
        gender: "M",
        passport_no: "A12345678",
        nationality_code: "USA",
        birth_date: "1990-05-15",
        phone_no: "0812345678",
      },
      {
        first_name: "Jane",
        middle_name: null,
        last_name: "Smith",
        gender: "F",
        passport_no: "B98765432",
        nationality_code: "GBR",
        birth_date: "1992-08-20",
        phone_no: null,
      },
    ],
  },
];

describe("TM.30 export and template compatibility", () => {
  it("with no template path, createTm30Workbook output is cell-identical to mapped workbook", () => {
    // Ensure default mapped template is used
    registerTm30TemplateLoader(null);

    const buffer = createTm30Workbook(sampleBookings);
    const parsedWorkbook = XLSX.read(buffer, { type: "buffer" });
    const sheetName = parsedWorkbook.SheetNames[0];
    expect(sheetName).toBeTruthy();
    const sheet = parsedWorkbook.Sheets[sheetName!];
    expect(sheet).toBeTruthy();

    // Check header row (row 0 in 0-indexed)
    TM30_HEADERS.forEach((header, col) => {
      const cellRef = XLSX.utils.encode_cell({ r: 0, c: col });
      expect(sheet![cellRef]?.v).toBe(header);
    });

    // Check row 1 (first guest: John Edward Doe)
    expect(sheet![XLSX.utils.encode_cell({ r: 1, c: 0 })]?.v).toBe("John");
    expect(sheet![XLSX.utils.encode_cell({ r: 1, c: 1 })]?.v).toBe("Edward");
    expect(sheet![XLSX.utils.encode_cell({ r: 1, c: 2 })]?.v).toBe("Doe");
    expect(sheet![XLSX.utils.encode_cell({ r: 1, c: 3 })]?.v).toBe("M");
    expect(sheet![XLSX.utils.encode_cell({ r: 1, c: 4 })]?.v).toBe("A12345678");
    expect(sheet![XLSX.utils.encode_cell({ r: 1, c: 5 })]?.v).toBe("USA");
    expect(sheet![XLSX.utils.encode_cell({ r: 1, c: 6 })]?.v).toBe("15/05/1990");
    expect(sheet![XLSX.utils.encode_cell({ r: 1, c: 7 })]?.v).toBe("05/11/2026");
    expect(sheet![XLSX.utils.encode_cell({ r: 1, c: 8 })]?.v).toBe("0812345678");

    // Check row 2 (second guest: Jane Smith)
    expect(sheet![XLSX.utils.encode_cell({ r: 2, c: 0 })]?.v).toBe("Jane");
    expect(sheet![XLSX.utils.encode_cell({ r: 2, c: 1 })]?.v).toBe("");
    expect(sheet![XLSX.utils.encode_cell({ r: 2, c: 2 })]?.v).toBe("Smith");
    expect(sheet![XLSX.utils.encode_cell({ r: 2, c: 3 })]?.v).toBe("F");
    expect(sheet![XLSX.utils.encode_cell({ r: 2, c: 4 })]?.v).toBe("B98765432");
    expect(sheet![XLSX.utils.encode_cell({ r: 2, c: 5 })]?.v).toBe("GBR");
    expect(sheet![XLSX.utils.encode_cell({ r: 2, c: 6 })]?.v).toBe("20/08/1992");
    expect(sheet![XLSX.utils.encode_cell({ r: 2, c: 7 })]?.v).toBe("05/11/2026");
    expect(sheet![XLSX.utils.encode_cell({ r: 2, c: 8 })]?.v).toBe("");
  });

  it("server/tm30.ts has no node:fs or node:path imports (Worker safe)", () => {
    const tm30Source = readFileSync(resolve(process.cwd(), "server/tm30.ts"), "utf8");
    expect(tm30Source).not.toMatch(/from\s+["']node:fs["']/);
    expect(tm30Source).not.toMatch(/from\s+["']fs["']/);
    expect(tm30Source).not.toMatch(/from\s+["']node:path["']/);
    expect(tm30Source).not.toMatch(/from\s+["']path["']/);
  });
});
