import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, Button, Input, Table, TableBody, TableCell, TableHead, TableHeader, TableRow, Dialog, DialogContent, DialogHeader, DialogTitle, Label } from "@shared/components/ui";
import { StatsCard, StatusBadge, DialogButtons } from "@shared/components/blocks";
import { Globe, DollarSign, RefreshCw, Link, Calendar, Clock, ArrowUpDown, Plus, CheckCircle, AlertTriangle } from "lucide-react";
import { getAvailableChannels, getConnections, getChannelBookings, getSyncLogs, getStats, createConnection, triggerSync, type Channel, type Connection, type ChannelBooking, type SyncLog, type ChannelStats } from "../api";

type TabType = "connections" | "bookings" | "logs";

export default function ChannelManagerPage() {
  const [activeTab, setActiveTab] = useState<TabType>("connections");
  const [showAddConnection, setShowAddConnection] = useState(false);
  const queryClient = useQueryClient();

  const { data: stats } = useQuery<ChannelStats>({ queryKey: ["channel-stats"], queryFn: getStats });
  const { data: channels = [] } = useQuery<Channel[]>({ queryKey: ["available-channels"], queryFn: getAvailableChannels });
  const { data: connections = [] } = useQuery<Connection[]>({ queryKey: ["connections"], queryFn: getConnections });
  const { data: bookings = [] } = useQuery<ChannelBooking[]>({ queryKey: ["channel-bookings"], queryFn: getChannelBookings });
  const { data: logs = [] } = useQuery<SyncLog[]>({ queryKey: ["sync-logs"], queryFn: getSyncLogs });

  const sync = useMutation({
    mutationFn: ({ ids, type }: { ids: string[]; type: 'push' | 'pull' }) => triggerSync(ids, type),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["sync-logs"] }),
  });

  const tabs: { id: TabType; label: string; count?: number }[] = [
    { id: "connections", label: "Connections", count: connections.filter(c => c.status === "active").length },
    { id: "bookings", label: "OTA Bookings", count: bookings.filter(b => b.status === "pending").length },
    { id: "logs", label: "Sync Logs" },
  ];

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex justify-between items-center">
          <div><h1 className="text-2xl font-bold text-gray-900">Channel Manager</h1><p className="text-gray-500">OTA & GDS integration hub</p></div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => sync.mutate({ ids: [], type: 'pull' })}><RefreshCw className="h-4 w-4 mr-2" /> Pull Bookings</Button>
            <Button onClick={() => setShowAddConnection(true)}><Plus className="h-4 w-4 mr-2" /> Connect Channel</Button>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
          <StatsCard title="Channels" value={stats?.total_channels || 0} icon={Globe} />
          <StatsCard title="Active" value={stats?.active_channels || 0} icon={CheckCircle} />
          <StatsCard title="Bookings (30d)" value={stats?.bookings_30d || 0} icon={Calendar} />
          <StatsCard title="Revenue (30d)" value={`$${(stats?.revenue_30d || 0).toLocaleString()}`} icon={DollarSign} />
          <StatsCard title="Commission" value={`$${(stats?.commission_30d || 0).toLocaleString()}`} icon={DollarSign} />
          <StatsCard title="Pending" value={stats?.pending_bookings || 0} icon={AlertTriangle} />
        </div>

        <div className="border-b"><div className="flex gap-4">{tabs.map((tab) => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`px-4 py-2 font-medium border-b-2 ${activeTab === tab.id ? "border-blue-600 text-blue-600" : "border-transparent text-gray-500"}`}>
            {tab.label}{tab.count !== undefined && tab.count > 0 && <span className="ml-2 px-2 py-0.5 text-xs rounded-full bg-amber-100 text-amber-700">{tab.count}</span>}
          </button>
        ))}</div></div>

        {activeTab === "connections" && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {connections.map((conn) => (
              <Card key={conn.id}>
                <CardHeader className="pb-2">
                  <div className="flex justify-between items-center">
                    <CardTitle className="text-lg">{conn.channel_name}</CardTitle>
                    <StatusBadge status={conn.status} />
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between"><span className="text-gray-500">Property ID</span><span>{conn.property_id || '-'}</span></div>
                    <div className="flex justify-between"><span className="text-gray-500">Bookings (30d)</span><span className="font-medium">{conn.bookings_30d || 0}</span></div>
                    <div className="flex justify-between"><span className="text-gray-500">Revenue (30d)</span><span className="font-medium">${(conn.revenue_30d || 0).toLocaleString()}</span></div>
                    {conn.last_sync_at && <div className="flex justify-between"><span className="text-gray-500">Last Sync</span><span className="text-xs">{new Date(conn.last_sync_at).toLocaleString()}</span></div>}
                  </div>
                  <div className="flex gap-2 mt-4">
                    <Button size="sm" variant="outline" className="flex-1" onClick={() => sync.mutate({ ids: [conn.id], type: 'push' })}><ArrowUpDown className="h-3 w-3 mr-1" />Sync</Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {activeTab === "bookings" && (
          <Card>
            <Table>
              <TableHeader><TableRow><TableHead>Channel</TableHead><TableHead>Booking ID</TableHead><TableHead>Guest</TableHead><TableHead>Room</TableHead><TableHead>Dates</TableHead><TableHead>Amount</TableHead><TableHead>Commission</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
              <TableBody>
                {bookings.map((b) => (
                  <TableRow key={b.id}>
                    <TableCell>{b.channel_name}</TableCell>
                    <TableCell className="font-mono text-xs">{b.channel_booking_id}</TableCell>
                    <TableCell className="font-medium">{b.guest_name}</TableCell>
                    <TableCell>{b.room_type}</TableCell>
                    <TableCell className="text-sm">{new Date(b.check_in).toLocaleDateString()} - {new Date(b.check_out).toLocaleDateString()}</TableCell>
                    <TableCell>${b.total_amount}</TableCell>
                    <TableCell className="text-red-600">${b.commission}</TableCell>
                    <TableCell><StatusBadge status={b.status} /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        )}

        {activeTab === "logs" && (
          <Card>
            <Table>
              <TableHeader><TableRow><TableHead>Time</TableHead><TableHead>Channel</TableHead><TableHead>Type</TableHead><TableHead>Direction</TableHead><TableHead>Records</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
              <TableBody>
                {logs.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell className="text-sm">{new Date(log.created_at).toLocaleString()}</TableCell>
                    <TableCell>{log.channel_name || 'All'}</TableCell>
                    <TableCell className="capitalize">{log.sync_type.replace(/_/g, ' ')}</TableCell>
                    <TableCell className="capitalize">{log.direction}</TableCell>
                    <TableCell>{log.records_processed}</TableCell>
                    <TableCell><StatusBadge status={log.status} /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        )}

        <AddConnectionDialog open={showAddConnection} onClose={() => setShowAddConnection(false)} channels={channels} />
      </div>
    </div>
  );
}

function AddConnectionDialog({ open, onClose, channels }: { open: boolean; onClose: () => void; channels: Channel[] }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ channel_code: '', api_key: '', api_secret: '', property_id: '' });
  const selected = channels.find(c => c.code === form.channel_code);

  const create = useMutation({
    mutationFn: () => createConnection({ ...form, channel_name: selected?.name }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["connections"] }); onClose(); },
  });

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader><DialogTitle>Connect Channel</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div><Label>Channel *</Label>
            <select className="w-full border rounded-md px-3 py-2" value={form.channel_code} onChange={(e) => setForm({ ...form, channel_code: e.target.value })}>
              <option value="">Select channel...</option>
              {channels.map(c => <option key={c.code} value={c.code}>{c.name} ({c.type})</option>)}
            </select>
          </div>
          <div><Label>API Key</Label><Input value={form.api_key} onChange={(e) => setForm({ ...form, api_key: e.target.value })} /></div>
          <div><Label>API Secret</Label><Input type="password" value={form.api_secret} onChange={(e) => setForm({ ...form, api_secret: e.target.value })} /></div>
          <div><Label>Property ID (from OTA)</Label><Input value={form.property_id} onChange={(e) => setForm({ ...form, property_id: e.target.value })} /></div>
          <DialogButtons onCancel={onClose} onConfirm={() => create.mutate()} confirmText="Connect" loading={create.isPending} disabled={!form.channel_code} />
        </div>
      </DialogContent>
    </Dialog>
  );
}
