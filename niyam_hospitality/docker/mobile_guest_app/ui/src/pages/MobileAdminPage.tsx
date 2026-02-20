import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, Button, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@shared/components/ui";
import { StatsCard, StatusBadge } from "@shared/components/blocks";
import { Smartphone, ShoppingBag, Bell, Key, DollarSign, Users, UtensilsCrossed, Sparkles, Car, Calendar } from "lucide-react";
import { getRoomServiceMenu, getGuestRequests, getServices, getStats, updateRequestStatus, type RoomServiceItem, type GuestRequest, type HotelService, type MobileStats } from "../api";

type TabType = "requests" | "menu" | "services";

export default function MobileAdminPage() {
  const [activeTab, setActiveTab] = useState<TabType>("requests");
  const queryClient = useQueryClient();

  const { data: stats } = useQuery<MobileStats>({ queryKey: ["mobile-stats"], queryFn: getStats });
  const { data: menu = [] } = useQuery<RoomServiceItem[]>({ queryKey: ["room-service-menu"], queryFn: getRoomServiceMenu });
  const { data: requests = [] } = useQuery<GuestRequest[]>({ queryKey: ["guest-requests"], queryFn: getGuestRequests });
  const { data: services = [] } = useQuery<HotelService[]>({ queryKey: ["hotel-services"], queryFn: getServices });

  const updateStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => updateRequestStatus(id, status),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["guest-requests"] }),
  });

  const tabs: { id: TabType; label: string; count?: number }[] = [
    { id: "requests", label: "Guest Requests", count: requests.filter(r => r.status === "pending").length },
    { id: "menu", label: "Room Service Menu", count: menu.filter(m => m.is_available).length },
    { id: "services", label: "Hotel Services", count: services.filter(s => s.is_active).length },
  ];

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        <div><h1 className="text-2xl font-bold text-gray-900">Mobile Guest App Admin</h1><p className="text-gray-500">Manage mobile app content and requests</p></div>

        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <StatsCard title="Active Users" value={stats?.active_users || 0} icon={Users} />
          <StatsCard title="Orders Today" value={stats?.orders_today || 0} icon={ShoppingBag} />
          <StatsCard title="Pending Requests" value={stats?.requests_pending || 0} icon={Bell} />
          <StatsCard title="Revenue Today" value={`$${stats?.revenue_today || 0}`} icon={DollarSign} />
          <StatsCard title="Digital Keys" value={stats?.digital_keys_active || 0} icon={Key} />
        </div>

        <div className="border-b"><div className="flex gap-4">{tabs.map((tab) => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`px-4 py-2 font-medium border-b-2 ${activeTab === tab.id ? "border-blue-600 text-blue-600" : "border-transparent text-gray-500"}`}>
            {tab.label}{tab.count !== undefined && <span className="ml-2 px-2 py-0.5 text-xs rounded-full bg-gray-100">{tab.count}</span>}
          </button>
        ))}</div></div>

        {activeTab === "requests" && (
          <Card>
            <Table>
              <TableHeader><TableRow><TableHead>Guest</TableHead><TableHead>Room</TableHead><TableHead>Type</TableHead><TableHead>Description</TableHead><TableHead>Time</TableHead><TableHead>Status</TableHead><TableHead></TableHead></TableRow></TableHeader>
              <TableBody>
                {requests.map((req) => (
                  <TableRow key={req.id}>
                    <TableCell className="font-medium">{req.guest_name}</TableCell>
                    <TableCell>{req.room_number}</TableCell>
                    <TableCell className="capitalize">{req.request_type.replace(/_/g, " ")}</TableCell>
                    <TableCell className="max-w-[200px] truncate">{req.description}</TableCell>
                    <TableCell className="text-sm text-gray-500">{new Date(req.created_at).toLocaleString()}</TableCell>
                    <TableCell><StatusBadge status={req.status} /></TableCell>
                    <TableCell>
                      {req.status === "pending" && (
                        <div className="flex gap-1">
                          <Button size="sm" variant="outline" onClick={() => updateStatus.mutate({ id: req.id, status: "in_progress" })}>Start</Button>
                          <Button size="sm" onClick={() => updateStatus.mutate({ id: req.id, status: "completed" })}>Complete</Button>
                        </div>
                      )}
                      {req.status === "in_progress" && <Button size="sm" onClick={() => updateStatus.mutate({ id: req.id, status: "completed" })}>Complete</Button>}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        )}

        {activeTab === "menu" && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {menu.map((item) => (
              <Card key={item.id}>
                <CardContent className="pt-4">
                  <div className="flex justify-between items-start mb-2">
                    <div><h3 className="font-semibold">{item.name}</h3><p className="text-sm text-gray-500">{item.category}</p></div>
                    <StatusBadge status={item.is_available ? "available" : "unavailable"} />
                  </div>
                  <p className="text-sm text-gray-600 mb-2 line-clamp-2">{item.description || "No description"}</p>
                  <div className="font-semibold text-lg">${item.price}</div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {activeTab === "services" && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {services.map((service) => {
              const icons: Record<string, typeof Sparkles> = { spa: Sparkles, dining: UtensilsCrossed, transport: Car, activities: Calendar };
              const Icon = icons[service.category] || Sparkles;
              return (
                <Card key={service.id}>
                  <CardContent className="pt-4">
                    <div className="flex items-start gap-3">
                      <div className="p-2 bg-blue-50 rounded-lg"><Icon className="h-5 w-5 text-blue-600" /></div>
                      <div className="flex-1">
                        <div className="flex justify-between items-start">
                          <h3 className="font-semibold">{service.name}</h3>
                          <StatusBadge status={service.is_active ? "active" : "inactive"} />
                        </div>
                        <p className="text-sm text-gray-500 capitalize">{service.category}</p>
                        <p className="text-sm text-gray-600 mt-1">{service.description || "No description"}</p>
                        <div className="flex justify-between items-center mt-2">
                          {service.price && <span className="font-medium">${service.price}</span>}
                          {service.booking_required && <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded">Booking Required</span>}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
