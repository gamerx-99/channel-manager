export const HOTEL_THEMES = [
  { id: "minimal-white", tier: "basic", name: { brand: "Pure", th: "เพียว" }, description: { th: "เรียบ สะอาด เน้นภาพและข้อมูล", en: "Clean and simple, puts photos and details first" }, suits: { th: "โฮมสเตย์ใหม่ / ห้องพักโมเดิร์น", en: "New homestays / modern rooms" }, primaryColor: "#f5f5f4", buttonBackground: "#34423a", buttonText: "#ffffff", highlight: "#7b8b76" },
  { id: "lanna-teak", tier: "premium", name: { brand: "Warm Wood", th: "วอร์ม วู้ด" }, description: { th: "อบอุ่นแบบบ้านไม้ โทนครีมและสีไม้", en: "Warm wooden-home feel in cream and wood tones" }, suits: { th: "บ้านไม้เก่า / วิลล่าภาคเหนือ", en: "Old wooden homes / northern villas" }, primaryColor: "#6b3f2a", buttonBackground: "#6b3f2a", buttonText: "#ffffff", highlight: "#bd9664" },
  { id: "cafe-homestay", tier: "premium", name: { brand: "Café Slow", th: "คาเฟ่ สโลว์" }, description: { th: "นุ่มนวล เป็นกันเอง เหมือนนั่งคาเฟ่", en: "Soft and welcoming, like time spent in a café" }, suits: { th: "คาเฟ่ + ที่พัก / โฮมสเตย์เล็กๆ", en: "Cafés with rooms / small homestays" }, primaryColor: "#a66b4f", buttonBackground: "#8d4e35", buttonText: "#ffffff", highlight: "#c28a65" },
  { id: "mountain-mist", tier: "premium", name: { brand: "Terra", th: "เทอร์ร่า" }, description: { th: "สงบ สดชื่น ท่ามกลางธรรมชาติ", en: "Calm and refreshing, surrounded by nature" }, suits: { th: "ที่พักในป่า / ริมน้ำ / บนดอย", en: "Forest, riverside or mountain stays" }, primaryColor: "#1f3b2d", buttonBackground: "#e0a458", buttonText: "#1f3b2d", highlight: "#4f6b4a" },
  { id: "boutique-noir", tier: "premium", name: { brand: "Noir Luxe", th: "นัวร์ ลักซ์" }, description: { th: "หรู สงบ โทนดำ - ทอง", en: "Quiet luxury in black and gold" }, suits: { th: "วิลล่าพูล / บูทีคโฮเทล", en: "Pool villas / boutique hotels" }, primaryColor: "#131313", buttonBackground: "#b8955a", buttonText: "#141414", highlight: "#e7c182" },
  // ASSUMPTION: new owner-designed themes use the existing premium tier.
  { id: "hostel-pop", tier: "premium", name: { brand: "Vivid Pop", th: "วิวิด ป๊อป" }, description: { th: "สีสันสดใส สนุก เป็นกันเอง", en: "Bright, playful and welcoming" }, suits: { th: "โฮสเทล / ที่พักวัยรุ่น", en: "Hostels / stays for young travellers" }, primaryColor: "#ffd23f", buttonBackground: "#ffd23f", buttonText: "#000000", highlight: "#fd5c8e" },
  // ASSUMPTION: owner may revise the Serene brand name.
  { id: "riverside-calm", tier: "premium", name: { brand: "Serene", th: "เซรีน" }, description: { th: "สงบ ผ่อนคลาย แบบรีสอร์ท", en: "Peaceful and relaxing, with a resort feel" }, suits: { th: "รีสอร์ท / ที่พักริมน้ำ ริมทะเล", en: "Resorts / riverside or seaside stays" }, primaryColor: "#0d575a", buttonBackground: "#0d575a", buttonText: "#ffffff", highlight: "#2f6f73" },
  // ASSUMPTION: owner may revise the Postcard brand name.
  { id: "vintage-old-town", tier: "premium", name: { brand: "Postcard", th: "โพสต์การ์ด" }, description: { th: "กลิ่นอายวันวาน แบบโปสต์การ์ด", en: "Nostalgic, like a postcard from another time" }, suits: { th: "เกสต์เฮาส์ / ตึกเก่ารีโนเวท", en: "Guesthouses / renovated old buildings" }, primaryColor: "#a23e18", buttonBackground: "#c2562e", buttonText: "#ffffff", highlight: "#2e7c7a" },
] as const;

export type HotelThemeId = typeof HOTEL_THEMES[number]["id"];
export type HotelTheme = typeof HOTEL_THEMES[number];
export type ThemeDisplayLanguage = "th" | "en";
export function themeDisplay(theme: HotelTheme, language: ThemeDisplayLanguage) {
  const brand = theme.name.brand;
  const reading = language === "th" ? theme.name.th : null;
  return { name: reading ? `${brand} - ${reading}` : brand, brand, reading, description: theme.description[language], suits: theme.suits[language] };
}
export function isHotelThemeId(value: unknown): value is HotelThemeId {
  return typeof value === "string" && HOTEL_THEMES.some(theme => theme.id === value);
}
export const MAX_WEBSITE_GALLERY_PHOTOS = 6;

export const DEFAULT_HOTEL_COLORS = { buttonBackground: "#954831", buttonText: "#ffffff", highlight: "#bd815f" } as const;
export function getHotelThemeColors(themeId: unknown) {
  return HOTEL_THEMES.find(theme => theme.id === themeId) ?? DEFAULT_HOTEL_COLORS;
}
