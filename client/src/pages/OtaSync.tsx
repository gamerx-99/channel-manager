import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, RefreshCw, CheckCircle2, AlertCircle, Link2, Globe } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { PageState } from "@/components/PageState";

function formatSyncTimestamp(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "วันที่ไม่ถูกต้อง";
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

const PROVIDERS = [
  { id: 'agoda', name: 'Agoda (iCal Calendar Sync)', desc: 'Sync availability and calendar events via iCal import/export with Agoda' },
  { id: 'booking', name: 'Booking.com (iCal Calendar Sync)', desc: 'Sync availability and calendar events via iCal import/export with Booking.com' },
  { id: 'expedia', name: 'Expedia (iCal Calendar Sync)', desc: 'Sync availability and calendar events via iCal import/export with Expedia' },
  { id: 'airbnb', name: 'Airbnb (iCal Calendar Sync)', desc: 'Sync availability and calendar events via iCal import/export with Airbnb' },
];

export default function OtaSync({ hotelId }: { hotelId: string }) {
  const utils = trpc.useUtils();
  const { data: connections, isLoading: loadingConn, error: connectionError, refetch: refetchConnections } = trpc.channelManager.ota.listConnections.useQuery({ hotelId });
  const { data: logs, isLoading: loadingLogs, error: logsError, refetch: refetchLogs } = trpc.channelManager.ota.listLogs.useQuery({ hotelId });

  const [icalUrls, setIcalUrls] = useState<Record<string, { importUrl: string; exportUrl: string }>>({});
  const [selectedLog, setSelectedLog] = useState<any | null>(null);

  const upsertMutation = trpc.channelManager.ota.upsertConnection.useMutation({
    onSuccess: () => {
      toast.success("OTA connection updated successfully");
      utils.channelManager.ota.listConnections.invalidate({ hotelId });
      utils.channelManager.ota.listLogs.invalidate({ hotelId });
    },
    onError: (err) => {
      toast.error("Failed to update OTA connection: " + err.message);
    }
  });

  const syncMutation = trpc.channelManager.ota.triggerSync.useMutation({
    onSuccess: (res, variables: any) => {
      toast.success(`Successfully synchronized ${variables.provider.toUpperCase()} (${(res as any).importedCount ?? 0} bookings imported)`);
      utils.channelManager.ota.listConnections.invalidate({ hotelId });
      utils.channelManager.ota.listLogs.invalidate({ hotelId });
    },
    onError: (err: any, variables: any) => {
      toast.error(`Sync failed for ${variables.provider.toUpperCase()}: ${err.message}`, {
        action: {
          label: "Retry",
          onClick: () => syncMutation.mutate({ hotelId, provider: variables.provider })
        }
      });
    }
  });

  const handleSave = (provider: string) => {
    const data = icalUrls[provider];
    upsertMutation.mutate({
      hotelId,
      provider,
      status: 'active',
      icalImportUrl: data?.importUrl || '',
      icalExportUrl: data?.exportUrl || '',
    });
  };

  const isLoading = loadingConn || loadingLogs;
  const error = connectionError || logsError;

  if (isLoading) {
    return <div className="p-8 text-center text-muted-foreground">Loading OTA synchronization settings...</div>;
  }

  if (error) {
    return (
      <div className="p-8 text-center">
        <p className="text-destructive mb-2">Error loading OTA settings: {error.message}</p>
        <button onClick={() => { refetchConnections(); refetchLogs(); }} className="px-4 py-2 bg-primary text-primary-foreground rounded">Retry</button>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-12">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b pb-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">OTA iCal Synchronization</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Manage iCal calendar import and export connections to keep availability synchronized across OTA channels.
            </p>
          </div>
        </div>

        <Tabs defaultValue="connections" className="space-y-6">
          <TabsList className="grid w-full grid-cols-2 max-w-md">
            <TabsTrigger value="connections">Channels & iCal URLs</TabsTrigger>
            <TabsTrigger value="logs">Synchronization Logs</TabsTrigger>
          </TabsList>

          <TabsContent value="connections" className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {PROVIDERS.map((provider) => {
                const conn = connections?.find((c: any) => c.provider === provider.id);
                const isSyncing = syncMutation.isPending && syncMutation.variables?.provider === provider.id;
                const currentUrls = icalUrls[provider.id] || {
                  importUrl: (conn as any)?.import_url || '',
                  exportUrl: (conn as any)?.export_url || '',
                };

                return (
                  <Card key={provider.id} className="flex flex-col justify-between">
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-lg flex items-center space-x-2">
                          <Globe className="h-5 w-5 text-primary" />
                          <span>{provider.name}</span>
                        </CardTitle>
                        <Badge variant={(conn as any)?.is_active && conn?.status === 'success' ? 'default' : conn?.status === 'error' ? 'destructive' : 'secondary'}>
                          {(conn as any)?.is_active ? (conn?.status || 'Active') : 'Inactive'}
                        </Badge>
                      </div>
                      <CardDescription className="text-xs">{provider.desc}</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="space-y-2">
                        <Label className="text-xs font-medium">iCal Import URL (From OTA to Property)</Label>
                        <Input
                          placeholder="https://www.ota.com/calendar/export/..."
                          value={currentUrls.importUrl}
                          onChange={(e) => setIcalUrls({
                            ...icalUrls,
                            [provider.id]: { ...currentUrls, importUrl: e.target.value }
                          })}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-xs font-medium">iCal Export URL (Property to OTA)</Label>
                        <div className="flex items-center space-x-2">
                          <Input
                            readOnly
                            value={currentUrls.exportUrl || `https://api.channelmanager.local/ical/${hotelId}/${provider.id}.ics`}
                            className="bg-muted text-xs font-mono"
                          />
                        </div>
                      </div>
                      {conn?.last_sync_at && (
                        <p className="text-xs text-muted-foreground">
                          Last Synced: {formatSyncTimestamp((conn as any).last_sync_at)} • Bookings Imported: {(conn as any).imported_count || 0}
                        </p>
                      )}
                      {(conn as any)?.last_error_message && (
                        <p className="text-xs text-destructive bg-destructive/10 p-2 rounded">
                          Error: {(conn as any)?.last_error_message}
                        </p>
                      )}
                    </CardContent>
                    <CardFooter className="flex justify-between border-t pt-4 bg-muted/20">
                      <Button
                        size="sm"
                        variant="default"
                        disabled={isSyncing}
                        onClick={() => syncMutation.mutate({ hotelId, provider: provider.id })}
                      >
                        {isSyncing ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <RefreshCw className="h-4 w-4 mr-1.5" />}
                        Sync Now
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleSave(provider.id)}
                        disabled={upsertMutation.isPending}
                      >
                        Save Configuration
                      </Button>
                    </CardFooter>
                  </Card>
                );
              })}
            </div>
          </TabsContent>

          <TabsContent value="logs" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Synchronization Audit Logs</CardTitle>
                <CardDescription>History of iCal calendar sync runs and import results.</CardDescription>
              </CardHeader>
              <CardContent>
                {!logs || logs.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground text-sm">
                    No synchronization logs recorded yet. Run "Sync Now" on any channel to generate events.
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Time</TableHead>
                        <TableHead>Provider</TableHead>
                        <TableHead>Action</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Details</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {logs.map((log: any) => (
                        <TableRow key={log.id} className="cursor-pointer hover:bg-muted/50" onClick={() => setSelectedLog(log)}>
                          <TableCell className="text-xs whitespace-nowrap">{formatSyncTimestamp(log.created_at)}</TableCell>
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
                              ดูรายละเอียด
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

        {/* Log Detail Modal */}
        {selectedLog && (
          <Dialog open={Boolean(selectedLog)} onOpenChange={(open) => !open && setSelectedLog(null)}>
            <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle className="flex items-center space-x-2">
                  <span>Sync Log Details</span>
                  <Badge variant={selectedLog.status === 'success' ? 'default' : 'destructive'} className="text-xs">
                    {selectedLog.status}
                  </Badge>
                </DialogTitle>
                <DialogDescription>
                  {selectedLog.provider.toUpperCase()} • {selectedLog.action} ({selectedLog.direction}) • {formatSyncTimestamp(selectedLog.created_at)} น.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4 py-2">
                {selectedLog.error_message && (
                  <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive space-y-1">
                    <p className="font-semibold">Error Message:</p>
                    <p className="font-mono text-xs whitespace-pre-wrap">{selectedLog.error_message}</p>
                  </div>
                )}

                <div className="space-y-1">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Payload / Request Data</p>
                  <pre className="rounded-md bg-muted p-3 font-mono text-xs overflow-x-auto max-h-48">
                    {JSON.stringify(selectedLog.payload || {}, null, 2)}
                  </pre>
                </div>

                <div className="space-y-1">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Response / Result Data</p>
                  <pre className="rounded-md bg-muted p-3 font-mono text-xs overflow-x-auto max-h-48">
                    {JSON.stringify(selectedLog.response || {}, null, 2)}
                  </pre>
                </div>
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => setSelectedLog(null)}>
                  Close
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>
  );
}
