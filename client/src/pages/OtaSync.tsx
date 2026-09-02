import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, RefreshCw, Globe, PlusCircle, Trash2, Link2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { useTranslation } from "@/lib/i18n";

function formatSyncTimestamp(value: string | null | undefined, invalidDateLabel: string): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return invalidDateLabel;
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Bangkok",
  }).format(date);
}

export default function OtaSync({ hotelId }: { hotelId: string }) {
  const { t } = useTranslation();
  const utils = trpc.useUtils();
  const { data: connections, isLoading: loadingConn, error: connectionError, refetch: refetchConnections } = trpc.channelManager.ota.listConnections.useQuery({ hotelId });
  const { data: logs, isLoading: loadingLogs, error: logsError, refetch: refetchLogs } = trpc.channelManager.ota.listLogs.useQuery({ hotelId });

  const [selectedLog, setSelectedLog] = useState<any | null>(null);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [exportUrlDialogConn, setExportUrlDialogConn] = useState<any | null>(null);
  const [newProvider, setNewProvider] = useState("");
  const [newImportUrl, setNewImportUrl] = useState("");

  const upsertMutation = trpc.channelManager.ota.upsertConnection.useMutation({
    onSuccess: () => {
      toast.success(t("otaSync.toastSavedSuccess"));
      utils.channelManager.ota.listConnections.invalidate({ hotelId });
      utils.channelManager.ota.listLogs.invalidate({ hotelId });
      setAddDialogOpen(false);
      setNewProvider("");
      setNewImportUrl("");
    },
    onError: (err) => {
      toast.error(t("otaSync.toastSaveFailed", { error: err.message }));
    }
  });

  const deleteMutation = trpc.channelManager.ota.deleteConnection.useMutation({
    onSuccess: () => {
      toast.success(t("otaSync.toastDeletedSuccess"));
      utils.channelManager.ota.listConnections.invalidate({ hotelId });
    },
    onError: (err) => {
      toast.error(t("otaSync.toastDeleteFailed", { error: err.message }));
    }
  });

  const syncMutation = trpc.channelManager.ota.triggerSync.useMutation({
    onSuccess: (res, variables: any) => {
      toast.success(t("otaSync.toastSyncSuccess", { provider: variables.provider.toUpperCase(), count: (res as any).updatedItemCount ?? 0 }));
      utils.channelManager.ota.listConnections.invalidate({ hotelId });
      utils.channelManager.ota.listLogs.invalidate({ hotelId });
    },
    onError: (err: any, variables: any) => {
      toast.error(t("otaSync.toastSyncFailed", { provider: variables.provider.toUpperCase(), error: err.message }), {
        action: {
          label: t("otaSync.retry"),
          onClick: () => syncMutation.mutate({ hotelId, provider: variables.provider })
        }
      });
    }
  });

  const handleAddConnection = () => {
    if (!newProvider.trim()) {
      toast.error(t("otaSync.toastEnterChannelName"));
      return;
    }
    upsertMutation.mutate({
      hotelId,
      provider: newProvider.trim(),
      status: 'active',
      icalImportUrl: newImportUrl.trim() || undefined,
    });
  };

  const handleDelete = (provider: string) => {
    if (!window.confirm(t("otaSync.confirmDelete", { provider }))) return;
    deleteMutation.mutate({ hotelId, provider });
  };

  const isLoading = loadingConn || loadingLogs;
  const error = connectionError || logsError;

  if (isLoading) {
    return <div className="p-8 text-center text-muted-foreground">{t("otaSync.loadingSettings")}</div>;
  }

  if (error) {
    return (
      <div className="p-8 text-center">
        <p className="text-destructive mb-2">{t("otaSync.errorLoadingSettings", { error: error.message })}</p>
        <button onClick={() => { refetchConnections(); refetchLogs(); }} className="px-4 py-2 bg-primary text-primary-foreground rounded">{t("otaSync.retry")}</button>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-12">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b pb-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{t("otaSync.title")}</h1>
            <p className="text-sm text-muted-foreground mt-1">
              {t("otaSync.lede")}
            </p>
          </div>
        </div>

        <Tabs defaultValue="connections" className="space-y-6">
          <TabsList className="grid w-full grid-cols-2 max-w-md">
            <TabsTrigger value="connections">{t("otaSync.tabConnections")}</TabsTrigger>
            <TabsTrigger value="logs">{t("otaSync.tabLogs")}</TabsTrigger>
          </TabsList>

          <TabsContent value="connections" className="space-y-4">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-base">{t("otaSync.connectedChannelsTitle")}</CardTitle>
                    <CardDescription className="text-xs mt-1">
                      {t("otaSync.connectedChannelsDesc")}
                    </CardDescription>
                  </div>
                  <Button size="sm" onClick={() => setAddDialogOpen(true)}>
                    <PlusCircle className="h-4 w-4 mr-1.5" />
                    {t("otaSync.addConnectionButton")}
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {!connections || connections.length === 0 ? (
                  <div className="text-center py-10 text-muted-foreground text-sm">
                    <Globe className="h-10 w-10 mx-auto mb-3 opacity-30" />
                    <p>{t("otaSync.noConnectionsTitle")}</p>
                    <p className="text-xs mt-1">{t("otaSync.noConnectionsDesc")}</p>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t("otaSync.colCalendarName")}</TableHead>
                        <TableHead>{t("otaSync.colCalendarLink")}</TableHead>
                        <TableHead className="whitespace-nowrap">{t("otaSync.colLastSynced")}</TableHead>
                        <TableHead>{t("otaSync.colStatus")}</TableHead>
                        <TableHead className="text-right">{t("otaSync.colActions")}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {connections.map((conn: any) => {
                        const isSyncing = syncMutation.isPending && syncMutation.variables?.provider === conn.provider;
                        const isDeleting = deleteMutation.isPending && deleteMutation.variables?.provider === conn.provider;
                        return (
                          <TableRow key={conn.id ?? conn.provider}>
                            <TableCell className="font-medium">
                              <div className="flex items-center gap-1.5">
                                <Globe className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                                {conn.provider}
                              </div>
                            </TableCell>
                            <TableCell className="max-w-xs">
                              {conn.ical_import_url ? (
                                <div className="flex items-center gap-1">
                                  <span className="text-xs font-mono text-muted-foreground truncate max-w-[200px]" title={conn.ical_import_url}>
                                    {conn.ical_import_url}
                                  </span>
                                  {conn.ical_export_url && (
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      className="h-6 px-1.5 text-[10px] shrink-0"
                                      onClick={() => setExportUrlDialogConn(conn)}
                                      title={t("otaSync.viewExportUrl")}
                                    >
                                      <Link2 className="h-3 w-3" />
                                    </Button>
                                  )}
                                </div>
                              ) : (
                                <span className="text-xs text-muted-foreground italic">{t("otaSync.notConfigured")}</span>
                              )}
                            </TableCell>
                            <TableCell className="text-xs whitespace-nowrap text-muted-foreground">
                              {formatSyncTimestamp(conn.last_sync_at, t("otaSync.invalidDate"))}
                            </TableCell>
                            <TableCell>
                              <Badge variant={conn.status === 'connected' || conn.status === 'active' ? 'default' : conn.status === 'error' ? 'destructive' : 'secondary'} className="text-[10px]">
                                {conn.status || 'inactive'}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex items-center justify-end gap-1">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-7 px-2 text-xs"
                                  disabled={isSyncing || !conn.ical_import_url}
                                  onClick={() => syncMutation.mutate({ hotelId, provider: conn.provider })}
                                  title={!conn.ical_import_url ? t("otaSync.setImportUrlFirst") : t("otaSync.syncNow")}
                                >
                                  {isSyncing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                                  <span className="ml-1">{t("otaSync.syncButton")}</span>
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-7 px-2 text-xs text-destructive hover:text-destructive hover:bg-destructive/10"
                                  disabled={isDeleting}
                                  onClick={() => handleDelete(conn.provider)}
                                >
                                  {isDeleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                                  <span className="ml-1">{t("otaSync.deleteButton")}</span>
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="logs" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">{t("otaSync.logsTitle")}</CardTitle>
                <CardDescription>{t("otaSync.logsDesc")}</CardDescription>
              </CardHeader>
              <CardContent>
                {!logs || logs.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground text-sm">
                    {t("otaSync.noLogs")}
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t("otaSync.colLogTime")}</TableHead>
                        <TableHead>{t("otaSync.colLogProvider")}</TableHead>
                        <TableHead>{t("otaSync.colLogAction")}</TableHead>
                        <TableHead>{t("otaSync.colLogStatus")}</TableHead>
                        <TableHead>{t("otaSync.colLogDetails")}</TableHead>
                        <TableHead className="text-right">{t("otaSync.colActions")}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {logs.map((log: any) => (
                        <TableRow key={log.id} className="cursor-pointer hover:bg-muted/50" onClick={() => setSelectedLog(log)}>
                          <TableCell className="text-xs whitespace-nowrap">{formatSyncTimestamp(log.created_at, t("otaSync.invalidDate"))}</TableCell>
                          <TableCell className="font-medium uppercase text-xs">{log.provider}</TableCell>
                          <TableCell className="text-xs">{log.action}</TableCell>
                          <TableCell>
                            <Badge variant={log.status === 'success' ? 'default' : 'destructive'} className="text-[10px]">
                              {log.status}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground max-w-xs truncate">
                            {log.error_message || JSON.stringify(log.response || log.payload || '')}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={(e) => { e.stopPropagation(); setSelectedLog(log); }}>
                              {t("otaSync.viewDetails")}
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Add Connection Dialog */}
        <Dialog open={addDialogOpen} onOpenChange={(open) => { if (!open) { setAddDialogOpen(false); setNewProvider(""); setNewImportUrl(""); } }}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>{t("otaSync.addModalTitle")}</DialogTitle>
              <DialogDescription>
                {t("otaSync.addModalDesc")}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label htmlFor="new-provider">{t("otaSync.channelNameLabel")}</Label>
                <Input
                  id="new-provider"
                  placeholder={t("otaSync.channelNamePlaceholder")}
                  value={newProvider}
                  onChange={(e) => setNewProvider(e.target.value)}
                  autoFocus
                />
                <p className="text-xs text-muted-foreground">{t("otaSync.channelNameHint")}</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="new-import-url">{t("otaSync.importUrlLabel")}</Label>
                <Input
                  id="new-import-url"
                  placeholder={t("otaSync.importUrlPlaceholder")}
                  value={newImportUrl}
                  onChange={(e) => setNewImportUrl(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">{t("otaSync.importUrlHint")}</p>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => { setAddDialogOpen(false); setNewProvider(""); setNewImportUrl(""); }}>
                {t("otaSync.cancel")}
              </Button>
              <Button onClick={handleAddConnection} disabled={upsertMutation.isPending || !newProvider.trim()}>
                {upsertMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : null}
                {t("otaSync.save")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Export URL Dialog */}
        {exportUrlDialogConn && (
          <Dialog open={Boolean(exportUrlDialogConn)} onOpenChange={(open) => !open && setExportUrlDialogConn(null)}>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>{t("otaSync.exportModalTitle", { provider: exportUrlDialogConn.provider })}</DialogTitle>
                <DialogDescription>
                  {t("otaSync.exportModalDesc")}
                </DialogDescription>
              </DialogHeader>
              <div className="py-2">
                <Label className="text-xs font-medium">{t("otaSync.exportUrlLabel")}</Label>
                <Input
                  readOnly
                  value={exportUrlDialogConn.ical_export_url || ''}
                  className="mt-2 bg-muted text-xs font-mono"
                  onClick={(e) => (e.target as HTMLInputElement).select()}
                />
                <p className="text-xs text-muted-foreground mt-2">{t("otaSync.exportUrlHint")}</p>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setExportUrlDialogConn(null)}>
                  {t("otaSync.close")}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}

        {/* Log Detail Modal */}
        {selectedLog && (
          <Dialog open={Boolean(selectedLog)} onOpenChange={(open) => !open && setSelectedLog(null)}>
            <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle className="flex items-center space-x-2">
                  <span>{t("otaSync.logModalTitle")}</span>
                  <Badge variant={selectedLog.status === 'success' ? 'default' : 'destructive'} className="text-xs">
                    {selectedLog.status}
                  </Badge>
                </DialogTitle>
                <DialogDescription>
                  {t("otaSync.logModalDesc", {
                    provider: selectedLog.provider.toUpperCase(),
                    action: selectedLog.action,
                    direction: selectedLog.direction,
                    time: formatSyncTimestamp(selectedLog.created_at, t("otaSync.invalidDate")),
                  })}
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4 py-2">
                {selectedLog.error_message && (
                  <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive space-y-1">
                    <p className="font-semibold">{t("otaSync.errorMessageLabel")}</p>
                    <p className="font-mono text-xs whitespace-pre-wrap">{selectedLog.error_message}</p>
                  </div>
                )}

                <div className="space-y-1">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{t("otaSync.payloadLabel")}</p>
                  <pre className="rounded-md bg-muted p-3 font-mono text-xs overflow-x-auto max-h-48">
                    {JSON.stringify(selectedLog.payload || {}, null, 2)}
                  </pre>
                </div>

                <div className="space-y-1">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{t("otaSync.responseLabel")}</p>
                  <pre className="rounded-md bg-muted p-3 font-mono text-xs overflow-x-auto max-h-48">
                    {JSON.stringify(selectedLog.response || {}, null, 2)}
                  </pre>
                </div>
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => setSelectedLog(null)}>
                  {t("otaSync.close")}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>
  );
}
