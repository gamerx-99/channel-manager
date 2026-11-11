import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

// Owner decision 2026-11-11: the number strips at the top of pages were on some pages and not on others, so they
// are gone everywhere. A page that had an action inside its strip keeps that action in the page header.
describe("no summary strips on page headers", () => {
  for (const page of ["HotelStaff", "HotelDetail", "Hotels", "AdminUsers"]) {
    it(`${page} has no strip`, () => {
      const source = read(`client/src/pages/${page}.tsx`);
      expect(source).not.toContain("summary-strip");
      expect(source).not.toContain("detail-kpis");
    });
  }

  it("keeps the Hotel Admin transfer action on the staff page, in the header", () => {
    const staff = read("client/src/pages/HotelStaff.tsx");
    const header = staff.slice(staff.indexOf('className="page-intro-actions"'), staff.indexOf("</section>", staff.indexOf('className="page-intro-actions"')));
    expect(header).toContain('t("hotelStaff.transferHotelAdmin")');
  });
});
