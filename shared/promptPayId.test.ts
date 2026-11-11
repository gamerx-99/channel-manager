import { describe, expect, it } from "vitest";
import { checkPromptPayIdForSave, hasValidThaiIdChecksum, normalisePromptPayId } from "./promptPayId";

describe("normalisePromptPayId", () => {
  it.each(["0615125657", "0812345678", "0912345678"])("accepts local mobile %s", value => {
    expect(normalisePromptPayId(value)).toEqual({ type: "mobile", value, emvValue: `0066${value.slice(1)}` });
  });
  it.each(["+66 61 512 5657", "66-61-512-5657", "0066.61.512.5657", "+66 (61) 512 5657"])("normalises international mobile %s", value => {
    expect(normalisePromptPayId(value)?.value).toBe("0615125657");
  });
  it("accepts a 13-digit ID without changing it", () => {
    expect(normalisePromptPayId("1234567890123")?.value).toBe("1234567890123");
  });
  it.each(["066615125657", "06151256579", "0212345678", "123456789012", "123456789012345", "061512565a", "061/512/5657"])("rejects %s", value => {
    expect(normalisePromptPayId(value)).toBeNull();
  });
});

describe("hasValidThaiIdChecksum (Modulus 11, weights 13 down to 2)", () => {
  it("accepts IDs whose 13th digit matches", () => {
    expect(hasValidThaiIdChecksum("1101700230708")).toBe(true);
    // 1·13 + 2·12 + … + 2·2 = 352, 352 mod 11 = 0, (11 - 0) mod 10 = 1
    expect(hasValidThaiIdChecksum("1234567890121")).toBe(true);
  });

  it("rejects a wrong check digit and anything that is not 13 digits", () => {
    expect(hasValidThaiIdChecksum("1234567890122")).toBe(false);
    expect(hasValidThaiIdChecksum("1101700230709")).toBe(false);
    expect(hasValidThaiIdChecksum("123456789012")).toBe(false);
    expect(hasValidThaiIdChecksum("12345678901a1")).toBe(false);
  });

  it("does not use the off-by-one weighting (12 down to 1), which would reject this valid ID", () => {
    const offByOne = (id: string) => {
      let sum = 0;
      for (let index = 0; index < 12; index += 1) sum += Number(id[index]) * (13 - (index + 1));
      return (11 - (sum % 11)) % 10 === Number(id[12]);
    };
    expect(offByOne("1234567890121")).toBe(false);
    expect(hasValidThaiIdChecksum("1234567890121")).toBe(true);
  });
});

describe("checkPromptPayIdForSave", () => {
  it("accepts mobile numbers as before", () => {
    expect(checkPromptPayIdForSave("+66 61 512 5657")).toEqual({ ok: true, value: "0615125657" });
  });

  it("accepts a 13-digit ID only when its check digit is right", () => {
    expect(checkPromptPayIdForSave("1-1017-00230-70-8")).toEqual({ ok: true, value: "1101700230708" });
    expect(checkPromptPayIdForSave("1234567890123")).toEqual({ ok: false, problem: "id_checksum" });
  });

  it("reports a bad format separately", () => {
    expect(checkPromptPayIdForSave("12345")).toEqual({ ok: false, problem: "format" });
  });

  it("leaves QR generation permissive, so an ID saved before the rule still works", () => {
    expect(normalisePromptPayId("1234567890123")?.value).toBe("1234567890123");
  });
});
