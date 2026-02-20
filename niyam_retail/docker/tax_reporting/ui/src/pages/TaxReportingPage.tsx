import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { taxApi, type TaxDashboard } from "../api/taxApi";
import { Card, CardContent, CardHeader, CardTitle, Button, Table, TableBody, TableCell, TableHead, TableHeader, TableRow, Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "../../../../shared/components/ui";
import { StatsCard, StatusBadge, DialogButtons } from "../../../../shared/components/blocks";
import { Receipt, DollarSign, Calculator, Download, Loader2, Eye, AlertTriangle } from "lucide-react";

interface TaxPeriod {
  id: string;
  period: string;
  start_date: string;
  end_date: string;
  gross_sales: number;
  taxable_sales: number;
  tax_collected: number;
  tax_rate: number;
  status: "pending" | "filed" | "paid";
  due_date: string;
}

export default function TaxReportingPage() {
  const [selectedPeriod, setSelectedPeriod] = useState<TaxPeriod | null>(null);
  const [selectedYear] = useState(new Date().getFullYear());

  const { data: dashboard } = useQuery<TaxDashboard>({
    queryKey: ["tax-dashboard"],
    queryFn: taxApi.getDashboard,
  });

  const { data: quarterlyData, isLoading } = useQuery({
    queryKey: ["tax-quarterly", selectedYear],
    queryFn: () => taxApi.getQuarterly(selectedYear),
  });

  // Transform quarterly data to display format
  const taxPeriods: TaxPeriod[] = (quarterlyData?.quarterly || []).map((q, i) => ({
    id: String(i + 1),
    period: `Q${q.quarter} ${quarterlyData?.year || selectedYear}`,
    start_date: `${quarterlyData?.year || selectedYear}-${String((q.quarter - 1) * 3 + 1).padStart(2, '0')}-01`,
    end_date: `${quarterlyData?.year || selectedYear}-${String(q.quarter * 3).padStart(2, '0')}-${q.quarter === 1 || q.quarter === 4 ? '31' : '30'}`,
    gross_sales: q.total,
    taxable_sales: q.subtotal,
    tax_collected: q.tax,
    tax_rate: q.subtotal > 0 ? (q.tax / q.subtotal) * 100 : 0,
    status: q.quarter < (dashboard?.currentQuarter || 1) ? "paid" : "pending",
    due_date: `${quarterlyData?.year || selectedYear}-${String(q.quarter * 3 + 1).padStart(2, '0')}-15`,
  }));

  const ytdTaxCollected = dashboard?.ytdTax || 0;
  const pendingTax = dashboard?.pendingTax || 0;
  const ytdGrossSales = taxPeriods.reduce((sum, p) => sum + p.gross_sales, 0);

  const getStatusStyle = (status: string) => {
    switch (status) {
      case "paid": return "active";
      case "filed": return "info";
      case "pending": return "warning";
      default: return "neutral";
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card px-6 py-4">
        <div className="flex items-center justify-between max-w-7xl mx-auto">
          <div className="flex items-center gap-3">
            <Receipt className="h-7 w-7 text-amber-600" />
            <div>
              <h1 className="text-xl font-bold">Tax Reporting</h1>
              <p className="text-sm text-muted-foreground">Sales tax collection and filing</p>
            </div>
          </div>
          <Button variant="outline"><Download className="h-4 w-4 mr-2" />Export All</Button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-6 space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <StatsCard title="YTD Tax Collected" value={`$${ytdTaxCollected.toLocaleString()}`} icon={<DollarSign className="h-5 w-5" />} iconColor="text-green-600" iconBg="bg-green-100" />
          <StatsCard title="Pending Tax" value={`$${pendingTax.toLocaleString()}`} icon={<AlertTriangle className="h-5 w-5" />} iconColor="text-amber-600" iconBg="bg-amber-100" />
          <StatsCard title="YTD Gross Sales" value={`$${ytdGrossSales.toLocaleString()}`} icon={<Calculator className="h-5 w-5" />} iconColor="text-blue-600" iconBg="bg-blue-100" />
          <StatsCard title="Tax Rate" value="8.0%" icon={<Receipt className="h-5 w-5" />} iconColor="text-purple-600" iconBg="bg-purple-100" />
        </div>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">Tax Periods</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Period</TableHead>
                    <TableHead>Date Range</TableHead>
                    <TableHead className="text-right">Gross Sales</TableHead>
                    <TableHead className="text-right">Taxable Sales</TableHead>
                    <TableHead className="text-right">Tax Collected</TableHead>
                    <TableHead>Due Date</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {taxPeriods.map((period) => (
                    <TableRow key={period.id}>
                      <TableCell className="font-medium">{period.period}</TableCell>
                      <TableCell className="text-muted-foreground">{period.start_date} - {period.end_date}</TableCell>
                      <TableCell className="text-right">${period.gross_sales.toLocaleString()}</TableCell>
                      <TableCell className="text-right">${period.taxable_sales.toLocaleString()}</TableCell>
                      <TableCell className="text-right font-semibold">${period.tax_collected.toLocaleString()}</TableCell>
                      <TableCell>{period.due_date}</TableCell>
                      <TableCell><StatusBadge status={getStatusStyle(period.status)} label={period.status.charAt(0).toUpperCase() + period.status.slice(1)} size="sm" /></TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setSelectedPeriod(period)}><Eye className="h-4 w-4" /></Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8"><Download className="h-4 w-4" /></Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </main>

      <Dialog open={!!selectedPeriod} onOpenChange={() => setSelectedPeriod(null)}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Tax Period Details - {selectedPeriod?.period}</DialogTitle>
            <DialogDescription>Detailed breakdown for this tax period</DialogDescription>
          </DialogHeader>
          {selectedPeriod && (
            <div className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="p-3 bg-muted rounded-lg"><p className="text-xs text-muted-foreground">Gross Sales</p><p className="text-lg font-semibold">${selectedPeriod.gross_sales.toLocaleString()}</p></div>
                <div className="p-3 bg-muted rounded-lg"><p className="text-xs text-muted-foreground">Taxable Sales</p><p className="text-lg font-semibold">${selectedPeriod.taxable_sales.toLocaleString()}</p></div>
                <div className="p-3 bg-muted rounded-lg"><p className="text-xs text-muted-foreground">Tax Rate</p><p className="text-lg font-semibold">{selectedPeriod.tax_rate}%</p></div>
                <div className="p-3 bg-green-50 dark:bg-green-950 rounded-lg"><p className="text-xs text-muted-foreground">Tax Collected</p><p className="text-lg font-semibold text-green-600">${selectedPeriod.tax_collected.toLocaleString()}</p></div>
              </div>
            </div>
          )}
          <DialogButtons onCancel={() => setSelectedPeriod(null)} onConfirm={() => setSelectedPeriod(null)} confirmText="Close" />
        </DialogContent>
      </Dialog>
    </div>
  );
}
