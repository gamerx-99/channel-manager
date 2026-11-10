import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import en from "@/lib/i18n/en";
import th from "@/lib/i18n/th";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("TM.30 portal link contract", () => {
  const bookings = read("client/src/pages/Bookings.tsx");

  it("links to the Immigration Bureau's TM.30 site in a new tab", () => {
    expect(bookings).toContain("const TM30_PORTAL_URL = 'https://tm30.immigration.go.th/tm30api/loginExternal.jsp';");
    expect(bookings).toContain('href={TM30_PORTAL_URL} target="_blank" rel="noopener noreferrer"');
  });

  it("labels the link in both languages", () => {
    expect(th.bookings.openTm30Portal).toBeTruthy();
    expect(en.bookings.openTm30Portal).toBeTruthy();
  });

  it("lets staff inspect a private slip before resolving payment verification", () => {
    expect(bookings).toContain("trpc.payment.getSlip.useQuery");
    expect(bookings).toContain("t('bookings.viewSlip')");
    expect(bookings).toContain("t('bookings.approveVerification')");
    expect(bookings).toContain("t('bookings.rejectVerification')");
    expect(th.bookings.viewSlip).toBeTruthy();
    expect(en.bookings.viewSlip).toBeTruthy();
  });
});
