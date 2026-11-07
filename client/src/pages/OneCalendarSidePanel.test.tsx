import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { translate } from "@/lib/i18n";
import OneCalendarSidePanel from "./OneCalendarSidePanel";

const common = {
  roomTypes: [], rowMap: new Map(), canManageRates: true, canManageAllotment: true,
  rooms: "", price: "", minimum: "", useBase: false, saving: false, error: null,
  onRoomsChange: () => {}, onPriceChange: () => {}, onMinimumChange: () => {},
  onUseBaseChange: () => {}, onSave: () => {},
};

describe("calendar edit heading", () => {
  it("names the one night changed in Thai", () => {
    const html = renderToStaticMarkup(<OneCalendarSidePanel {...common} language="th" t={(key, values) => translate("th", key, values)} startDate="2026-11-29" checkoutDate="2026-11-30" lastNight="2026-11-29" nightCount={1} />);
    expect(html).toContain("แก้ไข 1 คืน · คืนวันที่ 29");
    expect(html).not.toContain("เช็กเอาต์");
  });

  it("names four edited nights, the last night, and check-out in English", () => {
    const html = renderToStaticMarkup(<OneCalendarSidePanel {...common} language="en" t={(key, values) => translate("en", key, values)} startDate="2026-10-29" checkoutDate="2026-11-02" lastNight="2026-11-01" nightCount={4} />);
    expect(html).toContain("Edit 4 nights");
    expect(html).toContain("Nov 1, 2026");
    expect(html).toContain("check-out Nov 2, 2026");
  });
});
