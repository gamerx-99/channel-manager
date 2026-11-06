import React from "react";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import BookingReassurance from "./BookingReassurance";
import th from "@/lib/i18n/th";

const t = (key: string, params?: Record<string, string | number>) => {
  const value = key.split(".").reduce<any>((node, part) => node?.[part], th) as string;
  return value.replace(/\{\{(\w+)\}\}/g, (_, name) => String(params?.[name] ?? ""));
};

describe("BookingReassurance", () => {
  it("tells the guest who they book with and how to reach the property", () => {
    const html = renderToStaticMarkup(<BookingReassurance
      t={t}
      hotelName="บ้านสวนริมน้ำ"
      address="12 ถนนริมน้ำ เชียงใหม่"
      phone="081-234-5678"
      lineUrl="https://line.me/R/ti/p/@baansuan"
      facebookUrl={null}
      instagramUrl="https://instagram.com/baansuan"
      xUrl={null}
    />);
    expect(html).toContain("ท่านกำลังจองห้องพักกับ บ้านสวนริมน้ำ");
    expect(html).toContain("หากมีข้อสงสัยหรือพบปัญหา ติดต่อที่พักได้โดยตรง");
    expect(html).toContain("12 ถนนริมน้ำ เชียงใหม่");
    expect(html).toContain('href="tel:081-234-5678"');
    expect(html).toContain('href="https://line.me/R/ti/p/@baansuan" target="_blank"');
    expect(html).toContain("Instagram");
    expect(html).not.toContain("Facebook");
  });

  it("still shows both lines when the hotel shares no contact", () => {
    const html = renderToStaticMarkup(<BookingReassurance t={t} hotelName="Sample Stay" address="" />);
    expect(html).toContain("ท่านกำลังจองห้องพักกับ Sample Stay");
    expect(html).toContain("ติดต่อที่พักได้โดยตรง");
    expect(html).not.toContain("hotel-contacts-list");
  });
});
