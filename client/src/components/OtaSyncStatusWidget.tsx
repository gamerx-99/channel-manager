import React from "react";
import { ArrowUpRight, FileText, Loader2, RefreshCw } from "lucide-react";
import { Link } from "wouter";
import { formatOtaSyncDate, getOtaStatusMeta, type OtaSummaryItem } from "./OtaSyncStatusWidget.utils";

type OtaSyncStatusWidgetProps = {
  items: OtaSummaryItem[];
  isLoading: boolean;
  errorMessage?: string;
  onRetry: () => void;
  onSync: (item: OtaSummaryItem) => Promise<void> | void;
  syncingId: string | null;
  manageHref: string;
};

const toneClasses: Record<"healthy" | "error" | "warning", { card: string; dot: string; badge: string }> = {
  healthy: {
    card: "border-emerald-500/40 bg-emerald-500/5",
    dot: "bg-emerald-500",
    badge: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  },
  error: {
    card: "border-destructive/60 bg-destructive/5",
    dot: "bg-destructive animate-pulse",
    badge: "bg-destructive/10 text-destructive",
  },
  warning: {
    card: "border-amber-500/40 bg-amber-500/5",
    dot: "bg-amber-500",
    badge: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
  },
};

export default function OtaSyncStatusWidget({
  items,
  isLoading,
  errorMessage,
  onRetry,
  onSync,
  syncingId,
  manageHref,
}: OtaSyncStatusWidgetProps) {
  return (
    <section className="panel" aria-labelledby="ota-sync-status-heading" style={{ marginTop: "1.5rem", padding: "1.5rem" }}>
      <div className="panel-heading" style={{ marginBottom: "1rem" }}>
        <div>
          <div className="eyebrow">Channel health / OTA Sync Status</div>
          <h2 id="ota-sync-status-heading">Connected channels summary</h2>
          <p className="text-sm text-muted-foreground mt-1">iCal calendar availability and blocked-date updates visible to this account.</p>
        </div>
        <Link href={manageHref} className="text-link">
          Manage OTA Sync <ArrowUpRight size={14} />
        </Link>
      </div>

      {isLoading ? (
        <div className="py-5 text-center text-sm text-muted-foreground" role="status" aria-live="polite">
          Loading OTA calendar sync status…
        </div>
      ) : errorMessage ? (
        <div className="py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-sm text-destructive" role="alert">
          <span>Unable to load OTA calendar status: {errorMessage}</span>
          <button className="button button-quiet small-button" type="button" onClick={onRetry}>
            <RefreshCw size={13} /> Retry
          </button>
        </div>
      ) : items.length === 0 ? (
        <div className="py-5 text-center text-sm text-muted-foreground" role="status">
          No OTA channels connected yet. Configure an iCal connection in the property workspace to start tracking sync health.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4" data-testid="ota-sync-status-grid">
          {items.map((item) => {
            const statusMeta = getOtaStatusMeta(item);
            const classes = toneClasses[statusMeta.tone];
            const syncKey = `${item.hotel_id}:${item.provider}`;
            const isSyncing = syncingId === syncKey;
            const lastSync = item.last_sync_at ?? item.latest_log?.created_at;
            const providerLabel = item.provider.charAt(0).toUpperCase() + item.provider.slice(1);

            return (
              <article key={item.id} className={`p-4 rounded-lg border flex min-w-0 flex-col justify-between gap-3 ${classes.card}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${classes.dot}`} aria-hidden="true" />
                    <h3 className="truncate font-semibold text-sm" title={providerLabel}>{providerLabel}</h3>
                  </div>
                  <span className={`shrink-0 px-2 py-0.5 text-[10px] rounded-full font-medium ${classes.badge}`}>
                    {statusMeta.label}
                  </span>
                </div>

                <dl className="space-y-2 text-xs text-muted-foreground">
                  <div className="flex items-baseline justify-between gap-3">
                    <dt>Property</dt>
                    <dd className="truncate text-right font-medium text-foreground" title={item.hotel_name}>{item.hotel_name}</dd>
                  </div>
                  <div className="flex items-baseline justify-between gap-3">
                    <dt>Last sync</dt>
                    <dd className="text-right font-medium text-foreground">{formatOtaSyncDate(lastSync)}</dd>
                  </div>
                  <div className="flex items-baseline justify-between gap-3">
                    <dt>Updated items</dt>
                    <dd className="font-semibold text-foreground">{item.recent_updated_item_count ?? item.recent_synced_count ?? 0}</dd>
                  </div>
                </dl>

                {item.latest_log?.error_message ? (
                  <p className="rounded bg-destructive/10 p-2 text-[11px] leading-relaxed text-destructive" role="alert">
                    <strong>Error:</strong> {item.latest_log.error_message}
                  </p>
                ) : null}

                <div className="flex flex-col gap-2 border-t border-border/40 pt-3 sm:flex-row sm:items-center sm:justify-between">
                  <button
                    type="button"
                    disabled={isSyncing}
                    aria-label={`${isSyncing ? "Syncing" : "Sync Now"} for ${providerLabel} at ${item.hotel_name}`}
                    onClick={() => void onSync(item)}
                    className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded bg-primary px-2.5 py-1 text-[11px] font-medium text-primary-foreground transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {isSyncing ? <Loader2 size={12} className="animate-spin" aria-hidden="true" /> : null}
                    <span>{isSyncing ? "Syncing…" : "Sync Now"}</span>
                  </button>
                  <Link href={`/hotels/${item.hotel_id}/ota`} className="inline-flex min-h-9 items-center justify-center text-xs font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                    <FileText size={12} className="mr-1" aria-hidden="true" />
                    View sync logs
                  </Link>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
