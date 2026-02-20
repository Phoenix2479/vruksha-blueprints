import { useState } from 'react'
import { Receipt, FileCheck, Calculator, BarChart3, Settings2, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { Spinner } from '@/components/ui/spinner'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from '@/components/ui/select'
import { useTaxCodes, useTdsSections, useTdsTransactions, useGstReturns, useTaxLiability, useInitTaxCodes, useCreateTdsTransaction, useDepositTds } from '@/hooks/useTax'
import { formatCurrency, formatDate } from '@/lib/utils'
import { ExportButtons } from '@/components/ExportButtons'

export function TaxEnginePage() {
  const [tdsFormOpen, setTdsFormOpen] = useState(false)
  const [tdsF, setTdsF] = useState({ deductee_name: '', deductee_pan: '', section: '194A', transaction_date: new Date().toISOString().split('T')[0], amount: 0, tds_rate: 10 })

  const { data: taxCodesData, isLoading: tcLoading } = useTaxCodes()
  const { data: sectionsData } = useTdsSections()
  const { data: tdsData, isLoading: tdsLoading } = useTdsTransactions()
  const { data: gstData, isLoading: gstLoading } = useGstReturns()
  const { data: liabilityData } = useTaxLiability()
  const initTax = useInitTaxCodes()
  const createTds = useCreateTdsTransaction()
  const depositTds = useDepositTds()

  const taxCodes = taxCodesData?.data || []
  const sections = sectionsData?.data || []
  const tdsTransactions = tdsData?.data || []
  const gstReturns = gstData?.data || []
  const liability = liabilityData?.data

  const gstStatusVariant: Record<string, any> = { draft: 'secondary', filed: 'info', accepted: 'success', rejected: 'destructive' }

  return (
    <div className="min-h-screen p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Tax Engine</h1>
            <p className="text-muted-foreground text-sm mt-1">GST, TDS management, tax codes, and compliance</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => initTax.mutate()} disabled={initTax.isPending}>
              {initTax.isPending ? <Spinner /> : <Settings2 className="w-4 h-4" />} Init Tax Codes
            </Button>
          </div>
        </div>

        {/* Summary */}
        <div className="grid grid-cols-4 gap-3">
          <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Tax Codes</p><p className="text-2xl font-bold mt-1">{taxCodes.length}</p></CardContent></Card>
          <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">TDS Transactions</p><p className="text-2xl font-bold mt-1">{tdsTransactions.length}</p></CardContent></Card>
          <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">TDS Pending Deposit</p><p className="text-2xl font-bold mt-1 text-amber-400">{tdsTransactions.filter(t => !t.deposited).length}</p></CardContent></Card>
          <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">GST Returns</p><p className="text-2xl font-bold mt-1">{gstReturns.length}</p></CardContent></Card>
        </div>

        <Tabs defaultValue="tds">
          <TabsList>
            <TabsTrigger value="tds"><Receipt className="w-4 h-4 mr-1" />TDS</TabsTrigger>
            <TabsTrigger value="gst"><FileCheck className="w-4 h-4 mr-1" />GST Returns</TabsTrigger>
            <TabsTrigger value="tax-codes"><Calculator className="w-4 h-4 mr-1" />Tax Codes</TabsTrigger>
            <TabsTrigger value="reports"><BarChart3 className="w-4 h-4 mr-1" />Reports</TabsTrigger>
          </TabsList>

          <TabsContent value="tds">
            <Card>
              <CardHeader className="pb-3">
                <div className="flex justify-between items-center">
                  <CardTitle>TDS Transactions</CardTitle>
                  <div className="flex gap-2">
                    <ExportButtons csvUrl="/api/tds/transactions/export/csv" />
                    <Button size="sm" onClick={() => setTdsFormOpen(true)}><Plus className="w-4 h-4" /> Record TDS</Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {tdsLoading ? <div className="flex justify-center py-16"><Spinner className="w-6 h-6" /></div> : (
                  <Table>
                    <TableHeader><TableRow>
                      <TableHead>Deductee</TableHead><TableHead>PAN</TableHead><TableHead>Section</TableHead><TableHead>Date</TableHead>
                      <TableHead className="text-right">Amount</TableHead><TableHead className="text-right">TDS</TableHead><TableHead>Status</TableHead><TableHead>Actions</TableHead>
                    </TableRow></TableHeader>
                    <TableBody>
                      {tdsTransactions.map(t => (
                        <TableRow key={t.id}>
                          <TableCell className="text-sm font-medium">{t.deductee_name}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">{t.deductee_pan || '-'}</TableCell>
                          <TableCell><Badge variant="outline" className="text-[10px]">{t.section}</Badge></TableCell>
                          <TableCell className="text-sm">{formatDate(t.transaction_date)}</TableCell>
                          <TableCell className="text-right font-mono text-sm">{formatCurrency(t.amount)}</TableCell>
                          <TableCell className="text-right font-mono text-sm text-amber-400">{formatCurrency(t.tds_amount)}</TableCell>
                          <TableCell><Badge variant={t.deposited ? 'success' : 'warning'} className="text-[10px]">{t.deposited ? 'Deposited' : 'Pending'}</Badge></TableCell>
                          <TableCell>
                            {!t.deposited && <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => depositTds.mutate({ id: t.id, challan_number: 'CHL-' + Date.now(), deposit_date: new Date().toISOString().split('T')[0] })}>Deposit</Button>}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="gst">
            <Card>
              <CardHeader><CardTitle>GST Returns</CardTitle></CardHeader>
              <CardContent>
                {gstLoading ? <div className="flex justify-center py-16"><Spinner className="w-6 h-6" /></div> : (
                  <Table>
                    <TableHeader><TableRow>
                      <TableHead>Type</TableHead><TableHead>Period</TableHead><TableHead>FY</TableHead><TableHead>Status</TableHead>
                      <TableHead className="text-right">Payable</TableHead><TableHead className="text-right">Paid</TableHead><TableHead>Filed</TableHead>
                    </TableRow></TableHeader>
                    <TableBody>
                      {gstReturns.map(r => (
                        <TableRow key={r.id}>
                          <TableCell><Badge variant="info" className="text-[10px]">{r.return_type}</Badge></TableCell>
                          <TableCell className="text-sm">{r.period}</TableCell>
                          <TableCell className="text-sm">{r.financial_year}</TableCell>
                          <TableCell><Badge variant={gstStatusVariant[r.status] || 'outline'} className="text-[10px]">{r.status}</Badge></TableCell>
                          <TableCell className="text-right font-mono text-sm">{formatCurrency(r.tax_payable)}</TableCell>
                          <TableCell className="text-right font-mono text-sm">{formatCurrency(r.tax_paid)}</TableCell>
                          <TableCell className="text-sm">{r.filing_date ? formatDate(r.filing_date) : '-'}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="tax-codes">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between"><CardTitle>Tax Codes</CardTitle><ExportButtons csvUrl="/api/tax-codes/export/csv" /></CardHeader>
              <CardContent>
                {tcLoading ? <div className="flex justify-center py-16"><Spinner className="w-6 h-6" /></div> : (
                  <Table>
                    <TableHeader><TableRow>
                      <TableHead>Code</TableHead><TableHead>Name</TableHead><TableHead>Type</TableHead><TableHead>Rate</TableHead><TableHead>HSN</TableHead><TableHead>SAC</TableHead><TableHead>Status</TableHead>
                    </TableRow></TableHeader>
                    <TableBody>
                      {taxCodes.map(tc => (
                        <TableRow key={tc.id}>
                          <TableCell className="font-mono text-xs">{tc.code}</TableCell>
                          <TableCell className="text-sm">{tc.name}</TableCell>
                          <TableCell><Badge variant="outline" className="text-[10px]">{tc.tax_type}</Badge></TableCell>
                          <TableCell className="font-mono text-sm">{tc.rate}%</TableCell>
                          <TableCell className="text-xs text-muted-foreground">{tc.hsn_code || '-'}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">{tc.sac_code || '-'}</TableCell>
                          <TableCell><Badge variant={tc.is_active ? 'success' : 'outline'} className="text-[10px]">{tc.is_active ? 'Active' : 'Inactive'}</Badge></TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="reports">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between"><CardTitle>Tax Liability Summary</CardTitle><ExportButtons pdfUrl="/api/reports/tax-liability/export/pdf" csvUrl="/api/reports/tax-liability/export/csv" /></CardHeader>
              <CardContent>
                {liability ? (
                  <div className="grid grid-cols-3 gap-4">
                    <div className="rounded-lg border p-4">
                      <p className="text-xs text-muted-foreground">Output Tax (Collected)</p>
                      <p className="text-2xl font-bold mt-2 text-emerald-400">{formatCurrency(liability.output_tax || 0)}</p>
                    </div>
                    <div className="rounded-lg border p-4">
                      <p className="text-xs text-muted-foreground">Input Tax (Paid)</p>
                      <p className="text-2xl font-bold mt-2 text-blue-400">{formatCurrency(liability.input_tax || 0)}</p>
                    </div>
                    <div className="rounded-lg border p-4">
                      <p className="text-xs text-muted-foreground">Net Payable</p>
                      <p className="text-2xl font-bold mt-2 text-amber-400">{formatCurrency(liability.net_payable || 0)}</p>
                    </div>
                  </div>
                ) : <div className="text-center py-16 text-muted-foreground">Loading...</div>}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* TDS Form */}
      <Dialog open={tdsFormOpen} onOpenChange={setTdsFormOpen}>
        <DialogContent className="sm:max-w-[500px]"><DialogHeader><DialogTitle>Record TDS Deduction</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1"><Label>Deductee Name</Label><Input value={tdsF.deductee_name} onChange={e => setTdsF({ ...tdsF, deductee_name: e.target.value })} /></div>
              <div className="space-y-1"><Label>PAN</Label><Input value={tdsF.deductee_pan} onChange={e => setTdsF({ ...tdsF, deductee_pan: e.target.value })} placeholder="AAAAA0000A" /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1"><Label>Section</Label>
                <Select value={tdsF.section} onValueChange={v => { setTdsF({ ...tdsF, section: v, tds_rate: sections.find(s => s.section === v)?.rate || 10 }) }}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{sections.map(s => <SelectItem key={s.section} value={s.section}>{s.section} - {s.description}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1"><Label>Date</Label><Input type="date" value={tdsF.transaction_date} onChange={e => setTdsF({ ...tdsF, transaction_date: e.target.value })} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1"><Label>Amount</Label><Input type="number" step="0.01" value={tdsF.amount} onChange={e => setTdsF({ ...tdsF, amount: +e.target.value })} /></div>
              <div className="space-y-1"><Label>TDS Rate (%)</Label><Input type="number" step="0.1" value={tdsF.tds_rate} onChange={e => setTdsF({ ...tdsF, tds_rate: +e.target.value })} /></div>
            </div>
            <div className="rounded-md border p-3 bg-muted/50"><p className="text-sm">TDS Amount: <span className="font-bold text-amber-400">{formatCurrency(tdsF.amount * tdsF.tds_rate / 100)}</span></p></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTdsFormOpen(false)}>Cancel</Button>
            <Button onClick={async () => { await createTds.mutateAsync({ ...tdsF, tds_amount: tdsF.amount * tdsF.tds_rate / 100 }); setTdsFormOpen(false) }} disabled={createTds.isPending}>{createTds.isPending && <Spinner />} Record</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
