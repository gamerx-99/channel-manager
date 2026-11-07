import { describe, expect, it } from "vitest";
import { branchIdFromApiUrl } from "./slipokApi";

describe("SlipOK API URL", () => {
  it("extracts the branch segment from the API value shown by SlipOK", () => {
    expect(branchIdFromApiUrl("https://api.slipok.com/api/line/apikey/123456"))
      .toBe("123456");
    expect(branchIdFromApiUrl(" https://api.slipok.com/api/line/apikey/branch_1 "))
      .toBe("branch_1");
  });

  it("rejects unrelated, incomplete, or altered URLs", () => {
    for (const value of [
      "123456",
      "https://api.slipok.com/api/line/apikey/",
      "http://api.slipok.com/api/line/apikey/123456",
      "https://other.example/api/line/apikey/123456",
      "https://api.slipok.com/api/line/apikey/123456?redirect=1",
      "https://api.slipok.com/api/line/apikey/123456/extra",
    ]) {
      expect(branchIdFromApiUrl(value)).toBeNull();
    }
  });
});
