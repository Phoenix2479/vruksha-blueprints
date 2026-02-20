import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, Button, Input, Table, TableBody, TableCell, TableHead, TableHeader, TableRow, Dialog, DialogContent, DialogHeader, DialogTitle, Label, Tabs, TabsList, TabsTrigger, TabsContent, Badge } from "@shared/components/ui";
import { StatsCard, StatusBadge, DialogButtons } from "@shared/components/blocks";
import { Users, UserPlus, Target, Mail, TrendingUp, Star, Phone, Building, Search, Plus, Filter, MoreVertical, Send } from "lucide-react";
import { getSegments, getLeads, getCampaigns, getStats, getRecentInteractions, createLead, createCampaign, updateLeadStatus, type Segment, type Lead, type Campaign, type GuestInteraction, type CRMStats } from "../api";
import { spacing, getStatusColor } from "@shared/styles/spacing";

type TabType = "segments" | "leads" | "campaigns" | "interactions";

export default function CRMPage() {
  const [activeTab, setActiveTab] = useState<TabType>("segments");
  const [searchQuery, setSearchQuery] = useState("");
  const [showAddLead, setShowAddLead] = useState(false);
  const [showAddCampaign, setShowAddCampaign] = useState(false);
  const queryClient = useQueryClient();

  const { data: stats } = useQuery<CRMStats>({ queryKey: ["crm-stats"], queryFn: getStats });
  const { data: segments = [] } = useQuery<Segment[]>({ queryKey: ["segments"], queryFn: getSegments });
  const { data: leads = [] } = useQuery<Lead[]>({ queryKey: ["leads"], queryFn: () => getLeads() });
  const { data: campaigns = [] } = useQuery<Campaign[]>({ queryKey: ["campaigns"], queryFn: getCampaigns });
  const { data: interactions = [] } = useQuery<GuestInteraction[]>({ queryKey: ["interactions"], queryFn: getRecentInteractions });

  const tabs: { id: TabType; label: string; count?: number }[] = [
    { id: "segments", label: "Segments", count: segments.length },
    { id: "leads", label: "Leads", count: leads.filter(l => l.status !== "converted" && l.status !== "lost").length },
    { id: "campaigns", label: "Campaigns", count: campaigns.length },
    { id: "interactions", label: "Activity" },
  ];

  return (
    <div className="min-h-screen bg-background">
      <header className={`border-b bg-card ${spacing.header}`}>
        <div className="flex items-center justify-between max-w-7xl mx-auto">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-purple-100 rounded-lg">
              <Users className="h-6 w-6 text-purple-600" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight">Guest CRM</h1>
              <p className="text-sm text-muted-foreground">Manage guest relationships and campaigns</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setShowAddLead(true)}>
              <UserPlus className="h-4 w-4 mr-2" /> Add Lead
            </Button>
            <Button size="sm" onClick={() => setShowAddCampaign(true)}>
              <Mail className="h-4 w-4 mr-2" /> New Campaign
            </Button>
          </div>
        </div>
      </header>

      <main className={`max-w-7xl mx-auto ${spacing.page} ${spacing.section}`}>
        {/* Stats */}
        <div className={`grid grid-cols-2 md:grid-cols-6 ${spacing.cardGap}`}>
          <StatsCard title="Total Guests" value={stats?.total_guests || 0} icon={Users} iconColor="text-blue-600" iconBg="bg-blue-100" />
          <StatsCard title="VIP Guests" value={stats?.vip_guests || 0} icon={Star} iconColor="text-amber-600" iconBg="bg-amber-100" trend={{ value: 5, isPositive: true }} />
          <StatsCard title="Repeat Guests" value={stats?.repeat_guests || 0} icon={TrendingUp} iconColor="text-green-600" iconBg="bg-green-100" />
          <StatsCard title="New This Month" value={stats?.new_guests_month || 0} icon={UserPlus} iconColor="text-purple-600" iconBg="bg-purple-100" />
          <StatsCard title="Active Campaigns" value={stats?.active_campaigns || 0} icon={Mail} iconColor="text-cyan-600" iconBg="bg-cyan-100" />
          <StatsCard title="Open Leads" value={stats?.open_leads || 0} icon={Target} iconColor="text-orange-600" iconBg="bg-orange-100" />
        </div>

        {/* Tabs + Search */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as TabType)}>
            <TabsList>
              {tabs.map((tab) => (
                <TabsTrigger key={tab.id} value={tab.id} className="gap-1.5">
                  {tab.label}
                  {tab.count !== undefined && (
                    <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-[10px]">{tab.count}</Badge>
                  )}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
          <div className="relative w-full md:w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>

        {/* Content */}
        {activeTab === "segments" && <SegmentsTab segments={segments} searchQuery={searchQuery} />}
        {activeTab === "leads" && <LeadsTab leads={leads} searchQuery={searchQuery} />}
        {activeTab === "campaigns" && <CampaignsTab campaigns={campaigns} segments={segments} searchQuery={searchQuery} />}
        {activeTab === "interactions" && <InteractionsTab interactions={interactions} searchQuery={searchQuery} />}

        {/* Add Lead Dialog */}
        <AddLeadDialog open={showAddLead} onClose={() => setShowAddLead(false)} />
        
        {/* Add Campaign Dialog */}
        <AddCampaignDialog open={showAddCampaign} onClose={() => setShowAddCampaign(false)} segments={segments} />
      </main>
    </div>
  );
}

function SegmentsTab({ segments, searchQuery }: { segments: Segment[]; searchQuery: string }) {
  const filtered = segments.filter(s => 
    s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    s.code.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {filtered.map((segment) => (
        <Card key={segment.id} className="hover:shadow-md transition-shadow">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: segment.color || "#6366f1" }} />
                <CardTitle className="text-lg">{segment.name}</CardTitle>
              </div>
              <StatusBadge status={segment.auto_assign ? "active" : "pending"} />
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-gray-500 mb-3">{segment.description || "No description"}</p>
            <div className="flex justify-between items-center text-sm">
              <span className="text-gray-500">Guests</span>
              <span className="font-semibold">{segment.guest_count || 0}</span>
            </div>
            <div className="flex justify-between items-center text-sm mt-1">
              <span className="text-gray-500">Priority</span>
              <span className="font-semibold">{segment.priority}</span>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function LeadsTab({ leads, searchQuery }: { leads: Lead[]; searchQuery: string }) {
  const queryClient = useQueryClient();
  const updateStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => updateLeadStatus(id, status),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["leads"] }),
  });

  const filtered = leads.filter(l =>
    l.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    l.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    l.company?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const statusColors: Record<string, string> = {
    new: "bg-blue-100 text-blue-800",
    contacted: "bg-yellow-100 text-yellow-800",
    qualified: "bg-green-100 text-green-800",
    converted: "bg-emerald-100 text-emerald-800",
    lost: "bg-red-100 text-red-800",
  };

  return (
    <Card>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Contact</TableHead>
            <TableHead>Company</TableHead>
            <TableHead>Source</TableHead>
            <TableHead>Score</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Created</TableHead>
            <TableHead></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filtered.map((lead) => (
            <TableRow key={lead.id}>
              <TableCell className="font-medium">{lead.name}</TableCell>
              <TableCell>
                <div className="text-sm">
                  {lead.email && <div className="flex items-center gap-1"><Mail className="h-3 w-3" />{lead.email}</div>}
                  {lead.phone && <div className="flex items-center gap-1"><Phone className="h-3 w-3" />{lead.phone}</div>}
                </div>
              </TableCell>
              <TableCell>{lead.company || "-"}</TableCell>
              <TableCell>{lead.source}</TableCell>
              <TableCell>
                <div className="flex items-center gap-1">
                  <div className={`w-2 h-2 rounded-full ${lead.score >= 70 ? "bg-green-500" : lead.score >= 40 ? "bg-yellow-500" : "bg-red-500"}`} />
                  {lead.score}
                </div>
              </TableCell>
              <TableCell>
                <span className={`px-2 py-1 rounded-full text-xs font-medium ${statusColors[lead.status] || "bg-gray-100"}`}>
                  {lead.status}
                </span>
              </TableCell>
              <TableCell className="text-gray-500 text-sm">
                {new Date(lead.created_at).toLocaleDateString()}
              </TableCell>
              <TableCell>
                <select
                  className="text-sm border rounded px-2 py-1"
                  value={lead.status}
                  onChange={(e) => updateStatus.mutate({ id: lead.id, status: e.target.value })}
                >
                  <option value="new">New</option>
                  <option value="contacted">Contacted</option>
                  <option value="qualified">Qualified</option>
                  <option value="converted">Converted</option>
                  <option value="lost">Lost</option>
                </select>
              </TableCell>
            </TableRow>
          ))}
          {filtered.length === 0 && (
            <TableRow>
              <TableCell colSpan={8} className="text-center py-8 text-gray-500">
                No leads found
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </Card>
  );
}

function CampaignsTab({ campaigns, segments, searchQuery }: { campaigns: Campaign[]; segments: Segment[]; searchQuery: string }) {
  const filtered = campaigns.filter(c =>
    c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.subject?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const statusColors: Record<string, string> = {
    draft: "bg-gray-100 text-gray-800",
    scheduled: "bg-blue-100 text-blue-800",
    sending: "bg-yellow-100 text-yellow-800",
    sent: "bg-green-100 text-green-800",
    paused: "bg-orange-100 text-orange-800",
  };

  return (
    <Card>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Campaign</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Segment</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Sent</TableHead>
            <TableHead>Open Rate</TableHead>
            <TableHead>Click Rate</TableHead>
            <TableHead>Scheduled</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filtered.map((campaign) => (
            <TableRow key={campaign.id}>
              <TableCell>
                <div>
                  <div className="font-medium">{campaign.name}</div>
                  {campaign.subject && <div className="text-sm text-gray-500">{campaign.subject}</div>}
                </div>
              </TableCell>
              <TableCell className="capitalize">{campaign.type}</TableCell>
              <TableCell>{campaign.segment_name || "All Guests"}</TableCell>
              <TableCell>
                <span className={`px-2 py-1 rounded-full text-xs font-medium ${statusColors[campaign.status] || "bg-gray-100"}`}>
                  {campaign.status}
                </span>
              </TableCell>
              <TableCell>{campaign.sent_count}</TableCell>
              <TableCell>{campaign.open_rate ? `${campaign.open_rate}%` : "-"}</TableCell>
              <TableCell>{campaign.click_rate ? `${campaign.click_rate}%` : "-"}</TableCell>
              <TableCell className="text-sm text-gray-500">
                {campaign.scheduled_at ? new Date(campaign.scheduled_at).toLocaleString() : "-"}
              </TableCell>
            </TableRow>
          ))}
          {filtered.length === 0 && (
            <TableRow>
              <TableCell colSpan={8} className="text-center py-8 text-gray-500">
                No campaigns found
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </Card>
  );
}

function InteractionsTab({ interactions, searchQuery }: { interactions: GuestInteraction[]; searchQuery: string }) {
  const filtered = interactions.filter(i =>
    i.guest_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    i.subject?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const typeIcons: Record<string, typeof Mail> = {
    email: Mail,
    call: Phone,
    meeting: Users,
    note: Target,
  };

  return (
    <Card>
      <CardContent className="p-0">
        <div className="divide-y">
          {filtered.map((interaction) => {
            const Icon = typeIcons[interaction.type] || Target;
            return (
              <div key={interaction.id} className="p-4 hover:bg-gray-50">
                <div className="flex gap-4">
                  <div className="p-2 bg-gray-100 rounded-full h-fit">
                    <Icon className="h-4 w-4 text-gray-600" />
                  </div>
                  <div className="flex-1">
                    <div className="flex justify-between">
                      <div>
                        <span className="font-medium">{interaction.guest_name}</span>
                        <span className="text-gray-500 mx-2">-</span>
                        <span className="text-gray-600 capitalize">{interaction.type}</span>
                        {interaction.channel && (
                          <span className="text-gray-400 text-sm ml-2">via {interaction.channel}</span>
                        )}
                      </div>
                      <span className="text-sm text-gray-500">
                        {new Date(interaction.created_at).toLocaleString()}
                      </span>
                    </div>
                    {interaction.subject && (
                      <p className="font-medium text-sm mt-1">{interaction.subject}</p>
                    )}
                    {interaction.notes && (
                      <p className="text-sm text-gray-600 mt-1">{interaction.notes}</p>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
          {filtered.length === 0 && (
            <div className="p-8 text-center text-gray-500">No recent activity</div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function AddLeadDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ name: "", email: "", phone: "", company: "", source: "website", notes: "" });

  const create = useMutation({
    mutationFn: () => createLead(form),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["leads"] });
      onClose();
      setForm({ name: "", email: "", phone: "", company: "", source: "website", notes: "" });
    },
  });

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add New Lead</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Name *</Label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Email</Label>
              <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
            <div>
              <Label>Phone</Label>
              <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Company</Label>
              <Input value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} />
            </div>
            <div>
              <Label>Source</Label>
              <select
                className="w-full border rounded-md px-3 py-2"
                value={form.source}
                onChange={(e) => setForm({ ...form, source: e.target.value })}
              >
                <option value="website">Website</option>
                <option value="referral">Referral</option>
                <option value="walk_in">Walk-in</option>
                <option value="phone">Phone</option>
                <option value="event">Event</option>
                <option value="ota">OTA</option>
              </select>
            </div>
          </div>
          <div>
            <Label>Notes</Label>
            <textarea
              className="w-full border rounded-md px-3 py-2 min-h-[80px]"
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </div>
          <DialogButtons onCancel={onClose} onConfirm={() => create.mutate()} confirmText="Add Lead" isLoading={create.isPending} confirmDisabled={!form.name} />
        </div>
      </DialogContent>
    </Dialog>
  );
}

function AddCampaignDialog({ open, onClose, segments }: { open: boolean; onClose: () => void; segments: Segment[] }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ name: "", type: "email", segment_id: "", subject: "", scheduled_at: "" });

  const create = useMutation({
    mutationFn: () => createCampaign(form),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["campaigns"] });
      onClose();
      setForm({ name: "", type: "email", segment_id: "", subject: "", scheduled_at: "" });
    },
  });

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create Campaign</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Campaign Name *</Label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Type</Label>
              <select
                className="w-full border rounded-md px-3 py-2"
                value={form.type}
                onChange={(e) => setForm({ ...form, type: e.target.value })}
              >
                <option value="email">Email</option>
                <option value="sms">SMS</option>
                <option value="whatsapp">WhatsApp</option>
              </select>
            </div>
            <div>
              <Label>Target Segment</Label>
              <select
                className="w-full border rounded-md px-3 py-2"
                value={form.segment_id}
                onChange={(e) => setForm({ ...form, segment_id: e.target.value })}
              >
                <option value="">All Guests</option>
                {segments.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
          </div>
          <div>
            <Label>Subject</Label>
            <Input value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} />
          </div>
          <div>
            <Label>Schedule (optional)</Label>
            <Input type="datetime-local" value={form.scheduled_at} onChange={(e) => setForm({ ...form, scheduled_at: e.target.value })} />
          </div>
          <DialogButtons onCancel={onClose} onConfirm={() => create.mutate()} confirmText="Create Campaign" isLoading={create.isPending} confirmDisabled={!form.name} />
        </div>
      </DialogContent>
    </Dialog>
  );
}
