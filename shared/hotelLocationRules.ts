export type Coordinates = { latitude: number | null; longitude: number | null };

export function parseCoordinatePaste(value: string): Coordinates | null {
  const match = value.trim().match(/^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/);
  if (!match) return null;
  return { latitude: Number(match[1]), longitude: Number(match[2]) };
}

export function isValidCoordinates(latitude: number | null | undefined, longitude: number | null | undefined) {
  if (latitude == null && longitude == null) return true;
  return Number.isFinite(latitude) && Number.isFinite(longitude) && latitude! >= -90 && latitude! <= 90 && longitude! >= -180 && longitude! <= 180;
}

export function validateHotelContacts(input: { phone?: string | null; facebook?: string | null; instagram?: string | null; x?: string | null; showPhone: boolean; showFacebook: boolean; showInstagram: boolean; showX: boolean }) {
  const phone = input.phone?.trim() ?? "";
  if (phone && !/^[0-9 +\-]+$/.test(phone)) return "เบอร์โทรใช้ได้เฉพาะตัวเลข เว้นวรรค + และ -";
  const networks: Array<[string, string, RegExp, boolean]> = [
    ["Facebook", input.facebook ?? "", /^https:\/\/(?:www\.)?(?:facebook\.com|fb\.com|m\.facebook\.com)(?:[/:?#]|$)/i, input.showFacebook],
    ["Instagram", input.instagram ?? "", /^https:\/\/(?:www\.)?instagram\.com(?:[/:?#]|$)/i, input.showInstagram],
    ["X", input.x ?? "", /^https:\/\/(?:www\.)?(?:x\.com|twitter\.com)(?:[/:?#]|$)/i, input.showX],
  ];
  for (const [label, value, host, shown] of networks) {
    if (shown && !value.trim()) return `กรุณาใส่ลิงก์ ${label}`;
    if (value.trim() && !host.test(value.trim())) return `ลิงก์ ${label} ไม่ถูกต้อง`;
  }
  if (input.showPhone && !phone) return "กรุณาใส่เบอร์โทรโรงแรม";
  return null;
}
