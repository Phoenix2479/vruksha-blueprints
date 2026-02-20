import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, Button, Input, Table, TableBody, TableCell, TableHead, TableHeader, TableRow, Dialog, DialogContent, DialogHeader, DialogTitle, Label } from "@shared/components/ui";
import { StatsCard, StatusBadge, DialogButtons } from "@shared/components/blocks";
import { Building, DollarSign, Percent, Users, MapPin, AlertTriangle, Plus, TrendingUp, CheckCircle } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { getProperties, getDashboard, getComparison, getAlerts, resolveAlert, createProperty, type Property, type Dashboard, type PropertyComparison, type Alert } from "../api";

type TabType = "overview" | "comparison" | "alerts";

export default function MultiPropertyPage() {
  const [activeTab, setActiveTab] = useState<TabType>("overview");
  const [showAddProperty, setShowAddProperty] = useState(false);
  const queryClient = useQueryClient();

  const { data: dashboard } = useQuery<Dashboard>({ queryKey: ["chain-dashboard"], queryFn: getDashboard });
  const { data: properties = [] } = useQuery<Property[]>({ queryKey: ["properties"], queryFn: getProperties });
  const { data: comparison = [] } = useQuery<PropertyComparison[]>({ queryKey: ["comparison"], queryFn: getComparison });
  const { data: alerts = [] } = useQuery<Alert[]>({ queryKey: ["alerts"], queryFn: getAlerts });

  const resolve = useMutation({
    mutationFn: resolveAlert,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["alerts"] }),
  });

  const tabs: { id: TabType; label: string; count?: number }[] = [
    { id: "overview", label: "Portfolio Overview" },
    { id: "comparison", label: "Property Comparison" },
    { id: "alerts", label: "Alerts", count: alerts.length },
  ];

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex justify-between items-center">
          <div><h1 className="text-2xl font-bold text-gray-900">Multi-Property Management</h1><p className="text-gray-500">Hotel chain central dashboard</p></div>
          <Button onClick={() => setShowAddProperty(true)}><Plus className="h-4 w-4 mr-2" /> Add Property</Button>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <StatsCard title="Properties" value={dashboard?.total_properties || 0} icon={Building} />
          <StatsCard title="Total Rooms" value={dashboard?.total_rooms || 0} icon={Building} />
          <StatsCard title="Portfolio Occ." value={`${dashboard?.portfolio_occupancy || 0}%`} icon={Percent} />
          <StatsCard title="Revenue MTD" value={`$${(dashboard?.revenue_mtd || 0).toLocaleString()}`} icon={DollarSign} />
          <StatsCard title="Arrivals Today" value={dashboard?.arrivals_today || 0} icon={Users} />
        </div>

        <div className="border-b"><div className="flex gap-4">{tabs.map((tab) => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`px-4 py-2 font-medium border-b-2 ${activeTab === tab.id ? "border-blue-600 text-blue-600" : "border-transparent text-gray-500"}`}>
            {tab.label}{tab.count !== undefined && tab.count > 0 && <span className="ml-2 px-2 py-0.5 text-xs rounded-full bg-red-100 text-red-700">{tab.count}</span>}
          </button>
        ))}</div></div>

        {activeTab === "overview" && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {properties.map((prop) => (
              <Card key={prop.id} className="hover:shadow-md transition-shadow cursor-pointer">
                <CardHeader className="pb-2">
                  <div className="flex justify-between items-start">
                    <div>
                      <CardTitle className="text-lg">{prop.name}</CardTitle>
                      <p className="text-sm text-gray-500 flex items-center gap-1"><MapPin className="h-3 w-3" />{prop.city}, {prop.country}</p>
                    </div>
                    <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded">{prop.code}</span>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div><p className="text-2xl font-bold">{prop.total_rooms || 0}</p><p className="text-xs text-gray-500">Rooms</p></div>
                    <div><p className="text-2xl font-bold">{prop.total_rooms ? Math.round(((prop.occupied_rooms || 0) / prop.total_rooms) * 100) : 0}%</p><p className="text-xs text-gray-500">Occupancy</p></div>
                    <div><p className="text-2xl font-bold text-green-600">${((prop.revenue_mtd || 0) / 1000).toFixed(0)}k</p><p className="text-xs text-gray-500">Revenue</p></div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {activeTab === "comparison" && (
          <div className="space-y-6">
            <Card>
              <CardHeader><CardTitle>Revenue Comparison</CardTitle></CardHeader>
              <CardContent>
                <div className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={comparison}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="name" />
                      <YAxis tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                      <Tooltip formatter={(v: number) => `$${v.toLocaleString()}`} />
                      <Legend />
                      <Bar dataKey="revenue_mtd" name="Revenue MTD" fill="#3b82f6" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
            <Card>
              <Table>
                <TableHeader><TableRow><TableHead>Property</TableHead><TableHead>City</TableHead><TableHead>Rooms</TableHead><TableHead>Occupancy</TableHead><TableHead>ADR</TableHead><TableHead>RevPAR</TableHead><TableHead>Revenue MTD</TableHead></TableRow></TableHeader>
                <TableBody>
                  {comparison.map((prop) => (
                    <TableRow key={prop.id}>
                      <TableCell className="font-medium">{prop.name}</TableCell>
                      <TableCell>{prop.city}</TableCell>
                      <TableCell>{prop.total_rooms}</TableCell>
                      <TableCell><span className={prop.occupancy >= 70 ? 'text-green-600' : prop.occupancy >= 50 ? 'text-yellow-600' : 'text-red-600'}>{prop.occupancy}%</span></TableCell>
                      <TableCell>${prop.adr}</TableCell>
                      <TableCell>${prop.revpar}</TableCell>
                      <TableCell className="font-semibold">${prop.revenue_mtd.toLocaleString()}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          </div>
        )}

        {activeTab === "alerts" && (
          <Card>
            <CardContent className="p-0">
              <div className="divide-y">
                {alerts.length > 0 ? alerts.map((alert) => (
                  <div key={alert.id} className="p-4 flex justify-between items-start">
                    <div className="flex gap-3">
                      <AlertTriangle className={`h-5 w-5 ${alert.severity === 'critical' ? 'text-red-500' : alert.severity === 'warning' ? 'text-yellow-500' : 'text-blue-500'}`} />
                      <div>
                        <h4 className="font-medium">{alert.title}</h4>
                        {alert.property_name && <p className="text-sm text-gray-500">{alert.property_name}</p>}
                        {alert.message && <p className="text-sm text-gray-600 mt-1">{alert.message}</p>}
                        <p className="text-xs text-gray-400 mt-1">{new Date(alert.created_at).toLocaleString()}</p>
                      </div>
                    </div>
                    <Button size="sm" variant="outline" onClick={() => resolve.mutate(alert.id)}><CheckCircle className="h-4 w-4 mr-1" />Resolve</Button>
                  </div>
                )) : <div className="p-8 text-center text-gray-500">No active alerts</div>}
              </div>
            </CardContent>
          </Card>
        )}

        <AddPropertyDialog open={showAddProperty} onClose={() => setShowAddProperty(false)} />
      </div>
    </div>
  );
}

function AddPropertyDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ code: '', name: '', type: 'hotel', city: '', country: '', phone: '', email: '' });

  const create = useMutation({
    mutationFn: () => createProperty(form),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["properties"] }); onClose(); },
  });

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader><DialogTitle>Add Property</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div><Label>Property Code *</Label><Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} placeholder="HTL001" /></div>
            <div><Label>Type</Label><select className="w-full border rounded-md px-3 py-2" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}><option value="hotel">Hotel</option><option value="resort">Resort</option><option value="boutique">Boutique</option></select></div>
          </div>
          <div><Label>Property Name *</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
          <div className="grid grid-cols-2 gap-4">
            <div><Label>City *</Label><Input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} /></div>
            <div><Label>Country *</Label><Input value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} /></div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div><Label>Phone</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
            <div><Label>Email</Label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
          </div>
          <DialogButtons onCancel={onClose} onConfirm={() => create.mutate()} confirmText="Add Property" loading={create.isPending} disabled={!form.code || !form.name || !form.city || !form.country} />
        </div>
      </DialogContent>
    </Dialog>
  );
}
