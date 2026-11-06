import { describe, expect, it } from "vitest";
import { calculateBookingDocumentAmounts } from "./bookingDocuments";

const off = { vatEnabled: false, vatRate: 7, withholdingEnabled: false, withholdingRate: 3 };

describe("booking document tax calculation", () => {
  it("leaves the price unchanged when both taxes are off", () => {
    expect(calculateBookingDocumentAmounts(100000, off)).toEqual({ subtotalSatang: 100000, vatSatang: 0, totalSatang: 100000, withholdingSatang: 0, netToPaySatang: 100000 });
  });
  it("adds VAT to the base price and splits it from a VAT-inclusive price", () => {
    expect(calculateBookingDocumentAmounts(100000, { ...off, vatEnabled: true })).toEqual({ subtotalSatang: 100000, vatSatang: 7000, totalSatang: 107000, withholdingSatang: 0, netToPaySatang: 107000 });
    expect(calculateBookingDocumentAmounts(107000, { ...off, vatEnabled: true }, true)).toMatchObject({ subtotalSatang: 100000, vatSatang: 7000, totalSatang: 107000 });
  });
  it("deducts withholding from the price when VAT is off", () => {
    expect(calculateBookingDocumentAmounts(100000, { ...off, withholdingEnabled: true })).toEqual({ subtotalSatang: 100000, vatSatang: 0, totalSatang: 100000, withholdingSatang: 3000, netToPaySatang: 97000 });
  });
  it("calculates withholding on the pre-VAT subtotal", () => {
    expect(calculateBookingDocumentAmounts(100000, { vatEnabled: true, vatRate: 7, withholdingEnabled: true, withholdingRate: 3 })).toEqual({ subtotalSatang: 100000, vatSatang: 7000, totalSatang: 107000, withholdingSatang: 3000, netToPaySatang: 104000 });
  });
});
