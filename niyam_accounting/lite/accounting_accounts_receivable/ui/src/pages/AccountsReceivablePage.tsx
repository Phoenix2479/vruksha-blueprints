import { useState } from 'react'
import { Users, FileText, CreditCard, BarChart3, Plus, FileX, Download } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { Spinner } from '@/components/ui/spinner'
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useCustomers, useInvoices, useAging, usePostInvoice, usePayInvoice, useCreateCustomer, useCreateInvoice } from '@/hooks/useAR'
import { formatCurrency, formatDate } from '@/lib/utils'
import { ExportButtons } from '@/components/ExportButtons'

const statusVariant: Record<string, 'secondary' | 'warning' | 'info' | 'success' | 'destructive'> = {
  DRAFT: 'secondary', PENDING: 'warning', PARTIAL: 'info', PAID: 'success', OVERDUE: 'destructive',
}

export function AccountsReceivablePage() {
  const [custFilter, setCustFilter] = useState('')
  const [custFormOpen, setCustFormOpen] = useState(false)
  const [invFormOpen, setInvFormOpen] = useState(false)
  const [payOpen, setPayOpen] = useState(false)
  const [selectedInvId, setSelectedInvId] = useState<string | null>(null)

  const { data: custData, isLoading: custLoading } = useCustomers()
  const { data: invData, isLoading: invLoading } = useInvoices({ customer_id: custFilter || undefined })
  const { data: agingData, isLoading: agingLoading } = useAging()
  const postInv = usePostInvoice()
  const payInv = usePayInvoice()
  const createCust = useCreateCustomer()
  const createInv = useCreateInvoice()

  const customers = custData?.data || []
  const invoices = invData?.data || []
  const aging = agingData?.data || []
  const totalReceivable = invoices.reduce((s, i) => s + i.balance_due, 0)

  // Simple customer form state
  const [cf, setCf] = useState({ customer_code: '', customer_name: '', gstin: '', pan: '', email: '', phone: '', payment_terms: 30 })
  // Simple invoice form state
  const [invF, setInvF] = useState({ customer_id: '', invoice_date: new Date().toISOString().split('T')[0], due_date: '', lines: [{ description: '', quantity: 1, unit_price: 0, gst_rate: 18 }] })
  // Payment state
  const [payF, setPayF] = useState({ amount: '', payment_method: 'BANK_TRANSFER', reference_number: '' })

  return (
    <div className="min-h-screen p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Accounts Receivable</h1>
            <p className="text-muted-foreground text-sm mt-1">Manage customers, invoices, and receipts</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setCustFormOpen(true)}><Plus className="w-4 h-4" /> Add Customer</Button>
            <Button size="sm" onClick={() => setInvFormOpen(true)}><Plus className="w-4 h-4" /> New Invoice</Button>
          </div>
        </div>

        <div className="grid grid-cols-4 gap-3">
          <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Total Customers</p><p className="text-2xl font-bold mt-1">{customers.length}</p></CardContent></Card>
          <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Open Invoices</p><p className="text-2xl font-bold mt-1 text-amber-400">{invoices.filter(i => i.status !== 'PAID').length}</p></CardContent></Card>
          <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Receivable</p><p className="text-2xl font-bold mt-1 text-emerald-400">{formatCurrency(totalReceivable)}</p></CardContent></Card>
          <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Overdue</p><p className="text-2xl font-bold mt-1 text-red-400">{invoices.filter(i => i.status === 'OVERDUE').length}</p></CardContent></Card>
        </div>

        <Tabs defaultValue="invoices">
          <TabsList>
            <TabsTrigger value="invoices"><FileText className="w-4 h-4 mr-1" />Invoices</TabsTrigger>
            <TabsTrigger value="customers"><Users className="w-4 h-4 mr-1" />Customers</TabsTrigger>
            <TabsTrigger value="aging"><BarChart3 className="w-4 h-4 mr-1" />AR Aging</TabsTrigger>
            <TabsTrigger value="credit-notes"><FileX className="w-4 h-4 mr-1" />Credit Notes</TabsTrigger>
          </TabsList>

          <TabsContent value="invoices">
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between gap-3">
                  <Select value={custFilter} onValueChange={setCustFilter}>
                    <SelectTrigger className="w-48"><SelectValue placeholder="All Customers" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">All Customers</SelectItem>
                      {customers.map(c => <SelectItem key={c.id} value={c.id}>{c.customer_name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <ExportButtons csvUrl="/api/invoices/export/csv" />
                </div>
              </CardHeader>
              <CardContent>
                {invLoading ? <div className="flex justify-center py-16"><Spinner className="w-6 h-6" /></div> : (
                  <Table>
                    <TableHeader><TableRow>
                      <TableHead>Invoice #</TableHead><TableHead>Customer</TableHead><TableHead>Date</TableHead><TableHead>Due</TableHead>
                      <TableHead className="text-right">Amount</TableHead><TableHead className="text-right">Balance</TableHead><TableHead>Status</TableHead><TableHead>Actions</TableHead>
                    </TableRow></TableHeader>
                    <TableBody>
                      {invoices.map(inv => (
                        <TableRow key={inv.id}>
                          <TableCell className="font-mono text-xs">{inv.invoice_number}</TableCell>
                          <TableCell className="text-sm">{inv.customer_name}</TableCell>
                          <TableCell className="text-sm">{formatDate(inv.invoice_date)}</TableCell>
                          <TableCell className="text-sm">{formatDate(inv.due_date)}</TableCell>
                          <TableCell className="text-right font-mono text-sm">{formatCurrency(inv.total_amount)}</TableCell>
                          <TableCell className="text-right font-mono text-sm text-emerald-400">{formatCurrency(inv.balance_due)}</TableCell>
                          <TableCell><Badge variant={statusVariant[inv.status] || 'outline'} className="text-[10px]">{inv.status}</Badge></TableCell>
                          <TableCell>
                            <div className="flex gap-1">
                              {inv.status === 'DRAFT' && <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => postInv.mutate(inv.id)}>Post</Button>}
                              {inv.balance_due > 0 && inv.status !== 'DRAFT' && <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => { setSelectedInvId(inv.id); setPayOpen(true) }}>Receive</Button>}
                              {inv.status !== 'DRAFT' && <a href={`/api/invoices/${inv.id}/pdf`} target="_blank" rel="noopener noreferrer"><Button size="sm" variant="ghost" className="h-7 text-xs"><Download className="w-3 h-3" /> PDF</Button></a>}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="customers">
            <Card><CardHeader className="flex flex-row items-center justify-between"><CardTitle>Customers</CardTitle><ExportButtons csvUrl="/api/customers/export/csv" /></CardHeader><CardContent>
              {custLoading ? <div className="flex justify-center py-16"><Spinner className="w-6 h-6" /></div> : (
                <Table><TableHeader><TableRow>
                  <TableHead>Code</TableHead><TableHead>Name</TableHead><TableHead>GSTIN</TableHead><TableHead>Contact</TableHead><TableHead className="text-right">Balance</TableHead><TableHead>Status</TableHead>
                </TableRow></TableHeader><TableBody>
                  {customers.map(c => (
                    <TableRow key={c.id}>
                      <TableCell className="font-mono text-xs">{c.customer_code}</TableCell>
                      <TableCell className="text-sm font-medium">{c.customer_name}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{c.gstin || '-'}</TableCell>
                      <TableCell className="text-sm">{c.contact_person || c.email || '-'}</TableCell>
                      <TableCell className="text-right font-mono text-sm text-emerald-400">{formatCurrency(c.current_balance)}</TableCell>
                      <TableCell><Badge variant={c.is_active ? 'success' : 'outline'} className="text-[10px]">{c.is_active ? 'Active' : 'Inactive'}</Badge></TableCell>
                    </TableRow>
                  ))}
                </TableBody></Table>
              )}
            </CardContent></Card>
          </TabsContent>

          <TabsContent value="aging">
            <Card><CardHeader className="flex flex-row items-center justify-between"><CardTitle>AR Aging Report</CardTitle><ExportButtons csvUrl="/api/aging/export/csv" /></CardHeader><CardContent>
              {agingLoading ? <div className="flex justify-center py-16"><Spinner className="w-6 h-6" /></div> : (
                <Table><TableHeader><TableRow>
                  <TableHead>Customer</TableHead><TableHead className="text-right">Current</TableHead><TableHead className="text-right">1-30</TableHead>
                  <TableHead className="text-right">31-60</TableHead><TableHead className="text-right">61-90</TableHead><TableHead className="text-right">90+</TableHead><TableHead className="text-right">Total</TableHead>
                </TableRow></TableHeader><TableBody>
                  {aging.map(r => (
                    <TableRow key={r.customer_id}>
                      <TableCell className="text-sm font-medium">{r.customer_name}</TableCell>
                      <TableCell className="text-right font-mono text-sm">{formatCurrency(r.current)}</TableCell>
                      <TableCell className="text-right font-mono text-sm text-amber-400">{formatCurrency(r.days_1_30)}</TableCell>
                      <TableCell className="text-right font-mono text-sm text-orange-400">{formatCurrency(r.days_31_60)}</TableCell>
                      <TableCell className="text-right font-mono text-sm text-red-400">{formatCurrency(r.days_61_90)}</TableCell>
                      <TableCell className="text-right font-mono text-sm text-red-500">{formatCurrency(r.over_90)}</TableCell>
                      <TableCell className="text-right font-mono text-sm font-bold">{formatCurrency(r.total)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody></Table>
              )}
            </CardContent></Card>
          </TabsContent>

          <TabsContent value="credit-notes">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>Credit Notes</CardTitle>
                <ExportButtons csvUrl="/api/credit-notes/export/csv" />
              </CardHeader>
              <CardContent>
                <div className="text-center py-8">
                  <FileX className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
                  <p className="text-muted-foreground text-sm">Credit notes for customer returns and adjustments</p>
                  <p className="text-xs text-muted-foreground mt-1">Create credit notes via the API to reduce customer balances</p>
                  <p className="text-xs text-muted-foreground mt-1">POST /api/credit-notes &bull; POST /api/credit-notes/:id/post &bull; POST /api/credit-notes/:id/apply</p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* Customer Form Dialog */}
      <Dialog open={custFormOpen} onOpenChange={setCustFormOpen}>
        <DialogContent className="sm:max-w-[500px]"><DialogHeader><DialogTitle>Add Customer</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1"><Label>Code</Label><Input value={cf.customer_code} onChange={e => setCf({ ...cf, customer_code: e.target.value })} placeholder="C-001" /></div>
              <div className="space-y-1"><Label>Name</Label><Input value={cf.customer_name} onChange={e => setCf({ ...cf, customer_name: e.target.value })} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1"><Label>GSTIN</Label><Input value={cf.gstin} onChange={e => setCf({ ...cf, gstin: e.target.value })} /></div>
              <div className="space-y-1"><Label>PAN</Label><Input value={cf.pan} onChange={e => setCf({ ...cf, pan: e.target.value })} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1"><Label>Email</Label><Input value={cf.email} onChange={e => setCf({ ...cf, email: e.target.value })} /></div>
              <div className="space-y-1"><Label>Phone</Label><Input value={cf.phone} onChange={e => setCf({ ...cf, phone: e.target.value })} /></div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCustFormOpen(false)}>Cancel</Button>
            <Button onClick={async () => { await createCust.mutateAsync(cf as any); setCustFormOpen(false) }} disabled={createCust.isPending}>{createCust.isPending && <Spinner />} Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Invoice Form Dialog */}
      <Dialog open={invFormOpen} onOpenChange={setInvFormOpen}>
        <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto"><DialogHeader><DialogTitle>New Invoice</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1"><Label>Customer</Label>
                <Select value={invF.customer_id} onValueChange={v => setInvF({ ...invF, customer_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Select customer" /></SelectTrigger>
                  <SelectContent>{customers.map(c => <SelectItem key={c.id} value={c.id}>{c.customer_name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1"><Label>Invoice Date</Label><Input type="date" value={invF.invoice_date} onChange={e => setInvF({ ...invF, invoice_date: e.target.value })} /></div>
            </div>
            <div className="space-y-1"><Label>Due Date</Label><Input type="date" value={invF.due_date} onChange={e => setInvF({ ...invF, due_date: e.target.value })} /></div>
            <div className="space-y-1">
              <Label>Lines</Label>
              {invF.lines.map((l, i) => (
                <div key={i} className="grid grid-cols-[1fr_60px_80px_60px] gap-2">
                  <Input placeholder="Description" value={l.description} onChange={e => { const n = [...invF.lines]; n[i] = { ...n[i], description: e.target.value }; setInvF({ ...invF, lines: n }) }} className="h-8 text-xs" />
                  <Input type="number" min="1" value={l.quantity} onChange={e => { const n = [...invF.lines]; n[i] = { ...n[i], quantity: +e.target.value }; setInvF({ ...invF, lines: n }) }} className="h-8 text-xs" />
                  <Input type="number" step="0.01" value={l.unit_price} onChange={e => { const n = [...invF.lines]; n[i] = { ...n[i], unit_price: +e.target.value }; setInvF({ ...invF, lines: n }) }} className="h-8 text-xs" />
                  <Input type="number" value={l.gst_rate} onChange={e => { const n = [...invF.lines]; n[i] = { ...n[i], gst_rate: +e.target.value }; setInvF({ ...invF, lines: n }) }} className="h-8 text-xs" />
                </div>
              ))}
              <Button type="button" variant="outline" size="sm" onClick={() => setInvF({ ...invF, lines: [...invF.lines, { description: '', quantity: 1, unit_price: 0, gst_rate: 18 }] })}><Plus className="w-3 h-3" /> Add Line</Button>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setInvFormOpen(false)}>Cancel</Button>
            <Button onClick={async () => { await createInv.mutateAsync(invF); setInvFormOpen(false) }} disabled={createInv.isPending}>{createInv.isPending && <Spinner />} Create Invoice</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Payment Dialog */}
      <Dialog open={payOpen} onOpenChange={setPayOpen}>
        <DialogContent className="sm:max-w-[400px]"><DialogHeader><DialogTitle>Receive Payment</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1"><Label>Amount</Label><Input type="number" step="0.01" value={payF.amount} onChange={e => setPayF({ ...payF, amount: e.target.value })} /></div>
            <div className="space-y-1"><Label>Method</Label>
              <Select value={payF.payment_method} onValueChange={v => setPayF({ ...payF, payment_method: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="BANK_TRANSFER">Bank Transfer</SelectItem><SelectItem value="CHEQUE">Cheque</SelectItem><SelectItem value="CASH">Cash</SelectItem><SelectItem value="UPI">UPI</SelectItem></SelectContent>
              </Select>
            </div>
            <div className="space-y-1"><Label>Reference</Label><Input value={payF.reference_number} onChange={e => setPayF({ ...payF, reference_number: e.target.value })} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPayOpen(false)}>Cancel</Button>
            <Button onClick={async () => { if (selectedInvId) { await payInv.mutateAsync({ id: selectedInvId, amount: +payF.amount, payment_method: payF.payment_method, receipt_date: new Date().toISOString().split('T')[0] }); setPayOpen(false) } }} disabled={payInv.isPending}>{payInv.isPending && <Spinner />} Receive</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
