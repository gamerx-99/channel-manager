import { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { useTranslation } from '@/lib/i18n';
type ImportChange = { section: string; action: 'added' | 'updated' | 'skipped'; name: string; detail?: string };

export function useHotelDataTransfer(hotelId: string, hotelSlug: string) {
  const { t } = useTranslation();
  const utils = trpc.useUtils();
  const [file, setFile] = useState<unknown>(null);
  const [changes, setChanges] = useState<ImportChange[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const exportQuery = trpc.channelManager.exportHotelData.useQuery({ hotel_id: hotelId }, { enabled: false });
  const preview = trpc.channelManager.previewHotelImport.useMutation({ onSuccess: result => { setChanges(result.changes as ImportChange[]); setError(null); }, onError: e => { setChanges(null); setError(e.message); } });
  const apply = trpc.channelManager.applyHotelImport.useMutation({ onSuccess: async () => { setChanges(null); setFile(null); setError(null); await Promise.all([utils.channelManager.hotel.invalidate(hotelId), utils.channelManager.hotels.invalidate()]); }, onError: e => setError(e.message) });
  async function download() {
    setError(null);
    try {
      const result = await exportQuery.refetch();
      if (result.error) { setError(result.error.message); return; }
      if (!result.data) return;
      const blob = new Blob([JSON.stringify(result.data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `hayhost-${hotelSlug}-${new Date().toISOString().slice(0, 10)}.json`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch { setError(t('hotelDataTransfer.exportError')); }
  }
  function chooseFile(selected: File | undefined) {
    if (!selected) return;
    setError(null); setChanges(null);
    selected.text().then(text => {
      let parsed: unknown;
      try { parsed = JSON.parse(text); } catch { throw new Error(t('hotelDataTransfer.invalidJson')); }
      setFile(parsed);
      preview.mutate({ hotel_id: hotelId, file: parsed });
    }).catch(e => setError(e instanceof Error ? e.message : t('hotelDataTransfer.invalidJson')));
  }
  function confirm() { if (file != null) apply.mutate({ hotel_id: hotelId, file }); }
  function cancel() { setFile(null); setChanges(null); setError(null); }
  return { changes, error, busy: exportQuery.isFetching || preview.isPending || apply.isPending, download, chooseFile, confirm, cancel, hasFile: file != null };
}
