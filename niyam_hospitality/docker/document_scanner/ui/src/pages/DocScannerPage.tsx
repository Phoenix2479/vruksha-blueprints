import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, Button, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@shared/components/ui";
import { StatsCard, StatusBadge } from "@shared/components/blocks";
import { FileText, ScanLine, Shield, CheckCircle, AlertTriangle, Clock, FileCheck, Download, Upload } from "lucide-react";
import { getRecentScans, getRegistrationCards, getComplianceReports, getStats, type DocumentScan, type RegistrationCard, type ComplianceReport, type ScannerStats } from "../api";

type TabType = "scans" | "cards" | "compliance";

export default function DocScannerPage() {
  const [activeTab, setActiveTab] = useState<TabType>("scans");

  const { data: stats } = useQuery<ScannerStats>({ queryKey: ["scanner-stats"], queryFn: getStats });
  const { data: scans = [] } = useQuery<DocumentScan[]>({ queryKey: ["scans"], queryFn: getRecentScans });
  const { data: cards = [] } = useQuery<RegistrationCard[]>({ queryKey: ["registration-cards"], queryFn: getRegistrationCards });
  const { data: reports = [] } = useQuery<ComplianceReport[]>({ queryKey: ["compliance-reports"], queryFn: getComplianceReports });

  const tabs: { id: TabType; label: string; count?: number }[] = [
    { id: "scans", label: "Document Scans" },
    { id: "cards", label: "Registration Cards", count: cards.filter(c => c.status === "pending").length },
    { id: "compliance", label: "Compliance Reports", count: reports.filter(r => r.status === "pending").length },
  ];

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex justify-between items-center">
          <div><h1 className="text-2xl font-bold text-gray-900">Document Scanner</h1><p className="text-gray-500">ID verification and compliance management</p></div>
          <Button><Upload className="h-4 w-4 mr-2" /> Upload Document</Button>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <StatsCard title="Scans Today" value={stats?.scans_today || 0} icon={ScanLine} />
          <StatsCard title="Scans This Week" value={stats?.scans_week || 0} icon={FileText} />
          <StatsCard title="Verification Rate" value={`${stats?.verification_rate || 0}%`} icon={CheckCircle} />
          <StatsCard title="Pending Cards" value={stats?.pending_cards || 0} icon={FileCheck} />
          <StatsCard title="Compliance Due" value={stats?.compliance_due || 0} icon={Shield} />
        </div>

        <div className="border-b"><div className="flex gap-4">{tabs.map((tab) => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`px-4 py-2 font-medium border-b-2 ${activeTab === tab.id ? "border-blue-600 text-blue-600" : "border-transparent text-gray-500"}`}>
            {tab.label}{tab.count !== undefined && tab.count > 0 && <span className="ml-2 px-2 py-0.5 text-xs rounded-full bg-red-100 text-red-700">{tab.count}</span>}
          </button>
        ))}</div></div>

        {activeTab === "scans" && (
          <Card>
            <Table>
              <TableHeader><TableRow><TableHead>Guest</TableHead><TableHead>Document Type</TableHead><TableHead>Number</TableHead><TableHead>Nationality</TableHead><TableHead>Quality</TableHead><TableHead>Verified</TableHead><TableHead>Scanned</TableHead></TableRow></TableHeader>
              <TableBody>
                {scans.map((scan) => (
                  <TableRow key={scan.id}>
                    <TableCell className="font-medium">{scan.guest_name}</TableCell>
                    <TableCell className="capitalize">{scan.document_type.replace(/_/g, " ")}</TableCell>
                    <TableCell className="font-mono text-sm">{scan.document_number || "-"}</TableCell>
                    <TableCell>{scan.nationality || "-"}</TableCell>
                    <TableCell>
                      <span className={`px-2 py-0.5 rounded text-xs ${scan.scan_quality === "high" ? "bg-green-100 text-green-700" : scan.scan_quality === "medium" ? "bg-yellow-100 text-yellow-700" : "bg-red-100 text-red-700"}`}>
                        {scan.scan_quality}
                      </span>
                    </TableCell>
                    <TableCell>{scan.verified ? <CheckCircle className="h-5 w-5 text-green-500" /> : <AlertTriangle className="h-5 w-5 text-yellow-500" />}</TableCell>
                    <TableCell className="text-sm text-gray-500">{new Date(scan.scanned_at).toLocaleString()}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        )}

        {activeTab === "cards" && (
          <Card>
            <Table>
              <TableHeader><TableRow><TableHead>Guest</TableHead><TableHead>Room</TableHead><TableHead>Check-in</TableHead><TableHead>Status</TableHead><TableHead>Signed</TableHead><TableHead></TableHead></TableRow></TableHeader>
              <TableBody>
                {cards.map((card) => (
                  <TableRow key={card.id}>
                    <TableCell className="font-medium">{card.guest_name}</TableCell>
                    <TableCell>{card.room_number}</TableCell>
                    <TableCell className="text-sm">{new Date(card.check_in).toLocaleString()}</TableCell>
                    <TableCell><StatusBadge status={card.status} /></TableCell>
                    <TableCell className="text-sm text-gray-500">{card.signed_at ? new Date(card.signed_at).toLocaleString() : "-"}</TableCell>
                    <TableCell><Button size="sm" variant="outline"><Download className="h-4 w-4" /></Button></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        )}

        {activeTab === "compliance" && (
          <Card>
            <CardHeader><CardTitle>Compliance Reports (C-Form / FRRO)</CardTitle></CardHeader>
            <Table>
              <TableHeader><TableRow><TableHead>Report Type</TableHead><TableHead>Period</TableHead><TableHead>Records</TableHead><TableHead>Status</TableHead><TableHead>Submitted</TableHead><TableHead></TableHead></TableRow></TableHeader>
              <TableBody>
                {reports.map((report) => (
                  <TableRow key={report.id}>
                    <TableCell className="font-medium">{report.report_type}</TableCell>
                    <TableCell>{report.period}</TableCell>
                    <TableCell>{report.records_count}</TableCell>
                    <TableCell><StatusBadge status={report.status} /></TableCell>
                    <TableCell className="text-sm text-gray-500">{report.submitted_at ? new Date(report.submitted_at).toLocaleString() : "-"}</TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button size="sm" variant="outline"><Download className="h-4 w-4" /></Button>
                        {report.status === "pending" && <Button size="sm">Submit</Button>}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        )}
      </div>
    </div>
  );
}
