export type OtaSyncLogSummary = {
  status?: string | null;
  error_message?: string | null;
  created_at?: string | null;
};

export type OtaSummaryItem = {
  id: string;
  hotel_id: string;
  hotel_name: string;
  provider: string;
  status: string;
  last_sync_at?: string | null;
  recent_updated_item_count?: number | null;
  recent_synced_count?: number | null;
  latest_log?: OtaSyncLogSummary | null;
};

export type OtaStatusTone = "healthy" | "error" | "warning";

export function getOtaStatusMeta(item: Pick<OtaSummaryItem, "status" | "latest_log">): {
  tone: OtaStatusTone;
  label: string;
} {
  const status = item.status.trim().toLowerCase();
  const hasFailedLog = item.latest_log?.status?.toLowerCase() === "failed";

  if (hasFailedLog || status === "error" || status === "failed") {
    return { tone: "error", label: "Sync error" };
  }

  // The OTA feed has stays overlapping existing bookings on the mapped room.
  if (status === "conflict") {
    return { tone: "error", label: "Booking conflict" };
  }

  if (status === "connected" || status === "healthy" || status === "synced") {
    return { tone: "healthy", label: "Healthy" };
  }

  return { tone: "warning", label: status || "Needs attention" };
}

export function formatOtaSyncDate(value?: string | null): string {
  if (!value) return "Never synced";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Never synced";

  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}
