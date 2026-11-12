import { describe, expect, it } from "vitest";
import { emailsMatch, isValidGuestEmail, suggestEmailCorrection } from "./emailCheck";

describe("isValidGuestEmail", () => {
  it.each(["a@b", "a@b.", "a@.com", "a@gmail", "@gmail.com", "a b@gmail.com", "a@@gmail.com", "a..b@gmail.com", "a@gmail.c", ""])(
    "rejects %s",
    (value) => expect(isValidGuestEmail(value)).toBe(false),
  );
  it.each(["guest@gmail.com", " guest@gmail.com ", "first.last+tag@hotel.co.th"])("accepts %s", (value) =>
    expect(isValidGuestEmail(value)).toBe(true),
  );
});

describe("suggestEmailCorrection", () => {
  it("fixes one-character typos of common providers", () => {
    expect(suggestEmailCorrection("somchai@gmial.com")).toBe("somchai@gmail.com");
    expect(suggestEmailCorrection("somchai@gmail.con")).toBe("somchai@gmail.com");
    expect(suggestEmailCorrection("somchai@hotmial.com")).toBe("somchai@hotmail.com");
  });
  it("fixes near-miss endings after the domain name", () => {
    expect(suggestEmailCorrection("a@myhotel.con")).toBe("a@myhotel.com");
    expect(suggestEmailCorrection("a@myhotel.comm")).toBe("a@myhotel.com");
    expect(suggestEmailCorrection("a@myhotel.co.t")).toBe("a@myhotel.co.th");
    expect(suggestEmailCorrection("a@mac.com")).toBeNull();
  });
  it("leaves correct and unrelated domains alone", () => {
    expect(suggestEmailCorrection("a@gmail.com")).toBeNull();
    expect(suggestEmailCorrection("a@mycompany.co.th")).toBeNull();
  });
});

describe("emailsMatch", () => {
  it("ignores case and surrounding spaces only", () => {
    expect(emailsMatch(" A@Gmail.com", "a@gmail.com ")).toBe(true);
    expect(emailsMatch("a@gmail.com", "b@gmail.com")).toBe(false);
  });
});
