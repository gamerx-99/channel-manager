import { describe, expect, it } from "vitest";
import { moneyToSatang, satangToMoney, sumMoneyInSatang } from "./money";

describe("D1 decimal money helpers", () => {
  it("converts decimal strings to exact integer satang", () => {
    expect(moneyToSatang("0.29")).toBe(BigInt(29));
    expect(sumMoneyInSatang(["0.10", "0.20", "12.34"])).toBe(BigInt(1264));
    expect(satangToMoney(BigInt(-29))).toBe("-0.29");
  });

  it.each(["1.001", "1e3", "NaN", ""]) ("rejects unsafe decimal input %s", value => {
    expect(() => moneyToSatang(value)).toThrow(RangeError);
  });

  it("rejects JavaScript numbers instead of performing floating-point money math", () => {
    expect(() => moneyToSatang(0.1 as unknown as string)).toThrow(RangeError);
  });
});
