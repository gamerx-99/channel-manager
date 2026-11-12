import { useState } from "react";
import { readFileAsDataUrl, removeHotelLogo, uploadHotelLogoFile } from "@/lib/hotelLogo";

/** Upload / remove the hotel logo; `onChanged` refetches the hotel so the preview updates. */
export function useHotelLogo(hotelId: string, onChanged: () => unknown) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await action();
      await onChanged();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(false);
    }
  }

  return {
    busy,
    error,
    upload: (file: File) => run(async () => uploadHotelLogoFile(hotelId, { base64: await readFileAsDataUrl(file), filename: file.name })),
    remove: () => run(() => removeHotelLogo(hotelId)),
  };
}
