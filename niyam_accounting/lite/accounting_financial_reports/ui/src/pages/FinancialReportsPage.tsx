import { useState } from 'react'
import { BarChart3, TrendingUp, TrendingDown, DollarSign, Wallet, PieChart } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell, TableFooter } from '@/components/ui/table'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Separator } from '@/components/ui/separator'
import { Spinner } from '@/components/ui/spinner'
import { useDashboard, useProfitLoss, useBalanceSheet, useCashFlow } from '@/hooks/useReports'
import { formatCurrency } from '@/lib/utils'
import { ExportButtons } from '@/components/ExportButtons'

function ReportTable({ section, label }: { section: any; label: string }) {
  if (!section) return null
  return (
    <div className="space-y-2">
      <h3 className="font-semibold text-sm">{label}</h3>
      <Table>
        <TableBody>
          {(section.items || []).map((item: any, i: number) => (
            <TableRow key={i}>
              <TableCell className="text-sm pl-4">{item.account_code && <span className="font-mono text-xs text-muted-foreground mr-2">{item.account_code}</span>}{item.account_name}</TableCell>
              <TableCell className="text-right font-mono text-sm">{formatCurrency(item.amount)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
        <TableFooter>
          <TableRow><TableCell className="font-bold">Total {label}</TableCell><TableCell className="text-right font-mono font-bold">{formatCurrency(section.total)}</TableCell></TableRow>
        </TableFooter>
      </Table>
    </div>
  )
}

export function FinancialReportsPage() {
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  const { data: dashData } = useDashboard()
  const { data: plData, isLoading: plLoading } = useProfitLoss({ from_date: dateFrom || undefined, to_date: dateTo || undefined })
  const { data: bsData, isLoading: bsLoading } = useBalanceSheet()
  const { data: cfData, isLoading: cfLoading } = useCashFlow({ from_date: dateFrom || undefined, to_date: dateTo || undefined })

  const dash = dashData?.data
  const pl = plData?.data
  const bs = bsData?.data
  const cf = cfData?.data

  return (
    <div className="min-h-screen p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Financial Reports</h1>
          <p className="text-muted-foreground text-sm mt-1">Dashboard, P&L, Balance Sheet, and Cash Flow statements</p>
        </div>

        {/* Dashboard KPIs */}
        {dash && (
          <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
            <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground flex items-center gap-1"><TrendingUp className="w-3 h-3" /> Revenue</p><p className="text-lg font-bold mt-1 text-emerald-400">{formatCurrency(dash.total_revenue)}</p></CardContent></Card>
            <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground flex items-center gap-1"><TrendingDown className="w-3 h-3" /> Expenses</p><p className="text-lg font-bold mt-1 text-red-400">{formatCurrency(dash.total_expenses)}</p></CardContent></Card>
            <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground flex items-center gap-1"><DollarSign className="w-3 h-3" /> Net Income</p><p className={`text-lg font-bold mt-1 ${dash.net_income >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{formatCurrency(dash.net_income)}</p></CardContent></Card>
            <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Assets</p><p className="text-lg font-bold mt-1">{formatCurrency(dash.total_assets)}</p></CardContent></Card>
            <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Receivable</p><p className="text-lg font-bold mt-1 text-blue-400">{formatCurrency(dash.accounts_receivable)}</p></CardContent></Card>
            <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Payable</p><p className="text-lg font-bold mt-1 text-amber-400">{formatCurrency(dash.accounts_payable)}</p></CardContent></Card>
          </div>
        )}

        {/* Date Filter */}
        <div className="flex items-center gap-3">
          <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="w-40" placeholder="From" />
          <span className="text-muted-foreground text-sm">to</span>
          <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="w-40" placeholder="To" />
        </div>

        <Tabs defaultValue="profit-loss">
          <TabsList>
            <TabsTrigger value="profit-loss"><TrendingUp className="w-4 h-4 mr-1" />Profit & Loss</TabsTrigger>
            <TabsTrigger value="balance-sheet"><PieChart className="w-4 h-4 mr-1" />Balance Sheet</TabsTrigger>
            <TabsTrigger value="cash-flow"><Wallet className="w-4 h-4 mr-1" />Cash Flow</TabsTrigger>
          </TabsList>

          <TabsContent value="profit-loss">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between"><CardTitle>Profit & Loss Statement</CardTitle><ExportButtons csvUrl={`/api/reports/profit-loss/export/csv?start_date=${dateFrom}&end_date=${dateTo}`} pdfUrl={`/api/reports/profit-loss/export/pdf?start_date=${dateFrom}&end_date=${dateTo}`} /></CardHeader>
              <CardContent>
                {plLoading ? <div className="flex justify-center py-16"><Spinner className="w-6 h-6" /></div> : pl ? (
                  <div className="space-y-6">
                    <ReportTable section={pl.revenue} label="Revenue" />
                    <Separator />
                    <ReportTable section={pl.expenses} label="Expenses" />
                    <Separator />
                    <div className="flex justify-between items-center p-4 rounded-lg bg-muted/50">
                      <span className="text-lg font-bold">Net Income</span>
                      <span className={`text-2xl font-bold font-mono ${pl.net_income >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{formatCurrency(pl.net_income)}</span>
                    </div>
                  </div>
                ) : <div className="text-center py-16 text-muted-foreground">No data available</div>}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="balance-sheet">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between"><CardTitle>Balance Sheet</CardTitle><ExportButtons pdfUrl={`/api/reports/balance-sheet/export/pdf?as_of_date=${dateTo}`} csvUrl={`/api/reports/balance-sheet/export/csv?as_of_date=${dateTo}`} /></CardHeader>
              <CardContent>
                {bsLoading ? <div className="flex justify-center py-16"><Spinner className="w-6 h-6" /></div> : bs ? (
                  <div className="space-y-6">
                    <ReportTable section={bs.assets} label="Assets" />
                    <Separator />
                    <ReportTable section={bs.liabilities} label="Liabilities" />
                    <Separator />
                    <ReportTable section={bs.equity} label="Equity" />
                  </div>
                ) : <div className="text-center py-16 text-muted-foreground">No data available</div>}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="cash-flow">
            <Card>
              <CardHeader><CardTitle>Cash Flow Statement</CardTitle></CardHeader>
              <CardContent>
                {cfLoading ? <div className="flex justify-center py-16"><Spinner className="w-6 h-6" /></div> : cf ? (
                  <div className="space-y-6">
                    <ReportTable section={cf.operating} label="Operating Activities" />
                    <Separator />
                    <ReportTable section={cf.investing} label="Investing Activities" />
                    <Separator />
                    <ReportTable section={cf.financing} label="Financing Activities" />
                    <Separator />
                    <div className="flex justify-between items-center p-4 rounded-lg bg-muted/50">
                      <span className="text-lg font-bold">Net Change in Cash</span>
                      <span className={`text-2xl font-bold font-mono ${cf.net_change >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{formatCurrency(cf.net_change)}</span>
                    </div>
                  </div>
                ) : <div className="text-center py-16 text-muted-foreground">No data available</div>}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
