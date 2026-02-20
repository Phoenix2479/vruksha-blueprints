import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, Button, Input, Table, TableBody, TableCell, TableHead, TableHeader, TableRow, Dialog, DialogContent, DialogHeader, DialogTitle, Label } from "@shared/components/ui";
import { StatsCard, StatusBadge, DialogButtons } from "@shared/components/blocks";
import { MessageSquare, Mail, Phone, Zap, FileText, Send, Clock, CheckCircle, XCircle, Search, Plus, ToggleLeft, ToggleRight } from "lucide-react";
import { getTemplates, getAutomations, getMessages, getStats, createTemplate, toggleAutomation, type Template, type Automation, type Message, type MessagingStats } from "../api";

type TabType = "templates" | "automations" | "history";

export default function MessagingPage() {
  const [activeTab, setActiveTab] = useState<TabType>("templates");
  const [searchQuery, setSearchQuery] = useState("");
  const [showAddTemplate, setShowAddTemplate] = useState(false);
  const queryClient = useQueryClient();

  const { data: stats } = useQuery<MessagingStats>({ queryKey: ["messaging-stats"], queryFn: getStats });
  const { data: templates = [] } = useQuery<Template[]>({ queryKey: ["templates"], queryFn: getTemplates });
  const { data: automations = [] } = useQuery<Automation[]>({ queryKey: ["automations"], queryFn: getAutomations });
  const { data: messages = [] } = useQuery<Message[]>({ queryKey: ["messages"], queryFn: () => getMessages(50) });

  const tabs: { id: TabType; label: string; count?: number }[] = [
    { id: "templates", label: "Templates", count: templates.filter(t => t.is_active).length },
    { id: "automations", label: "Automations", count: automations.filter(a => a.is_active).length },
    { id: "history", label: "Message History" },
  ];

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Guest Messaging</h1>
            <p className="text-gray-500">Automated guest communication</p>
          </div>
          <Button onClick={() => setShowAddTemplate(true)}>
            <Plus className="h-4 w-4 mr-2" /> New Template
          </Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
          <StatsCard title="Today" value={stats?.messages_today || 0} icon={MessageSquare} />
          <StatsCard title="This Week" value={stats?.messages_week || 0} icon={Send} />
          <StatsCard title="Templates" value={stats?.active_templates || 0} icon={FileText} />
          <StatsCard title="Automations" value={stats?.active_automations || 0} icon={Zap} />
          <StatsCard title="Delivery Rate" value={`${stats?.delivery_rate || 0}%`} icon={CheckCircle} />
          <StatsCard title="Open Rate" value={`${stats?.open_rate || 0}%`} icon={Mail} />
        </div>

        {/* Tabs */}
        <div className="border-b">
          <div className="flex gap-4">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-4 py-2 font-medium border-b-2 transition-colors ${
                  activeTab === tab.id
                    ? "border-blue-600 text-blue-600"
                    : "border-transparent text-gray-500 hover:text-gray-700"
                }`}
              >
                {tab.label}
                {tab.count !== undefined && (
                  <span className="ml-2 px-2 py-0.5 text-xs rounded-full bg-gray-100">{tab.count}</span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Search */}
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Search..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>

        {/* Content */}
        {activeTab === "templates" && <TemplatesTab templates={templates} searchQuery={searchQuery} />}
        {activeTab === "automations" && <AutomationsTab automations={automations} searchQuery={searchQuery} />}
        {activeTab === "history" && <HistoryTab messages={messages} searchQuery={searchQuery} />}

        <AddTemplateDialog open={showAddTemplate} onClose={() => setShowAddTemplate(false)} />
      </div>
    </div>
  );
}

function TemplatesTab({ templates, searchQuery }: { templates: Template[]; searchQuery: string }) {
  const filtered = templates.filter(t =>
    t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    t.subject?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const channelIcons: Record<string, typeof Mail> = {
    email: Mail,
    sms: Phone,
    whatsapp: MessageSquare,
  };

  const categoryColors: Record<string, string> = {
    transactional: "bg-blue-100 text-blue-800",
    marketing: "bg-purple-100 text-purple-800",
    operational: "bg-green-100 text-green-800",
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {filtered.map((template) => {
        const Icon = channelIcons[template.channel] || MessageSquare;
        return (
          <Card key={template.id} className={`hover:shadow-md transition-shadow ${!template.is_active ? "opacity-60" : ""}`}>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Icon className="h-4 w-4 text-gray-500" />
                  <CardTitle className="text-base">{template.name}</CardTitle>
                </div>
                <StatusBadge status={template.is_active ? "active" : "inactive"} />
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex gap-2 mb-3">
                <span className={`px-2 py-0.5 text-xs rounded-full ${categoryColors[template.category] || "bg-gray-100"}`}>
                  {template.category}
                </span>
                {template.trigger_event && (
                  <span className="px-2 py-0.5 text-xs rounded-full bg-amber-100 text-amber-800">
                    {template.trigger_event.replace(/_/g, " ")}
                  </span>
                )}
              </div>
              {template.subject && (
                <p className="text-sm font-medium mb-2">{template.subject}</p>
              )}
              <p className="text-sm text-gray-500 line-clamp-2">{template.body}</p>
              {template.variables.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1">
                  {template.variables.slice(0, 3).map(v => (
                    <span key={v} className="text-xs bg-gray-100 px-1.5 py-0.5 rounded">{`{{${v}}}`}</span>
                  ))}
                  {template.variables.length > 3 && (
                    <span className="text-xs text-gray-400">+{template.variables.length - 3} more</span>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

function AutomationsTab({ automations, searchQuery }: { automations: Automation[]; searchQuery: string }) {
  const queryClient = useQueryClient();
  const toggle = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) => toggleAutomation(id, isActive),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["automations"] }),
  });

  const filtered = automations.filter(a =>
    a.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const channelIcons: Record<string, typeof Mail> = {
    email: Mail,
    sms: Phone,
    whatsapp: MessageSquare,
  };

  return (
    <Card>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Automation</TableHead>
            <TableHead>Trigger</TableHead>
            <TableHead>Channel</TableHead>
            <TableHead>Template</TableHead>
            <TableHead>Delay</TableHead>
            <TableHead>Sent</TableHead>
            <TableHead>Status</TableHead>
            <TableHead></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filtered.map((automation) => {
            const Icon = channelIcons[automation.channel] || MessageSquare;
            return (
              <TableRow key={automation.id}>
                <TableCell className="font-medium">{automation.name}</TableCell>
                <TableCell>
                  <span className="px-2 py-1 bg-amber-50 text-amber-700 rounded text-sm">
                    {automation.trigger_type.replace(/_/g, " ")}
                  </span>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-1">
                    <Icon className="h-4 w-4" />
                    <span className="capitalize">{automation.channel}</span>
                  </div>
                </TableCell>
                <TableCell>{automation.template_name || "-"}</TableCell>
                <TableCell>
                  {automation.delay_minutes > 0 ? (
                    <span className="flex items-center gap-1 text-gray-500">
                      <Clock className="h-3 w-3" />
                      {automation.delay_minutes}m
                    </span>
                  ) : "Immediate"}
                </TableCell>
                <TableCell>{automation.sent_count}</TableCell>
                <TableCell>
                  <StatusBadge status={automation.is_active ? "active" : "paused"} />
                </TableCell>
                <TableCell>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => toggle.mutate({ id: automation.id, isActive: !automation.is_active })}
                  >
                    {automation.is_active ? (
                      <ToggleRight className="h-5 w-5 text-green-600" />
                    ) : (
                      <ToggleLeft className="h-5 w-5 text-gray-400" />
                    )}
                  </Button>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </Card>
  );
}

function HistoryTab({ messages, searchQuery }: { messages: Message[]; searchQuery: string }) {
  const filtered = messages.filter(m =>
    m.guest_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    m.content.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const statusIcons: Record<string, { icon: typeof CheckCircle; color: string }> = {
    sent: { icon: CheckCircle, color: "text-green-500" },
    delivered: { icon: CheckCircle, color: "text-green-600" },
    read: { icon: CheckCircle, color: "text-blue-500" },
    failed: { icon: XCircle, color: "text-red-500" },
    pending: { icon: Clock, color: "text-yellow-500" },
  };

  const channelIcons: Record<string, typeof Mail> = {
    email: Mail,
    sms: Phone,
    whatsapp: MessageSquare,
  };

  return (
    <Card>
      <CardContent className="p-0">
        <div className="divide-y">
          {filtered.map((message) => {
            const ChannelIcon = channelIcons[message.channel] || MessageSquare;
            const StatusInfo = statusIcons[message.status] || statusIcons.pending;
            const StatusIcon = StatusInfo.icon;
            return (
              <div key={message.id} className="p-4 hover:bg-gray-50">
                <div className="flex gap-4">
                  <div className={`p-2 rounded-full h-fit ${message.direction === "outbound" ? "bg-blue-100" : "bg-gray-100"}`}>
                    <ChannelIcon className={`h-4 w-4 ${message.direction === "outbound" ? "text-blue-600" : "text-gray-600"}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-start">
                      <div>
                        <span className="font-medium">{message.guest_name}</span>
                        <span className="text-gray-400 mx-2">-</span>
                        <span className="text-gray-500 capitalize">{message.channel}</span>
                        <span className={`ml-2 text-xs ${message.direction === "outbound" ? "text-blue-500" : "text-green-500"}`}>
                          {message.direction === "outbound" ? "Sent" : "Received"}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <StatusIcon className={`h-4 w-4 ${StatusInfo.color}`} />
                        <span className="text-sm text-gray-500">
                          {new Date(message.sent_at || message.created_at).toLocaleString()}
                        </span>
                      </div>
                    </div>
                    {message.subject && (
                      <p className="font-medium text-sm mt-1">{message.subject}</p>
                    )}
                    <p className="text-sm text-gray-600 mt-1 line-clamp-2">{message.content}</p>
                  </div>
                </div>
              </div>
            );
          })}
          {filtered.length === 0 && (
            <div className="p-8 text-center text-gray-500">No messages found</div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function AddTemplateDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    name: "",
    channel: "email",
    category: "transactional",
    trigger_event: "",
    subject: "",
    body: "",
  });

  const create = useMutation({
    mutationFn: () => createTemplate({ ...form, variables: extractVariables(form.body) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["templates"] });
      onClose();
      setForm({ name: "", channel: "email", category: "transactional", trigger_event: "", subject: "", body: "" });
    },
  });

  const extractVariables = (text: string): string[] => {
    const matches = text.match(/\{\{(\w+)\}\}/g) || [];
    return [...new Set(matches.map(m => m.replace(/\{\{|\}\}/g, "")))];
  };

  const triggerEvents = [
    { value: "", label: "None (Manual)" },
    { value: "booking_confirmed", label: "Booking Confirmed" },
    { value: "pre_arrival", label: "Pre-Arrival" },
    { value: "check_in", label: "Check-in" },
    { value: "check_out", label: "Check-out" },
    { value: "post_stay", label: "Post Stay" },
  ];

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Create Message Template</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Template Name *</Label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <Label>Channel</Label>
              <select
                className="w-full border rounded-md px-3 py-2"
                value={form.channel}
                onChange={(e) => setForm({ ...form, channel: e.target.value })}
              >
                <option value="email">Email</option>
                <option value="sms">SMS</option>
                <option value="whatsapp">WhatsApp</option>
              </select>
            </div>
            <div>
              <Label>Category</Label>
              <select
                className="w-full border rounded-md px-3 py-2"
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
              >
                <option value="transactional">Transactional</option>
                <option value="marketing">Marketing</option>
                <option value="operational">Operational</option>
              </select>
            </div>
            <div>
              <Label>Trigger Event</Label>
              <select
                className="w-full border rounded-md px-3 py-2"
                value={form.trigger_event}
                onChange={(e) => setForm({ ...form, trigger_event: e.target.value })}
              >
                {triggerEvents.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
          </div>
          {form.channel === "email" && (
            <div>
              <Label>Subject</Label>
              <Input value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} placeholder="Use {{variable}} for dynamic content" />
            </div>
          )}
          <div>
            <Label>Message Body *</Label>
            <textarea
              className="w-full border rounded-md px-3 py-2 min-h-[150px] font-mono text-sm"
              value={form.body}
              onChange={(e) => setForm({ ...form, body: e.target.value })}
              placeholder="Use {{guest_name}}, {{room_number}}, {{check_in_date}}, etc."
            />
            <p className="text-xs text-gray-500 mt-1">
              Variables detected: {extractVariables(form.body).join(", ") || "none"}
            </p>
          </div>
          <DialogButtons onCancel={onClose} onConfirm={() => create.mutate()} confirmText="Create Template" loading={create.isPending} disabled={!form.name || !form.body} />
        </div>
      </DialogContent>
    </Dialog>
  );
}
