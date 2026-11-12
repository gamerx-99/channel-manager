// The hotel logo is a single image kept on the hotel (not in the photo library).
// The Worker routes /api/hotel-logo/:hotelId store it in R2 and set hotels.logo_url.

async function readError(response: Response, fallback: string) {
  const body = (await response.json().catch(() => null)) as { error?: string } | null;
  return body?.error || `${fallback} (HTTP ${response.status}).`;
}

export function readFileAsDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Could not read the file."));
    reader.readAsDataURL(file);
  });
}

export async function uploadHotelLogoFile(
  hotelId: string,
  input: { base64: string; filename: string },
  fetchImpl: typeof fetch = globalThis.fetch,
): Promise<{ logo_url: string }> {
  const response = await fetchImpl(`/api/hotel-logo/${encodeURIComponent(hotelId)}`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!response.ok) throw new Error(await readError(response, "Logo upload failed"));
  return (await response.json()) as { logo_url: string };
}

export async function removeHotelLogo(hotelId: string, fetchImpl: typeof fetch = globalThis.fetch): Promise<void> {
  const response = await fetchImpl(`/api/hotel-logo/${encodeURIComponent(hotelId)}`, { method: "DELETE", credentials: "include" });
  if (!response.ok) throw new Error(await readError(response, "Logo removal failed"));
}
