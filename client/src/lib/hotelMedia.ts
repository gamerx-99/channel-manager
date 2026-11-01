/**
 * Upload one hotel image to the Worker's `/api/media/:hotelId` route, which
 * streams it into R2. (The tRPC `uploadHotelMedia` procedure refuses uploads.)
 */
export async function uploadHotelMediaFile(
  hotelId: string,
  input: { base64: string; filename: string; caption?: string | null },
  fetchImpl: typeof fetch = globalThis.fetch,
) {
  const response = await fetchImpl(`/api/media/${encodeURIComponent(hotelId)}`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const body = (await response.json().catch(() => null)) as { error?: string } | null;
  if (!response.ok) throw new Error(body?.error || `Upload failed (HTTP ${response.status}).`);
  return body;
}
