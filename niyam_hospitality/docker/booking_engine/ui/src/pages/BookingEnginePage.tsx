import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, Button, Input, Table, TableBody, TableCell, TableHead, TableHeader, TableRow, Dialog, DialogContent, DialogHeader, DialogTitle, Label } from "@shared/components/ui";
import { StatsCard, StatusBadge, DialogButtons } from "@shared/components/blocks";
import { Globe, DollarSign, Percent, Tag, Settings, Calendar, TrendingUp, Plus, Copy, Code } from "lucide-react";
import { getRoomTypes, getPromoCodes, getWidgetConfig, getStats, createPromoCode, updateWidgetConfig, type RoomType, type PromoCode, type WidgetConfig, type BookingStats } from "../api";

type TabType = "overview" | "rooms" | "promos" | "widget";

export default function BookingEnginePage() {
  const [activeTab, setActiveTab] = useState<TabType>("overview");
  const [showAddPromo, setShowAddPromo] = useState(false);

  const { data: stats } = useQuery<BookingStats>({ queryKey: ["booking-stats"], queryFn: getStats });
  const { data: roomTypes = [] } = useQuery<RoomType[]>({ queryKey: ["room-types"], queryFn: getRoomTypes });
  const { data: promoCodes = [] } = useQuery<PromoCode[]>({ queryKey: ["promo-codes"], queryFn: getPromoCodes });
  const { data: widgetConfig } = useQuery<WidgetConfig>({ queryKey: ["widget-config"], queryFn: getWidgetConfig });

  const tabs: { id: TabType; label: string }[] = [
    { id: "overview", label: "Overview" },
    { id: "rooms", label: "Room Types" },
    { id: "promos", label: "Promo Codes" },
    { id: "widget", label: "Widget Settings" },
  ];

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Booking Engine</h1>
            <p className="text-gray-500">Manage direct bookings and widget</p>
          </div>
          <Button onClick={() => setShowAddPromo(true)}><Plus className="h-4 w-4 mr-2" /> Add Promo Code</Button>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <StatsCard title="Today's Bookings" value={stats?.bookings_today || 0} icon={Calendar} />
          <StatsCard title="Month Bookings" value={stats?.bookings_month || 0} icon={TrendingUp} />
          <StatsCard title="Month Revenue" value={`$${(stats?.revenue_month || 0).toLocaleString()}`} icon={DollarSign} />
          <StatsCard title="Conversion Rate" value={`${stats?.conversion_rate || 0}%`} icon={Percent} />
          <StatsCard title="Avg Booking" value={`$${stats?.avg_booking_value || 0}`} icon={DollarSign} />
        </div>

        <div className="border-b">
          <div className="flex gap-4">
            {tabs.map((tab) => (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`px-4 py-2 font-medium border-b-2 ${activeTab === tab.id ? "border-blue-600 text-blue-600" : "border-transparent text-gray-500"}`}>
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {activeTab === "overview" && <OverviewTab stats={stats} roomTypes={roomTypes} />}
        {activeTab === "rooms" && <RoomTypesTab roomTypes={roomTypes} />}
        {activeTab === "promos" && <PromoCodesTab promoCodes={promoCodes} />}
        {activeTab === "widget" && <WidgetTab config={widgetConfig} />}

        <AddPromoDialog open={showAddPromo} onClose={() => setShowAddPromo(false)} />
      </div>
    </div>
  );
}

function OverviewTab({ stats, roomTypes }: { stats?: BookingStats; roomTypes: RoomType[] }) {
  const embedCode = `<script src="https://booking.yourhotel.com/widget.js" data-hotel="YOUR_HOTEL_ID"></script>`;
  
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <Card>
        <CardHeader><CardTitle>Quick Actions</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <Button className="w-full justify-start" variant="outline"><Globe className="h-4 w-4 mr-2" /> Preview Booking Widget</Button>
          <Button className="w-full justify-start" variant="outline"><Settings className="h-4 w-4 mr-2" /> Configure Settings</Button>
          <Button className="w-full justify-start" variant="outline"><Tag className="h-4 w-4 mr-2" /> Manage Promo Codes</Button>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Embed Code</CardTitle></CardHeader>
        <CardContent>
          <div className="bg-gray-900 text-green-400 p-4 rounded-lg font-mono text-sm overflow-x-auto">
            {embedCode}
          </div>
          <Button className="mt-3" variant="outline" onClick={() => navigator.clipboard.writeText(embedCode)}>
            <Copy className="h-4 w-4 mr-2" /> Copy Code
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

function RoomTypesTab({ roomTypes }: { roomTypes: RoomType[] }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {roomTypes.map((room) => (
        <Card key={room.id}>
          <div className="h-32 bg-gray-200 rounded-t-lg flex items-center justify-center">
            {room.images[0] ? <img src={room.images[0]} alt={room.name} className="h-full w-full object-cover rounded-t-lg" /> : <span className="text-gray-400">No Image</span>}
          </div>
          <CardContent className="pt-4">
            <div className="flex justify-between items-start mb-2">
              <div><h3 className="font-semibold">{room.name}</h3><p className="text-sm text-gray-500">{room.code}</p></div>
              <StatusBadge status={room.is_active ? "active" : "inactive"} />
            </div>
            <p className="text-sm text-gray-600 mb-3 line-clamp-2">{room.description || "No description"}</p>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Base Rate</span>
              <span className="font-semibold">${room.base_price}/night</span>
            </div>
            <div className="flex justify-between text-sm mt-1">
              <span className="text-gray-500">Max Occupancy</span>
              <span>{room.max_occupancy} guests</span>
            </div>
            {room.amenities.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-3">
                {room.amenities.slice(0, 3).map((a, i) => <span key={i} className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded">{a}</span>)}
                {room.amenities.length > 3 && <span className="text-xs text-gray-400">+{room.amenities.length - 3}</span>}
              </div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function PromoCodesTab({ promoCodes }: { promoCodes: PromoCode[] }) {
  return (
    <Card>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Code</TableHead>
            <TableHead>Name</TableHead>
            <TableHead>Discount</TableHead>
            <TableHead>Valid Period</TableHead>
            <TableHead>Usage</TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {promoCodes.map((promo) => (
            <TableRow key={promo.id}>
              <TableCell className="font-mono font-medium">{promo.code}</TableCell>
              <TableCell>{promo.name || "-"}</TableCell>
              <TableCell>{promo.discount_type === "percentage" ? `${promo.discount_value}%` : `$${promo.discount_value}`}</TableCell>
              <TableCell className="text-sm">{promo.valid_from && promo.valid_to ? `${new Date(promo.valid_from).toLocaleDateString()} - ${new Date(promo.valid_to).toLocaleDateString()}` : "No limit"}</TableCell>
              <TableCell>{promo.max_uses ? `${promo.current_uses}/${promo.max_uses}` : promo.current_uses}</TableCell>
              <TableCell><StatusBadge status={promo.is_active ? "active" : "inactive"} /></TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  );
}

function WidgetTab({ config }: { config?: WidgetConfig }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState(config || { theme_color: "#3b82f6", show_rates: true, min_advance_days: 0, max_advance_days: 365, currencies: ["USD"], languages: ["en"] });
  
  const update = useMutation({
    mutationFn: () => updateWidgetConfig(form),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["widget-config"] }),
  });

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <Card>
        <CardHeader><CardTitle>Widget Configuration</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div><Label>Theme Color</Label><Input type="color" value={form.theme_color} onChange={(e) => setForm({ ...form, theme_color: e.target.value })} /></div>
          <div><Label>Min Advance Days</Label><Input type="number" value={form.min_advance_days} onChange={(e) => setForm({ ...form, min_advance_days: Number(e.target.value) })} /></div>
          <div><Label>Max Advance Days</Label><Input type="number" value={form.max_advance_days} onChange={(e) => setForm({ ...form, max_advance_days: Number(e.target.value) })} /></div>
          <div className="flex items-center gap-2">
            <input type="checkbox" checked={form.show_rates} onChange={(e) => setForm({ ...form, show_rates: e.target.checked })} />
            <Label>Show Rates on Widget</Label>
          </div>
          <Button onClick={() => update.mutate()}>Save Settings</Button>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Widget Preview</CardTitle></CardHeader>
        <CardContent>
          <div className="border rounded-lg p-4" style={{ borderColor: form.theme_color }}>
            <div className="text-center mb-4" style={{ color: form.theme_color }}><h3 className="font-semibold">Book Your Stay</h3></div>
            <div className="space-y-3">
              <Input placeholder="Check-in Date" />
              <Input placeholder="Check-out Date" />
              <Input placeholder="Guests" />
              <Button className="w-full" style={{ backgroundColor: form.theme_color }}>Search Availability</Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function AddPromoDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ code: "", name: "", discount_type: "percentage", discount_value: 10, valid_from: "", valid_to: "", max_uses: "" });
  
  const create = useMutation({
    mutationFn: () => createPromoCode({ ...form, max_uses: form.max_uses ? Number(form.max_uses) : undefined }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["promo-codes"] }); onClose(); },
  });

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader><DialogTitle>Create Promo Code</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div><Label>Code *</Label><Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} placeholder="SUMMER20" /></div>
            <div><Label>Name</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div><Label>Type</Label><select className="w-full border rounded-md px-3 py-2" value={form.discount_type} onChange={(e) => setForm({ ...form, discount_type: e.target.value })}><option value="percentage">Percentage</option><option value="fixed">Fixed Amount</option></select></div>
            <div><Label>Value</Label><Input type="number" value={form.discount_value} onChange={(e) => setForm({ ...form, discount_value: Number(e.target.value) })} /></div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div><Label>Valid From</Label><Input type="date" value={form.valid_from} onChange={(e) => setForm({ ...form, valid_from: e.target.value })} /></div>
            <div><Label>Valid To</Label><Input type="date" value={form.valid_to} onChange={(e) => setForm({ ...form, valid_to: e.target.value })} /></div>
          </div>
          <div><Label>Max Uses (empty = unlimited)</Label><Input type="number" value={form.max_uses} onChange={(e) => setForm({ ...form, max_uses: e.target.value })} /></div>
          <DialogButtons onCancel={onClose} onConfirm={() => create.mutate()} confirmText="Create" loading={create.isPending} disabled={!form.code} />
        </div>
      </DialogContent>
    </Dialog>
  );
}
