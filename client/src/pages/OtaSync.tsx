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

export default function OtaSync({ hotelId }: { hotelId: string }) {
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
      toast.success("OTA connection saved successfully");
      utils.channelManager.ota.listConnections.invalidate({ hotelId });
      utils.channelManager.ota.listLogs.invalidate({ hotelId });
      setAddDialogOpen(false);
      setNewProvider("");
      setNewImportUrl("");
    },
    onError: (err) => {
      toast.error("Failed to save OTA connection: " + err.message);
    }
  });

  const deleteMutation = trpc.channelManager.ota.deleteConnection.useMutation({
    onSuccess: () => {
      toast.success("OTA connection deleted");
      utils.channelManager.ota.listConnections.invalidate({ hotelId });
    },
    onError: (err) => {
      toast.error("Failed to delete OTA connection: " + err.message);
    }
  });

  const syncMutation = trpc.channelManager.ota.triggerSync.useMutation({
    onSuccess: (res, variables: any) => {
      toast.success(`Successfully synchronized ${variables.provider.toUpperCase()} (${(res as any).updatedItemCount ?? 0} items updated)`);
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

  const handleAddConnection = () => {
    if (!newProvider.trim()) {
      toast.error("Please enter a channel/OTA name");
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
    if (!window.confirm(`Are you sure you want to remove the connection for "${provider}"? This cannot be undone.`)) return;
    deleteMutation.mutate({ hotelId, provider });
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
              Manage iCal calendar import connections to keep availability synchronized across OTA channels.
            </p>
          </div>
        </div>

        <Tabs defaultValue="connections" className="space-y-6">
          <TabsList className="grid w-full grid-cols-2 max-w-md">
            <TabsTrigger value="connections">Channels &amp; iCal URLs</TabsTrigger>
            <TabsTrigger value="logs">Synchronization Logs</TabsTrigger>
          </TabsList>

          <TabsContent value="connections" className="space-y-4">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-base">Connected OTA Channels</CardTitle>
                    <CardDescription className="text-xs mt-1">
                      Each row is an iCal calendar connection. The channel name is free-text — enter any OTA name (e.g. Agoda, Booking.com, Airbnb, TripAdvisor).
                    </CardDescription>
                  </div>
                  <Button size="sm" onClick={() => setAddDialogOpen(true)}>
                    <PlusCircle className="h-4 w-4 mr-1.5" />
                    เพิ่มการเชื่อมต่อใหม่
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {!connections || connections.length === 0 ? (
                  <div className="text-center py-10 text-muted-foreground text-sm">
                    <Globe className="h-10 w-10 mx-auto mb-3 opacity-30" />
                    <p>ยังไม่มีการเชื่อมต่อ OTA</p>
                    <p className="text-xs mt-1">คลิก "เพิ่มการเชื่อมต่อใหม่" เพื่อเชื่อมต่อกับ OTA ที่ต้องการ</p>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>ชื่อปฏิทิน</TableHead>
                        <TableHead>ลิงค์ปฏิทิน (Import URL)</TableHead>
                        <TableHead className="whitespace-nowrap">เวลาซิงค์ล่าสุด</TableHead>
                        <TableHead>สถานะ</TableHead>
                        <TableHead className="text-right">ดำเนินการ</TableHead>
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
                                      title="View export URL"
                                    >
                                      <Link2 className="h-3 w-3" />
                                    </Button>
                                  )}
                                </div>
                              ) : (
                                <span className="text-xs text-muted-foreground italic">ยังไม่ได้ตั้งค่า</span>
                              )}
                            </TableCell>
                            <TableCell className="text-xs whitespace-nowrap text-muted-foreground">
                              {formatSyncTimestamp(conn.last_sync_at)}
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
                                  title={!conn.ical_import_url ? "Set an import URL first" : "Sync now"}
                                >
                                  {isSyncing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                                  <span className="ml-1">ซิงค์</span>
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-7 px-2 text-xs text-destructive hover:text-destructive hover:bg-destructive/10"
                                  disabled={isDeleting}
                                  onClick={() => handleDelete(conn.provider)}
                                >
                                  {isDeleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                                  <span className="ml-1">ลบ</span>
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

        {/* Add Connection Dialog */}
        <Dialog open={addDialogOpen} onOpenChange={(open) => { if (!open) { setAddDialogOpen(false); setNewProvider(""); setNewImportUrl(""); } }}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>เพิ่มการเชื่อมต่อ OTA ใหม่</DialogTitle>
              <DialogDescription>
                ตั้งชื่อ OTA หรือ Channel ที่ต้องการเชื่อมต่อ แล้วกรอก iCal Import URL จาก OTA นั้น
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label htmlFor="new-provider">ชื่อ Channel / OTA</Label>
                <Input
                  id="new-provider"
                  placeholder="เช่น Agoda, Booking.com, Airbnb, TripAdvisor..."
                  value={newProvider}
                  onChange={(e) => setNewProvider(e.target.value)}
                  autoFocus
                />
                <p className="text-xs text-muted-foreground">พิมพ์ชื่อได้อิสระ ไม่จำกัดเฉพาะ OTA ที่กำหนดไว้</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="new-import-url">iCal Import URL (จาก OTA มาหา Property)</Label>
                <Input
                  id="new-import-url"
                  placeholder="https://www.ota.com/calendar/export/..."
                  value={newImportUrl}
                  onChange={(e) => setNewImportUrl(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">คัดลอก URL ปฏิทินจากหน้า Channel Manager ของ OTA</p>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => { setAddDialogOpen(false); setNewProvider(""); setNewImportUrl(""); }}>
                ยกเลิก
              </Button>
              <Button onClick={handleAddConnection} disabled={upsertMutation.isPending || !newProvider.trim()}>
                {upsertMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : null}
                บันทึก
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Export URL Dialog */}
        {exportUrlDialogConn && (
          <Dialog open={Boolean(exportUrlDialogConn)} onOpenChange={(open) => !open && setExportUrlDialogConn(null)}>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>Export URL — {exportUrlDialogConn.provider}</DialogTitle>
                <DialogDescription>
                  URL ปฏิทินนี้ใช้ส่งข้อมูลจาก Property ไปยัง OTA (iCal Export)
                </DialogDescription>
              </DialogHeader>
              <div className="py-2">
                <Label className="text-xs font-medium">iCal Export URL (Property → OTA)</Label>
                <Input
                  readOnly
                  value={exportUrlDialogConn.ical_export_url || ''}
                  className="mt-2 bg-muted text-xs font-mono"
                  onClick={(e) => (e.target as HTMLInputElement).select()}
                />
                <p className="text-xs text-muted-foreground mt-2">คลิกที่ช่องด้านบนเพื่อเลือกและคัดลอก URL</p>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setExportUrlDialogConn(null)}>
                  ปิด
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
