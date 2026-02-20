import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, Button, Input } from "@shared/components/ui";
import { StatsCard, StatusBadge } from "@shared/components/blocks";
import { DollarSign, Calendar, TrendingUp, Building, ChevronLeft, ChevronRight, Package, Users } from "lucide-react";
import { getBARRates, getSeasons, getCompetitors, getCompetitorRates, getPackages, type BARRate, type Season, type Competitor, type CompetitorRate, type RatePackage } from "../api";

type TabType = "calendar" | "competitors" | "packages" | "seasons";

export default function RateManagerPage() {
  const [activeTab, setActiveTab] = useState<TabType>("calendar");
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return d;
  });

  const tabs: { id: TabType; label: string }[] = [
    { id: "calendar", label: "Rate Calendar" },
    { id: "competitors", label: "Competitor Rates" },
    { id: "packages", label: "Rate Packages" },
    { id: "seasons", label: "Seasons" },
  ];

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Rate Manager</h1>
            <p className="text-gray-500">Manage room rates and pricing strategy</p>
          </div>
        </div>

        <div className="border-b">
          <div className="flex gap-4">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-4 py-2 font-medium border-b-2 transition-colors ${
                  activeTab === tab.id ? "border-blue-600 text-blue-600" : "border-transparent text-gray-500"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {activeTab === "calendar" && <RateCalendarTab startDate={startDate} setStartDate={setStartDate} />}
        {activeTab === "competitors" && <CompetitorTab startDate={startDate} />}
        {activeTab === "packages" && <PackagesTab />}
        {activeTab === "seasons" && <SeasonsTab />}
      </div>
    </div>
  );
}

function RateCalendarTab({ startDate, setStartDate }: { startDate: Date; setStartDate: (d: Date) => void }) {
  const endDate = useMemo(() => {
    const d = new Date(startDate);
    d.setMonth(d.getMonth() + 1);
    return d;
  }, [startDate]);

  const { data: rates = [] } = useQuery<BARRate[]>({
    queryKey: ["bar-rates", startDate.toISOString(), endDate.toISOString()],
    queryFn: () => getBARRates(startDate.toISOString().split('T')[0], endDate.toISOString().split('T')[0]),
  });

  const dates = useMemo(() => {
    const result = [];
    const d = new Date(startDate);
    while (d < endDate) {
      result.push(new Date(d));
      d.setDate(d.getDate() + 1);
    }
    return result;
  }, [startDate, endDate]);

  const roomTypes = [...new Set(rates.map(r => r.room_type))];
  const rateMap = new Map(rates.map(r => [`${r.room_type}-${r.rate_date}`, r]));

  const navigateMonth = (dir: number) => {
    const d = new Date(startDate);
    d.setMonth(d.getMonth() + dir);
    setStartDate(d);
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => navigateMonth(-1)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="font-medium px-4">
            {startDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
          </span>
          <Button variant="outline" size="sm" onClick={() => navigateMonth(1)}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex gap-2 text-sm">
          <span className="flex items-center gap-1"><span className="w-3 h-3 bg-green-200 rounded" /> Available</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 bg-red-200 rounded" /> Closed</span>
        </div>
      </div>

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="p-2 text-left font-medium sticky left-0 bg-white z-10 min-w-[120px]">Room Type</th>
                {dates.map((date, i) => (
                  <th key={i} className={`p-2 text-center min-w-[70px] ${date.getDay() === 0 || date.getDay() === 6 ? 'bg-gray-50' : ''}`}>
                    <div className="text-xs text-gray-500">{date.toLocaleDateString('en-US', { weekday: 'short' })}</div>
                    <div>{date.getDate()}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {roomTypes.map((roomType) => (
                <tr key={roomType} className="border-b">
                  <td className="p-2 font-medium sticky left-0 bg-white z-10">{roomType}</td>
                  {dates.map((date, i) => {
                    const dateStr = date.toISOString().split('T')[0];
                    const rate = rateMap.get(`${roomType}-${dateStr}`);
                    return (
                      <td key={i} className={`p-1 text-center ${date.getDay() === 0 || date.getDay() === 6 ? 'bg-gray-50' : ''}`}>
                        <div className={`p-1 rounded text-xs ${rate?.is_closed ? 'bg-red-100 text-red-700' : 'bg-green-50 hover:bg-green-100 cursor-pointer'}`}>
                          {rate?.is_closed ? 'X' : rate ? `$${rate.bar_rate}` : '-'}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}

function CompetitorTab({ startDate }: { startDate: Date }) {
  const endDate = useMemo(() => {
    const d = new Date(startDate);
    d.setDate(d.getDate() + 7);
    return d;
  }, [startDate]);

  const { data: competitors = [] } = useQuery<Competitor[]>({ queryKey: ["competitors"], queryFn: getCompetitors });
  const { data: rates = [] } = useQuery<CompetitorRate[]>({
    queryKey: ["competitor-rates", startDate.toISOString()],
    queryFn: () => getCompetitorRates(startDate.toISOString().split('T')[0], endDate.toISOString().split('T')[0]),
  });

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {competitors.map((comp) => {
        const compRates = rates.filter(r => r.competitor_id === comp.id);
        const avgRate = compRates.length ? compRates.reduce((sum, r) => sum + r.rate, 0) / compRates.length : 0;
        return (
          <Card key={comp.id}>
            <CardHeader className="pb-2">
              <div className="flex justify-between items-start">
                <CardTitle className="text-lg">{comp.name}</CardTitle>
                {comp.star_rating && (
                  <span className="text-yellow-500">{'★'.repeat(comp.star_rating)}</span>
                )}
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-gray-500">Avg Rate (7d)</span>
                  <span className="font-semibold">${avgRate.toFixed(0)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Data Points</span>
                  <span>{compRates.length}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

function PackagesTab() {
  const { data: packages = [] } = useQuery<RatePackage[]>({ queryKey: ["packages"], queryFn: getPackages });

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {packages.map((pkg) => (
        <Card key={pkg.id}>
          <CardHeader className="pb-2">
            <div className="flex justify-between items-center">
              <CardTitle className="text-lg">{pkg.name}</CardTitle>
              <StatusBadge status={pkg.is_active ? "active" : "inactive"} />
            </div>
            <p className="text-sm text-gray-500">{pkg.code}</p>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-gray-600 mb-3">{pkg.description}</p>
            <div className="flex justify-between items-center mb-3">
              <span className="text-gray-500">Rate Adjustment</span>
              <span className="font-semibold">
                {pkg.rate_adjustment_type === 'percentage' ? `${pkg.rate_adjustment_value}%` : `$${pkg.rate_adjustment_value}`}
                {' '}{pkg.rate_adjustment_value >= 0 ? 'markup' : 'discount'}
              </span>
            </div>
            {pkg.inclusions.length > 0 && (
              <div>
                <p className="text-sm text-gray-500 mb-1">Inclusions:</p>
                <div className="flex flex-wrap gap-1">
                  {pkg.inclusions.map((inc, i) => (
                    <span key={i} className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded">{inc}</span>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function SeasonsTab() {
  const { data: seasons = [] } = useQuery<Season[]>({ queryKey: ["seasons"], queryFn: getSeasons });

  const seasonColors: Record<string, string> = {
    peak: "bg-red-100 border-red-300",
    high: "bg-orange-100 border-orange-300",
    regular: "bg-blue-100 border-blue-300",
    low: "bg-green-100 border-green-300",
  };

  return (
    <div className="space-y-4">
      {seasons.map((season) => (
        <Card key={season.id} className={`border-l-4 ${seasonColors[season.season_type] || 'border-gray-300'}`}>
          <CardContent className="py-4">
            <div className="flex justify-between items-center">
              <div>
                <h3 className="font-semibold">{season.name}</h3>
                <p className="text-sm text-gray-500">
                  {new Date(season.start_date).toLocaleDateString()} - {new Date(season.end_date).toLocaleDateString()}
                </p>
              </div>
              <div className="text-right">
                <span className="text-sm text-gray-500">Rate Multiplier</span>
                <p className="font-semibold text-lg">{season.rate_multiplier}x</p>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
