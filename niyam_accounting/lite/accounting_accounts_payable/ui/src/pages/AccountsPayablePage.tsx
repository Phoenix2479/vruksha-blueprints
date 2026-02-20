import { useState } from 'react'
import { Users, FileText, CreditCard, BarChart3, Plus, FileX } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell, TableFooter } from '@/components/ui/table'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { Spinner } from '@/components/ui/spinner'
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from '@/components/ui/select'
import { useVendors, useBills, useAging, usePostBill } from '@/hooks/useAP'
import { VendorFormDialog } from '@/components/VendorFormDialog'
import { BillFormDialog } from '@/components/BillFormDialog'
import { PaymentDialog } from '@/components/PaymentDialog'
import { formatCurrency, formatDate } from '@/lib/utils'
import { ExportButtons } from '@/components/ExportButtons'

const statusVariant: Record<string, 'secondary' | 'warning' | 'info' | 'success' | 'destructive'> = {
  DRAFT: 'secondary', PENDING: 'warning', PARTIAL: 'info', PAID: 'success', OVERDUE: 'destructive',
}

export function AccountsPayablePage() {
  const [vendorFilter, setVendorFilter] = useState('')
  const [vendorFormOpen, setVendorFormOpen] = useState(false)
  const [billFormOpen, setBillFormOpen] = useState(false)
  const [paymentOpen, setPaymentOpen] = useState(false)
  const [selectedBillId, setSelectedBillId] = useState<string | null>(null)

  const { data: vendorsData, isLoading: vendorsLoading } = useVendors()
  const { data: billsData, isLoading: billsLoading } = useBills({ vendor_id: vendorFilter || undefined })
  const { data: agingData, isLoading: agingLoading } = useAging()
  const postBill = usePostBill()

  const vendors = vendorsData?.data || []
  const bills = billsData?.data || []
  const aging = agingData?.data || []

  const totalOutstanding = bills.reduce((s, b) => s + b.balance_due, 0)
  const openBills = bills.filter(b => b.status !== 'PAID').length

  return (
    <div className="min-h-screen p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Accounts Payable</h1>
            <p className="text-muted-foreground text-sm mt-1">Manage vendors, bills, and payments</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setVendorFormOpen(true)}><Plus className="w-4 h-4" /> Add Vendor</Button>
            <Button size="sm" onClick={() => setBillFormOpen(true)}><Plus className="w-4 h-4" /> New Bill</Button>
          </div>
        </div>

        <div className="grid grid-cols-4 gap-3">
          <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Total Vendors</p><p className="text-2xl font-bold mt-1">{vendors.length}</p></CardContent></Card>
          <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Open Bills</p><p className="text-2xl font-bold mt-1 text-amber-400">{openBills}</p></CardContent></Card>
          <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Outstanding</p><p className="text-2xl font-bold mt-1 text-red-400">{formatCurrency(totalOutstanding)}</p></CardContent></Card>
          <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Overdue</p><p className="text-2xl font-bold mt-1 text-red-400">{bills.filter(b => b.status === 'OVERDUE').length}</p></CardContent></Card>
        </div>

        <Tabs defaultValue="bills">
          <TabsList>
            <TabsTrigger value="bills"><FileText className="w-4 h-4 mr-1" />Bills</TabsTrigger>
            <TabsTrigger value="vendors"><Users className="w-4 h-4 mr-1" />Vendors</TabsTrigger>
            <TabsTrigger value="aging"><BarChart3 className="w-4 h-4 mr-1" />AP Aging</TabsTrigger>
            <TabsTrigger value="debit-notes"><FileX className="w-4 h-4 mr-1" />Debit Notes</TabsTrigger>
          </TabsList>

          <TabsContent value="bills">
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between gap-3">
                  <Select value={vendorFilter} onValueChange={setVendorFilter}>
                    <SelectTrigger className="w-48"><SelectValue placeholder="All Vendors" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">All Vendors</SelectItem>
                      {vendors.map(v => <SelectItem key={v.id} value={v.id}>{v.vendor_name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <ExportButtons csvUrl="/api/bills/export/csv" />
                </div>
              </CardHeader>
              <CardContent>
                {billsLoading ? <div className="flex justify-center py-16"><Spinner className="w-6 h-6" /></div> : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Bill #</TableHead><TableHead>Vendor</TableHead><TableHead>Date</TableHead><TableHead>Due</TableHead>
                        <TableHead className="text-right">Amount</TableHead><TableHead className="text-right">Balance</TableHead><TableHead>Status</TableHead><TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {bills.map(b => (
                        <TableRow key={b.id}>
                          <TableCell className="font-mono text-xs">{b.bill_number}</TableCell>
                          <TableCell className="text-sm">{b.vendor_name}</TableCell>
                          <TableCell className="text-sm">{formatDate(b.bill_date)}</TableCell>
                          <TableCell className="text-sm">{formatDate(b.due_date)}</TableCell>
                          <TableCell className="text-right font-mono text-sm">{formatCurrency(b.total_amount)}</TableCell>
                          <TableCell className="text-right font-mono text-sm text-red-400">{formatCurrency(b.balance_due)}</TableCell>
                          <TableCell><Badge variant={statusVariant[b.status] || 'outline'} className="text-[10px]">{b.status}</Badge></TableCell>
                          <TableCell>
                            <div className="flex gap-1">
                              {b.status === 'DRAFT' && <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => postBill.mutate(b.id)}>Post</Button>}
                              {b.balance_due > 0 && b.status !== 'DRAFT' && <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => { setSelectedBillId(b.id); setPaymentOpen(true) }}>Pay</Button>}
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

          <TabsContent value="vendors">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between"><CardTitle>Vendors</CardTitle><ExportButtons csvUrl="/api/vendors/export/csv" /></CardHeader>
              <CardContent>
                {vendorsLoading ? <div className="flex justify-center py-16"><Spinner className="w-6 h-6" /></div> : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Code</TableHead><TableHead>Name</TableHead><TableHead>GSTIN</TableHead><TableHead>Contact</TableHead>
                        <TableHead className="text-right">Balance</TableHead><TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {vendors.map(v => (
                        <TableRow key={v.id}>
                          <TableCell className="font-mono text-xs">{v.vendor_code}</TableCell>
                          <TableCell className="text-sm font-medium">{v.vendor_name}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">{v.gstin || '-'}</TableCell>
                          <TableCell className="text-sm">{v.contact_person || v.email || '-'}</TableCell>
                          <TableCell className="text-right font-mono text-sm text-red-400">{formatCurrency(v.current_balance)}</TableCell>
                          <TableCell><Badge variant={v.is_active ? 'success' : 'outline'} className="text-[10px]">{v.is_active ? 'Active' : 'Inactive'}</Badge></TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="aging">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between"><CardTitle>AP Aging Report</CardTitle><ExportButtons csvUrl="/api/aging/export/csv" pdfUrl="/api/aging/export/pdf" /></CardHeader>
              <CardContent>
                {agingLoading ? <div className="flex justify-center py-16"><Spinner className="w-6 h-6" /></div> : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Vendor</TableHead><TableHead className="text-right">Current</TableHead><TableHead className="text-right">1-30</TableHead>
                        <TableHead className="text-right">31-60</TableHead><TableHead className="text-right">61-90</TableHead><TableHead className="text-right">90+</TableHead><TableHead className="text-right">Total</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {aging.map(r => (
                        <TableRow key={r.vendor_id}>
                          <TableCell className="text-sm font-medium">{r.vendor_name}</TableCell>
                          <TableCell className="text-right font-mono text-sm">{formatCurrency(r.current)}</TableCell>
                          <TableCell className="text-right font-mono text-sm text-amber-400">{formatCurrency(r.days_1_30)}</TableCell>
                          <TableCell className="text-right font-mono text-sm text-orange-400">{formatCurrency(r.days_31_60)}</TableCell>
                          <TableCell className="text-right font-mono text-sm text-red-400">{formatCurrency(r.days_61_90)}</TableCell>
                          <TableCell className="text-right font-mono text-sm text-red-500">{formatCurrency(r.over_90)}</TableCell>
                          <TableCell className="text-right font-mono text-sm font-bold">{formatCurrency(r.total)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="debit-notes">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>Debit Notes</CardTitle>
                <ExportButtons csvUrl="/api/debit-notes/export/csv" />
              </CardHeader>
              <CardContent>
                <div className="text-center py-8">
                  <FileX className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
                  <p className="text-muted-foreground text-sm">Debit notes for vendor returns and corrections</p>
                  <p className="text-xs text-muted-foreground mt-1">Create debit notes via the API to reduce vendor balances</p>
                  <p className="text-xs text-muted-foreground mt-1">POST /api/debit-notes &bull; POST /api/debit-notes/:id/post &bull; POST /api/debit-notes/:id/apply</p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      <VendorFormDialog open={vendorFormOpen} onOpenChange={setVendorFormOpen} />
      <BillFormDialog open={billFormOpen} onOpenChange={setBillFormOpen} vendors={vendors} />
      <PaymentDialog open={paymentOpen} onOpenChange={setPaymentOpen} billId={selectedBillId} vendors={vendors} />
    </div>
  )
}
