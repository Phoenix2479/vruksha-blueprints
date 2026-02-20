import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, Button, Input, Table, TableBody, TableCell, TableHead, TableHeader, TableRow, Dialog, DialogContent, DialogHeader, DialogTitle, Label } from "@shared/components/ui";
import { StatsCard, StatusBadge, DialogButtons } from "@shared/components/blocks";
import { Users, Building, DollarSign, Percent, Calendar, Plus, Search, CreditCard } from "lucide-react";
import { getAgents, getAgentBookings, getCommissions, getStats, createAgent, type Agent, type AgentBooking, type Commission, type AgentStats } from "../api";

type TabType = "agents" | "bookings" | "commissions";

export default function TravelAgentPage() {
  const [activeTab, setActiveTab] = useState<TabType>("agents");
  const [searchQuery, setSearchQuery] = useState("");
  const [showAddAgent, setShowAddAgent] = useState(false);

  const { data: stats } = useQuery<AgentStats>({ queryKey: ["agent-stats"], queryFn: getStats });
  const { data: agents = [] } = useQuery<Agent[]>({ queryKey: ["agents"], queryFn: getAgents });
  const { data: bookings = [] } = useQuery<AgentBooking[]>({ queryKey: ["agent-bookings"], queryFn: getAgentBookings });
  const { data: commissions = [] } = useQuery<Commission[]>({ queryKey: ["commissions"], queryFn: getCommissions });

  const tabs: { id: TabType; label: string; count?: number }[] = [
    { id: "agents", label: "Agents", count: agents.filter(a => a.status === "active").length },
    { id: "bookings", label: "Bookings" },
    { id: "commissions", label: "Commissions", count: commissions.filter(c => c.status === "pending").length },
  ];

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex justify-between items-center">
          <div><h1 className="text-2xl font-bold text-gray-900">Travel Agent Portal</h1><p className="text-gray-500">Manage travel agents and commissions</p></div>
          <Button onClick={() => setShowAddAgent(true)}><Plus className="h-4 w-4 mr-2" /> Add Agent</Button>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <StatsCard title="Total Agents" value={stats?.total_agents || 0} icon={Users} />
          <StatsCard title="Active Agents" value={stats?.active_agents || 0} icon={Building} />
          <StatsCard title="Bookings (Month)" value={stats?.bookings_month || 0} icon={Calendar} />
          <StatsCard title="Revenue (Month)" value={`$${(stats?.revenue_month || 0).toLocaleString()}`} icon={DollarSign} />
          <StatsCard title="Commissions Due" value={`$${(stats?.commissions_due || 0).toLocaleString()}`} icon={CreditCard} />
        </div>

        <div className="flex gap-4">
          <div className="relative flex-1 max-w-md"><Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" /><Input placeholder="Search..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-10" /></div>
        </div>

        <div className="border-b"><div className="flex gap-4">{tabs.map((tab) => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`px-4 py-2 font-medium border-b-2 ${activeTab === tab.id ? "border-blue-600 text-blue-600" : "border-transparent text-gray-500"}`}>
            {tab.label}{tab.count !== undefined && <span className="ml-2 px-2 py-0.5 text-xs rounded-full bg-gray-100">{tab.count}</span>}
          </button>
        ))}</div></div>

        {activeTab === "agents" && <AgentsTab agents={agents} searchQuery={searchQuery} />}
        {activeTab === "bookings" && <BookingsTab bookings={bookings} searchQuery={searchQuery} />}
        {activeTab === "commissions" && <CommissionsTab commissions={commissions} />}

        <AddAgentDialog open={showAddAgent} onClose={() => setShowAddAgent(false)} />
      </div>
    </div>
  );
}

function AgentsTab({ agents, searchQuery }: { agents: Agent[]; searchQuery: string }) {
  const filtered = agents.filter(a => a.company_name.toLowerCase().includes(searchQuery.toLowerCase()) || a.agent_code.toLowerCase().includes(searchQuery.toLowerCase()));
  return (
    <Card>
      <Table>
        <TableHeader><TableRow><TableHead>Agent</TableHead><TableHead>Contact</TableHead><TableHead>Commission</TableHead><TableHead>Bookings</TableHead><TableHead>Revenue</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
        <TableBody>
          {filtered.map((agent) => (
            <TableRow key={agent.id}>
              <TableCell><div className="font-medium">{agent.company_name}</div><div className="text-sm text-gray-500">{agent.agent_code}</div></TableCell>
              <TableCell><div className="text-sm">{agent.contact_name || "-"}</div><div className="text-sm text-gray-500">{agent.email}</div></TableCell>
              <TableCell>{agent.commission_rate}%</TableCell>
              <TableCell>{agent.total_bookings}</TableCell>
              <TableCell>${agent.total_revenue.toLocaleString()}</TableCell>
              <TableCell><StatusBadge status={agent.status} /></TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  );
}

function BookingsTab({ bookings, searchQuery }: { bookings: AgentBooking[]; searchQuery: string }) {
  const filtered = bookings.filter(b => b.guest_name.toLowerCase().includes(searchQuery.toLowerCase()) || b.agent_name.toLowerCase().includes(searchQuery.toLowerCase()));
  return (
    <Card>
      <Table>
        <TableHeader><TableRow><TableHead>Agent</TableHead><TableHead>Guest</TableHead><TableHead>Room</TableHead><TableHead>Dates</TableHead><TableHead>Amount</TableHead><TableHead>Commission</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
        <TableBody>
          {filtered.map((b) => (
            <TableRow key={b.id}>
              <TableCell>{b.agent_name}</TableCell>
              <TableCell className="font-medium">{b.guest_name}</TableCell>
              <TableCell>{b.room_type}</TableCell>
              <TableCell className="text-sm">{new Date(b.check_in).toLocaleDateString()} - {new Date(b.check_out).toLocaleDateString()}</TableCell>
              <TableCell>${b.amount}</TableCell>
              <TableCell className="text-green-600">${b.commission}</TableCell>
              <TableCell><StatusBadge status={b.status} /></TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  );
}

function CommissionsTab({ commissions }: { commissions: Commission[] }) {
  return (
    <Card>
      <Table>
        <TableHeader><TableRow><TableHead>Agent</TableHead><TableHead>Period</TableHead><TableHead>Bookings</TableHead><TableHead>Revenue</TableHead><TableHead>Commission</TableHead><TableHead>Status</TableHead><TableHead></TableHead></TableRow></TableHeader>
        <TableBody>
          {commissions.map((c) => (
            <TableRow key={c.id}>
              <TableCell className="font-medium">{c.agent_name}</TableCell>
              <TableCell>{c.period}</TableCell>
              <TableCell>{c.bookings_count}</TableCell>
              <TableCell>${c.total_revenue.toLocaleString()}</TableCell>
              <TableCell className="font-semibold text-green-600">${c.commission_amount.toLocaleString()}</TableCell>
              <TableCell><StatusBadge status={c.status} /></TableCell>
              <TableCell>{c.status === "pending" && <Button size="sm" variant="outline">Pay</Button>}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  );
}

function AddAgentDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ company_name: "", contact_name: "", email: "", phone: "", commission_rate: 10 });
  const create = useMutation({ mutationFn: () => createAgent(form), onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["agents"] }); onClose(); } });

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader><DialogTitle>Add Travel Agent</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div><Label>Company Name *</Label><Input value={form.company_name} onChange={(e) => setForm({ ...form, company_name: e.target.value })} /></div>
          <div><Label>Contact Name</Label><Input value={form.contact_name} onChange={(e) => setForm({ ...form, contact_name: e.target.value })} /></div>
          <div className="grid grid-cols-2 gap-4">
            <div><Label>Email *</Label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
            <div><Label>Phone</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
          </div>
          <div><Label>Commission Rate (%)</Label><Input type="number" value={form.commission_rate} onChange={(e) => setForm({ ...form, commission_rate: Number(e.target.value) })} /></div>
          <DialogButtons onCancel={onClose} onConfirm={() => create.mutate()} confirmText="Add Agent" loading={create.isPending} disabled={!form.company_name || !form.email} />
        </div>
      </DialogContent>
    </Dialog>
  );
}
