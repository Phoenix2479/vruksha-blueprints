import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, Button, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@shared/components/ui";
import { StatsCard, StatusBadge } from "@shared/components/blocks";
import { Brain, TrendingUp, DollarSign, Percent, BarChart3, Zap, ArrowUp, ArrowDown, Minus, CheckCircle } from "lucide-react";
import { LineChart, Line, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { getForecast, getRecommendations, getRules, getPerformance, getKPIs, applyRecommendations, type Forecast, type Recommendation, type PricingRule, type Performance, type KPIs } from "../api";

type TabType = "recommendations" | "forecast" | "performance" | "rules";

export default function RevenueAIPage() {
  const [activeTab, setActiveTab] = useState<TabType>("recommendations");
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const queryClient = useQueryClient();

  const { data: kpis } = useQuery<KPIs>({ queryKey: ["revenue-kpis"], queryFn: getKPIs });
  const { data: recData } = useQuery({ queryKey: ["recommendations", selectedDate], queryFn: () => getRecommendations(selectedDate) });
  const { data: forecast = [] } = useQuery<Forecast[]>({ queryKey: ["forecast"], queryFn: () => getForecast() });
  const { data: performance = [] } = useQuery<Performance[]>({ queryKey: ["performance"], queryFn: () => getPerformance(30) });
  const { data: rules = [] } = useQuery<PricingRule[]>({ queryKey: ["pricing-rules"], queryFn: getRules });

  const applyRecs = useMutation({
    mutationFn: (recs: Recommendation[]) => applyRecommendations(recs.map(r => ({ room_type: r.room_type, date: selectedDate, old_rate: r.current_rate, new_rate: r.suggested_rate }))),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["recommendations"] }),
  });

  const tabs: { id: TabType; label: string }[] = [
    { id: "recommendations", label: "AI Recommendations" },
    { id: "forecast", label: "Demand Forecast" },
    { id: "performance", label: "Performance" },
    { id: "rules", label: "Pricing Rules" },
  ];

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex justify-between items-center">
          <div><h1 className="text-2xl font-bold text-gray-900">Revenue Management AI</h1><p className="text-gray-500">Dynamic pricing & demand optimization</p></div>
          <div className="flex items-center gap-2 bg-gradient-to-r from-purple-500 to-blue-500 text-white px-4 py-2 rounded-lg">
            <Brain className="h-5 w-5" /><span className="font-medium">AI Powered</span>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
          <StatsCard title="Occupancy" value={`${kpis?.occupancy || 0}%`} icon={Percent} />
          <StatsCard title="ADR" value={`$${kpis?.adr || 0}`} icon={DollarSign} />
          <StatsCard title="RevPAR" value={`$${kpis?.revpar || 0}`} icon={TrendingUp} />
          <StatsCard title="Revenue MTD" value={`$${(kpis?.revenue_mtd || 0).toLocaleString()}`} icon={BarChart3} />
          <StatsCard title="vs Last Month" value={`${kpis?.revenue_change || 0}%`} icon={kpis?.revenue_change && kpis.revenue_change >= 0 ? TrendingUp : TrendingUp} trend={{ value: Math.abs(kpis?.revenue_change || 0), isPositive: (kpis?.revenue_change || 0) >= 0 }} />
          <StatsCard title="Room Nights" value={kpis?.room_nights_sold || 0} icon={CheckCircle} />
        </div>

        <div className="border-b"><div className="flex gap-4">{tabs.map((tab) => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`px-4 py-2 font-medium border-b-2 ${activeTab === tab.id ? "border-purple-600 text-purple-600" : "border-transparent text-gray-500"}`}>{tab.label}</button>
        ))}</div></div>

        {activeTab === "recommendations" && (
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-4">
                <label className="text-sm text-gray-500">Date:</label>
                <input type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} className="border rounded px-3 py-1" />
                <span className="text-sm text-gray-500">Current Occupancy: <strong>{recData?.occupancy || 0}%</strong></span>
              </div>
              <Button onClick={() => recData && applyRecs.mutate(recData.recommendations.filter(r => r.action !== 'maintain'))} disabled={!recData?.recommendations.some(r => r.action !== 'maintain')}>
                <Zap className="h-4 w-4 mr-2" /> Apply All Recommendations
              </Button>
            </div>
            <Card>
              <Table>
                <TableHeader><TableRow><TableHead>Room Type</TableHead><TableHead>Current Rate</TableHead><TableHead>Competitor Avg</TableHead><TableHead>Suggested Rate</TableHead><TableHead>Action</TableHead><TableHead>Reason</TableHead><TableHead>Impact</TableHead></TableRow></TableHeader>
                <TableBody>
                  {recData?.recommendations.map((rec) => (
                    <TableRow key={rec.room_type}>
                      <TableCell className="font-medium">{rec.room_type}</TableCell>
                      <TableCell>${rec.current_rate}</TableCell>
                      <TableCell>${rec.competitor_avg}</TableCell>
                      <TableCell className="font-semibold">${rec.suggested_rate}</TableCell>
                      <TableCell>
                        <span className={`flex items-center gap-1 ${rec.action === 'increase' ? 'text-green-600' : rec.action === 'decrease' ? 'text-red-600' : 'text-gray-500'}`}>
                          {rec.action === 'increase' ? <ArrowUp className="h-4 w-4" /> : rec.action === 'decrease' ? <ArrowDown className="h-4 w-4" /> : <Minus className="h-4 w-4" />}
                          {rec.action}
                        </span>
                      </TableCell>
                      <TableCell className="text-sm text-gray-600 max-w-[200px]">{rec.reason}</TableCell>
                      <TableCell className="text-sm">{rec.potential_impact}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          </div>
        )}

        {activeTab === "forecast" && (
          <Card>
            <CardHeader><CardTitle>30-Day Demand Forecast</CardTitle></CardHeader>
            <CardContent>
              <div className="h-[400px]">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={forecast}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" tickFormatter={(v) => new Date(v).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} />
                    <YAxis yAxisId="left" />
                    <YAxis yAxisId="right" orientation="right" tickFormatter={(v) => `$${v}`} />
                    <Tooltip labelFormatter={(label) => new Date(label).toLocaleDateString()} />
                    <Legend />
                    <Area yAxisId="left" type="monotone" dataKey="predicted_demand" name="Predicted Demand" stroke="#8b5cf6" fill="#c4b5fd" />
                    <Line yAxisId="right" type="monotone" dataKey="suggested_rate" name="Suggested Rate" stroke="#10b981" strokeWidth={2} dot={false} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        )}

        {activeTab === "performance" && (
          <Card>
            <CardHeader><CardTitle>Performance Trend</CardTitle></CardHeader>
            <CardContent>
              <div className="h-[400px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={performance}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" tickFormatter={(v) => new Date(v).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} />
                    <YAxis yAxisId="left" />
                    <YAxis yAxisId="right" orientation="right" tickFormatter={(v) => `$${v}`} />
                    <Tooltip labelFormatter={(label) => new Date(label).toLocaleDateString()} />
                    <Legend />
                    <Line yAxisId="left" type="monotone" dataKey="occupancy" name="Occupancy %" stroke="#3b82f6" strokeWidth={2} />
                    <Line yAxisId="right" type="monotone" dataKey="adr" name="ADR" stroke="#10b981" strokeWidth={2} />
                    <Line yAxisId="right" type="monotone" dataKey="revpar" name="RevPAR" stroke="#f59e0b" strokeWidth={2} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        )}

        {activeTab === "rules" && (
          <Card>
            <CardHeader><div className="flex justify-between"><CardTitle>Pricing Rules</CardTitle><Button><Zap className="h-4 w-4 mr-2" /> Add Rule</Button></div></CardHeader>
            <Table>
              <TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Type</TableHead><TableHead>Action</TableHead><TableHead>Priority</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
              <TableBody>
                {rules.map((rule) => (
                  <TableRow key={rule.id}>
                    <TableCell className="font-medium">{rule.name}</TableCell>
                    <TableCell className="capitalize">{rule.rule_type.replace(/_/g, ' ')}</TableCell>
                    <TableCell>{rule.action_type === 'percentage' ? `${rule.action_value}%` : `$${rule.action_value}`}</TableCell>
                    <TableCell>{rule.priority}</TableCell>
                    <TableCell><StatusBadge status={rule.is_active ? "active" : "inactive"} /></TableCell>
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
