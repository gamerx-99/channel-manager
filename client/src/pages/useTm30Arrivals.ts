import { useState } from "react";
import { downloadBase64File } from "@/lib/downloadFile";
import { trpc } from "@/lib/trpc";

/** The Immigration Bureau's TM.30 login page; hayhost never files for the hotel, the hotel uploads the file there. */
export const TM30_PORTAL_URL = "https://tm30.immigration.go.th/tm30api/loginExternal.jsp";

/** Foreign guests arriving on a day (today in Thailand until the person picks another), and the file to upload. */
export function useTm30Arrivals(hotelId: string) {
  const [date, setDate] = useState<string | undefined>(undefined);
  const [downloadFailed, setDownloadFailed] = useState(false);
  const arrivals = trpc.channelManager.tm30Arrivals.useQuery({ hotel_id: hotelId, date }, { enabled: Boolean(hotelId) });
  const exportFile = trpc.channelManager.exportTm30Arrivals.useMutation({
    onSuccess: result => {
      setDownloadFailed(false);
      downloadBase64File(result.base64, result.filename, result.contentType);
    },
    onError: () => setDownloadFailed(true),
  });
  const guests = arrivals.data?.guests ?? [];
  return {
    arrivals,
    guests,
    shownDate: arrivals.data?.date ?? date ?? "",
    readyCount: arrivals.data?.readyCount ?? 0,
    incompleteCount: guests.filter(guest => guest.problem).length,
    pickDate: (value: string) => setDate(value || undefined),
    download: () => exportFile.mutate({ hotel_id: hotelId, date: arrivals.data?.date ?? date }),
    downloading: exportFile.isPending,
    downloadFailed,
  };
}
