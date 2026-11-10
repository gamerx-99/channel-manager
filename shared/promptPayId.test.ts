import { describe, expect, it } from "vitest";
import { normalisePromptPayId } from "./promptPayId";

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
