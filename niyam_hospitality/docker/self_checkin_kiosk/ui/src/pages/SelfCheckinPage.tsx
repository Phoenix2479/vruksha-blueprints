import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, Button, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@shared/components/ui";
import { StatsCard, StatusBadge } from "@shared/components/blocks";
import { Smartphone, Key, Monitor, Clock, CheckCircle, Wifi, WifiOff, QrCode, Search } from "lucide-react";
import { getKiosks, getDigitalKeys, getRecentSessions, getStats, type Kiosk, type DigitalKey, type CheckinSession, type KioskStats } from "../api";

type TabType = "kiosks" | "keys" | "sessions";

export default function SelfCheckinPage() {
  const [activeTab, setActiveTab] = useState<TabType>("kiosks");
  const { data: stats } = useQuery<KioskStats>({ queryKey: ["kiosk-stats"], queryFn: getStats });
  const { data: kiosks = [] } = useQuery<Kiosk[]>({ queryKey: ["kiosks"], queryFn: getKiosks });
  const { data: keys = [] } = useQuery<DigitalKey[]>({ queryKey: ["digital-keys"], queryFn: getDigitalKeys });
  const { data: sessions = [] } = useQuery<CheckinSession[]>({ queryKey: ["sessions"], queryFn: getRecentSessions });

  const tabs: { id: TabType; label: string; count?: number }[] = [
    { id: "kiosks", label: "Kiosks", count: kiosks.filter(k => k.status === "online").length },
    { id: "keys", label: "Digital Keys", count: keys.filter(k => k.status === "active").length },
    { id: "sessions", label: "Recent Sessions" },
  ];

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        <div><h1 className="text-2xl font-bold text-gray-900">Self Check-in & Kiosk</h1><p className="text-gray-500">Manage kiosks and digital keys</p></div>

        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <StatsCard title="Total Kiosks" value={stats?.total_kiosks || 0} icon={Monitor} />
          <StatsCard title="Online" value={stats?.online_kiosks || 0} icon={Wifi} />
          <StatsCard title="Check-ins Today" value={stats?.checkins_today || 0} icon={CheckCircle} />
          <StatsCard title="Avg Time" value={`${stats?.avg_checkin_time || 0}m`} icon={Clock} />
          <StatsCard title="Keys Issued" value={stats?.digital_keys_issued || 0} icon={Key} />
        </div>

        <div className="border-b"><div className="flex gap-4">{tabs.map((tab) => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`px-4 py-2 font-medium border-b-2 ${activeTab === tab.id ? "border-blue-600 text-blue-600" : "border-transparent text-gray-500"}`}>
            {tab.label}{tab.count !== undefined && <span className="ml-2 px-2 py-0.5 text-xs rounded-full bg-gray-100">{tab.count}</span>}
          </button>
        ))}</div></div>

        {activeTab === "kiosks" && <KiosksTab kiosks={kiosks} />}
        {activeTab === "keys" && <KeysTab keys={keys} />}
        {activeTab === "sessions" && <SessionsTab sessions={sessions} />}
      </div>
    </div>
  );
}

function KiosksTab({ kiosks }: { kiosks: Kiosk[] }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {kiosks.map((kiosk) => (
        <Card key={kiosk.id}>
          <CardHeader className="pb-2">
            <div className="flex justify-between items-center">
              <CardTitle className="text-lg flex items-center gap-2">
                <Monitor className="h-5 w-5" />{kiosk.name}
              </CardTitle>
              {kiosk.status === "online" ? <Wifi className="h-5 w-5 text-green-500" /> : <WifiOff className="h-5 w-5 text-red-500" />}
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-gray-500 mb-3">{kiosk.location}</p>
            <div className="flex justify-between text-sm"><span className="text-gray-500">Status</span><StatusBadge status={kiosk.status} /></div>
            <div className="flex justify-between text-sm mt-1"><span className="text-gray-500">Check-ins Today</span><span className="font-semibold">{kiosk.checkins_today}</span></div>
            {kiosk.last_heartbeat && <div className="flex justify-between text-sm mt-1"><span className="text-gray-500">Last Seen</span><span>{new Date(kiosk.last_heartbeat).toLocaleTimeString()}</span></div>}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function KeysTab({ keys }: { keys: DigitalKey[] }) {
  return (
    <Card>
      <Table>
        <TableHeader><TableRow><TableHead>Guest</TableHead><TableHead>Room</TableHead><TableHead>Type</TableHead><TableHead>Valid Period</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
        <TableBody>
          {keys.map((key) => (
            <TableRow key={key.id}>
              <TableCell className="font-medium">{key.guest_name}</TableCell>
              <TableCell>{key.room_number}</TableCell>
              <TableCell className="capitalize">{key.key_type}</TableCell>
              <TableCell className="text-sm">{new Date(key.valid_from).toLocaleDateString()} - {new Date(key.valid_to).toLocaleDateString()}</TableCell>
              <TableCell><StatusBadge status={key.status} /></TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  );
}

function SessionsTab({ sessions }: { sessions: CheckinSession[] }) {
  return (
    <Card>
      <Table>
        <TableHeader><TableRow><TableHead>Guest</TableHead><TableHead>Kiosk</TableHead><TableHead>Room</TableHead><TableHead>Started</TableHead><TableHead>Duration</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
        <TableBody>
          {sessions.map((session) => {
            const duration = session.completed_at ? Math.round((new Date(session.completed_at).getTime() - new Date(session.started_at).getTime()) / 60000) : null;
            return (
              <TableRow key={session.id}>
                <TableCell className="font-medium">{session.guest_name}</TableCell>
                <TableCell>{session.kiosk_name}</TableCell>
                <TableCell>{session.room_number || "-"}</TableCell>
                <TableCell className="text-sm">{new Date(session.started_at).toLocaleString()}</TableCell>
                <TableCell>{duration !== null ? `${duration}m` : "In progress"}</TableCell>
                <TableCell><StatusBadge status={session.status} /></TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </Card>
  );
}
