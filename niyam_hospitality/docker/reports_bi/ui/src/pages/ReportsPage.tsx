import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, Button, Tabs, TabsList, TabsTrigger, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@shared/components/ui";
import { StatsCard } from "@shared/components/blocks";
import { BarChart3, TrendingUp, DollarSign, Users, Building, Calendar, Download, FileText, Clock, Percent } from "lucide-react";
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, AreaChart, Area } from "recharts";
import { getExecutiveDashboard, getOccupancyTrend, getRevenueTrend, getReports, getScheduledReports, type ExecutiveDashboard, type OccupancyTrend, type RevenueTrend, type ReportDefinition, type ScheduledReport } from "../api";
import { spacing } from "@shared/styles/spacing";

type TabType = "dashboard" | "reports" | "scheduled";

export default function ReportsPage() {
  const [activeTab, setActiveTab] = useState<TabType>("dashboard");
  const [dateRange, setDateRange] = useState("30");

  const tabs: { id: TabType; label: string }[] = [
    { id: "dashboard", label: "Executive Dashboard" },
    { id: "reports", label: "Reports Library" },
    { id: "scheduled", label: "Scheduled Reports" },
  ];

  return (
    <div className="min-h-screen bg-background">
      <header className={`border-b bg-card ${spacing.header}`}>
        <div className="flex items-center justify-between max-w-7xl mx-auto">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-100 rounded-lg">
              <BarChart3 className="h-6 w-6 text-indigo-600" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight">Reports & Analytics</h1>
              <p className="text-sm text-muted-foreground">Business intelligence dashboard</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Select value={dateRange} onValueChange={setDateRange}>
              <SelectTrigger className="w-[140px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7">Last 7 days</SelectItem>
                <SelectItem value="30">Last 30 days</SelectItem>
                <SelectItem value="90">Last 90 days</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm">
              <Download className="h-4 w-4 mr-2" /> Export
            </Button>
          </div>
        </div>
      </header>

      <main className={`max-w-7xl mx-auto ${spacing.page} ${spacing.section}`}>
        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as TabType)}>
          <TabsList>
            {tabs.map((tab) => (
              <TabsTrigger key={tab.id} value={tab.id}>
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        {/* Content */}
        {activeTab === "dashboard" && <DashboardTab dateRange={Number(dateRange)} />}
        {activeTab === "reports" && <ReportsTab />}
        {activeTab === "scheduled" && <ScheduledTab />}
      </main>
    </div>
  );
}

function DashboardTab({ dateRange }: { dateRange: number }) {
  const { data: dashboard } = useQuery<ExecutiveDashboard>({ 
    queryKey: ["executive-dashboard"], 
    queryFn: getExecutiveDashboard 
  });
  const { data: occupancy = [] } = useQuery<OccupancyTrend[]>({ 
    queryKey: ["occupancy-trend", dateRange], 
    queryFn: () => getOccupancyTrend(dateRange) 
  });
  const { data: revenue = [] } = useQuery<RevenueTrend[]>({ 
    queryKey: ["revenue-trend", dateRange], 
    queryFn: () => getRevenueTrend(dateRange) 
  });

  const formatCurrency = (value: number) => `$${value.toLocaleString()}`;

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <StatsCard 
          title="Occupancy" 
          value={`${dashboard?.occupancy_rate || 0}%`} 
          icon={Percent}
          trend={{ value: 3.2, isPositive: true }}
        />
        <StatsCard 
          title="ADR" 
          value={formatCurrency(dashboard?.adr || 0)} 
          icon={DollarSign}
          trend={{ value: 5.1, isPositive: true }}
        />
        <StatsCard 
          title="RevPAR" 
          value={formatCurrency(dashboard?.revpar || 0)} 
          icon={TrendingUp}
          trend={{ value: 8.4, isPositive: true }}
        />
        <StatsCard 
          title="Total Revenue" 
          value={formatCurrency(dashboard?.total_revenue || 0)} 
          icon={BarChart3}
        />
        <StatsCard 
          title="In-House" 
          value={dashboard?.inhouse_guests || 0} 
          icon={Users}
        />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Occupancy Chart */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building className="h-5 w-5" />
              Occupancy Trend
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={occupancy}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" tickFormatter={(v) => new Date(v).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} />
                  <YAxis domain={[0, 100]} tickFormatter={(v) => `${v}%`} />
                  <Tooltip 
                    formatter={(value: number) => [`${value}%`, 'Occupancy']}
                    labelFormatter={(label) => new Date(label).toLocaleDateString()}
                  />
                  <Area type="monotone" dataKey="occupancy" stroke="#3b82f6" fill="#93c5fd" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Revenue Chart */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <DollarSign className="h-5 w-5" />
              Revenue Breakdown
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={revenue}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" tickFormatter={(v) => new Date(v).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} />
                  <YAxis tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                  <Tooltip 
                    formatter={(value: number) => [formatCurrency(value)]}
                    labelFormatter={(label) => new Date(label).toLocaleDateString()}
                  />
                  <Legend />
                  <Bar dataKey="room_revenue" name="Room" stackId="a" fill="#3b82f6" />
                  <Bar dataKey="fnb_revenue" name="F&B" stackId="a" fill="#10b981" />
                  <Bar dataKey="other_revenue" name="Other" stackId="a" fill="#f59e0b" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <p className="text-sm text-gray-500">Today's Arrivals</p>
              <p className="text-3xl font-bold">{dashboard?.arrivals_today || 0}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <p className="text-sm text-gray-500">Today's Departures</p>
              <p className="text-3xl font-bold">{dashboard?.departures_today || 0}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <p className="text-sm text-gray-500">Room Revenue</p>
              <p className="text-3xl font-bold">{formatCurrency(dashboard?.room_revenue || 0)}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <p className="text-sm text-gray-500">F&B Revenue</p>
              <p className="text-3xl font-bold">{formatCurrency(dashboard?.fnb_revenue || 0)}</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function ReportsTab() {
  const { data: reports = [] } = useQuery<ReportDefinition[]>({ 
    queryKey: ["reports"], 
    queryFn: getReports 
  });

  const reportCategories = [
    { id: "revenue", name: "Revenue Reports", icon: DollarSign, color: "bg-green-100 text-green-700" },
    { id: "occupancy", name: "Occupancy Reports", icon: Building, color: "bg-blue-100 text-blue-700" },
    { id: "guest", name: "Guest Reports", icon: Users, color: "bg-purple-100 text-purple-700" },
    { id: "fnb", name: "F&B Reports", icon: BarChart3, color: "bg-amber-100 text-amber-700" },
  ];

  return (
    <div className="space-y-6">
      {reportCategories.map((category) => {
        const Icon = category.icon;
        const categoryReports = reports.filter(r => r.type === category.id);
        
        return (
          <Card key={category.id}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <div className={`p-2 rounded-lg ${category.color}`}>
                  <Icon className="h-5 w-5" />
                </div>
                {category.name}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {categoryReports.length > 0 ? categoryReports.map((report) => (
                  <div key={report.id} className="p-4 border rounded-lg hover:bg-gray-50 cursor-pointer">
                    <div className="flex justify-between items-start">
                      <div>
                        <h4 className="font-medium">{report.name}</h4>
                        <p className="text-sm text-gray-500 mt-1">{report.description}</p>
                      </div>
                      <Button variant="ghost" size="sm">
                        <Download className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                )) : (
                  <p className="text-gray-500 col-span-full">No reports available</p>
                )}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

function ScheduledTab() {
  const { data: schedules = [] } = useQuery<ScheduledReport[]>({ 
    queryKey: ["scheduled-reports"], 
    queryFn: getScheduledReports 
  });

  return (
    <Card>
      <CardHeader>
        <div className="flex justify-between items-center">
          <CardTitle>Scheduled Reports</CardTitle>
          <Button>
            <Calendar className="h-4 w-4 mr-2" /> Schedule New
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="divide-y">
          {schedules.length > 0 ? schedules.map((schedule) => (
            <div key={schedule.id} className="py-4 flex justify-between items-center">
              <div className="flex items-center gap-4">
                <div className="p-2 bg-gray-100 rounded-lg">
                  <FileText className="h-5 w-5 text-gray-600" />
                </div>
                <div>
                  <h4 className="font-medium">{schedule.report_name}</h4>
                  <div className="flex items-center gap-4 text-sm text-gray-500 mt-1">
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {schedule.schedule}
                    </span>
                    <span>{schedule.recipients.length} recipients</span>
                    <span className="uppercase text-xs bg-gray-100 px-2 py-0.5 rounded">{schedule.format}</span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <div className="text-right text-sm">
                  {schedule.next_run && (
                    <p className="text-gray-500">Next: {new Date(schedule.next_run).toLocaleString()}</p>
                  )}
                </div>
                <div className={`w-3 h-3 rounded-full ${schedule.is_active ? "bg-green-500" : "bg-gray-300"}`} />
              </div>
            </div>
          )) : (
            <div className="py-8 text-center text-gray-500">
              No scheduled reports. Click "Schedule New" to create one.
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
