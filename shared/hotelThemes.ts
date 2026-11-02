export const HOTEL_THEMES = [
  { id: "minimal-white", tier: "basic", name: "มินิมอล ขาวสะอาด", description: "เรียบง่าย สบายตา เน้นภาพและข้อมูลที่พัก", primaryColor: "#f5f5f4" },
  { id: "lanna-teak", tier: "premium", name: "ล้านนา ไม้สัก", description: "อบอุ่นแบบบ้านไม้ล้านนา โทนครีมและสีไม้", primaryColor: "#6b3f2a" },
  { id: "cafe-homestay", tier: "premium", name: "คาเฟ่ โฮมสเตย์", description: "นุ่มนวล เป็นกันเอง ในบรรยากาศคาเฟ่", primaryColor: "#a66b4f" },
] as const;

export type HotelThemeId = typeof HOTEL_THEMES[number]["id"];
export function isHotelThemeId(value: unknown): value is HotelThemeId {
  return typeof value === "string" && HOTEL_THEMES.some(theme => theme.id === value);
}
