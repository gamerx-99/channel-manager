import { describe, expect, it } from "vitest";
import { readFileSync } from 'node:fs';
import * as XLSX from 'xlsx';
import { describe, expect, it } from 'vitest';
import {
  createTm30Workbook,
  TM30_HEADERS,
  TM30_TEMPLATE_PATH,
  type Tm30Booking,
} from './tm30';

const persistedBookingFixture: Tm30Booking[] = [
  {
    id: '9c72eb82-3f44-4ef1-a99c-08a9aa851054',
    check_out: '2026-08-31',
    status: 'confirmed',
    guests: [
      {
        first_name: 'Sofia',
        middle_name: 'Marie',
        last_name: 'Anderson',
        gender: 'F',
        passport_no: 'P12345678',
        nationality_code: 'SWE',
        birth_date: '1992-05-17',
        phone_no: '+4681234567',
      },
    ],
  },
];

describe('TM.30 export against the official Immigration template', () => {
  it('reads the actual supplied template and preserves its approved header mapping', () => {
    const officialTemplate = XLSX.read(readFileSync(TM30_TEMPLATE_PATH), { type: 'buffer' });
    const officialSheet = officialTemplate.Sheets[officialTemplate.SheetNames[0]];
    const officialHeaders = TM30_HEADERS.map((_, column) => (
      String(officialSheet[XLSX.utils.encode_cell({ r: 0, c: column })]?.v ?? '')
    ));

    expect(officialHeaders).toEqual(TM30_HEADERS);
  });

  it('calls the application export function and writes persisted guest fields into the official template', () => {
    const generatedWorkbook = createTm30Workbook(persistedBookingFixture);
    const parsedWorkbook = XLSX.read(generatedWorkbook, { type: 'buffer' });
    const sheet = parsedWorkbook.Sheets[parsedWorkbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, blankrows: false }) as string[][];

    expect(rows[0]).toEqual([...TM30_HEADERS]);
    expect(rows[1]).toEqual([
      'Sofia',
      'Marie',
      'Anderson',
      'F',
      'P12345678',
      'SWE',
      '17/05/1992',
      '31/08/2026',
      '+4681234567',
    ]);
  });

  it('rejects a persisted guest row that violates the ICAO nationality requirement', () => {
    const invalidBooking: Tm30Booking[] = [{
      ...persistedBookingFixture[0],
      guests: [{ ...persistedBookingFixture[0].guests[0], nationality_code: 'TH' }],
    }];

    expect(() => createTm30Workbook(invalidBooking)).toThrow('ICAO 3-letter code');
  });
});
