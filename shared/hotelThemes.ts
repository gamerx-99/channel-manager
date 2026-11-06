export const HOTEL_THEMES = [
  { id: "minimal-white", tier: "basic", name: "สไตล์มินิมอล", description: "เรียบง่าย สบายตา เน้นภาพและข้อมูลที่พัก", primaryColor: "#f5f5f4", buttonBackground: "#34423a", buttonText: "#ffffff", highlight: "#7b8b76" },
  { id: "lanna-teak", tier: "premium", name: "สไตล์ล้านนา", description: "อบอุ่นแบบบ้านไม้ล้านนา โทนครีมและสีไม้", primaryColor: "#6b3f2a", buttonBackground: "#6b3f2a", buttonText: "#ffffff", highlight: "#bd9664" },
  { id: "cafe-homestay", tier: "premium", name: "สไตล์คาเฟ่", description: "นุ่มนวล เป็นกันเอง ในบรรยากาศคาเฟ่", primaryColor: "#a66b4f", buttonBackground: "#8d4e35", buttonText: "#ffffff", highlight: "#c28a65" },
  { id: "mountain-mist", tier: "premium", name: "สไตล์ธรรมชาติ", description: "สงบสดชื่นท่ามกลางธรรมชาติ", primaryColor: "#1f3b2d", buttonBackground: "#e0a458", buttonText: "#1f3b2d", highlight: "#4f6b4a" },
  { id: "boutique-noir", tier: "premium", name: "สไตล์ลักชัวรี", description: "หรูสงบในโทนดำและสีทอง", primaryColor: "#131313", buttonBackground: "#b8955a", buttonText: "#141414", highlight: "#e7c182" },
  // ASSUMPTION: new owner-designed themes use the existing premium tier.
  { id: "hostel-pop", tier: "premium", name: "สไตล์ป๊อปอาร์ต", description: "สีสันสดใส สนุก และเป็นกันเอง", primaryColor: "#ffd23f", buttonBackground: "#ffd23f", buttonText: "#000000", highlight: "#fd5c8e" },
] as const;

export type HotelThemeId = typeof HOTEL_THEMES[number]["id"];
export function isHotelThemeId(value: unknown): value is HotelThemeId {
  return typeof value === "string" && HOTEL_THEMES.some(theme => theme.id === value);
}
export const MAX_WEBSITE_GALLERY_PHOTOS = 6;

export const DEFAULT_HOTEL_COLORS = { buttonBackground: "#954831", buttonText: "#ffffff", highlight: "#bd815f" } as const;
export function getHotelThemeColors(themeId: unknown) {
  return HOTEL_THEMES.find(theme => theme.id === themeId) ?? DEFAULT_HOTEL_COLORS;
}
