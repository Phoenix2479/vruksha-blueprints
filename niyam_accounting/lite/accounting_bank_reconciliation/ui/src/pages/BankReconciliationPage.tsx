import { useState } from 'react'
import { Landmark, Plus, CheckCircle, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Spinner } from '@/components/ui/spinner'
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useBankAccounts, useBankTransactions, useReconciliationSummary, useCreateBankAccount, useCreateTransaction, useReconcile } from '@/hooks/useBank'
import { formatCurrency, formatDate } from '@/lib/utils'
import { ExportButtons } from '@/components/ExportButtons'

export function BankReconciliationPage() {
  const [selectedBank, setSelectedBank] = useState<string | null>(null)
  const [bankFormOpen, setBankFormOpen] = useState(false)
  const [txnFormOpen, setTxnFormOpen] = useState(false)
  const [bankF, setBankF] = useState({ bank_name: '', account_number: '', account_name: '', ifsc_code: '' })
  const [txnF, setTxnF] = useState({ transaction_date: new Date().toISOString().split('T')[0], description: '', debit_amount: 0, credit_amount: 0, reference_number: '' })

  const { data: banksData, isLoading: banksLoading } = useBankAccounts()
  const { data: txnsData, isLoading: txnsLoading } = useBankTransactions(selectedBank)
  const { data: summaryData } = useReconciliationSummary(selectedBank)
  const createBank = useCreateBankAccount()
  const createTxn = useCreateTransaction()
  const reconcile = useReconcile()

  const banks = banksData?.data || []
  const transactions = txnsData?.data || []
  const summary = summaryData?.data

  return (
    <div className="min-h-screen p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Bank Reconciliation</h1>
            <p className="text-muted-foreground text-sm mt-1">Reconcile bank statements with book entries</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setBankFormOpen(true)}><Plus className="w-4 h-4" /> Add Bank</Button>
            {selectedBank && <Button size="sm" onClick={() => setTxnFormOpen(true)}><Plus className="w-4 h-4" /> Add Transaction</Button>}
          </div>
        </div>

        {/* Bank Selector + Summary */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <Card className="md:col-span-1">
            <CardHeader className="pb-2"><CardTitle className="text-sm">Select Bank</CardTitle></CardHeader>
            <CardContent>
              <Select value={selectedBank || ''} onValueChange={setSelectedBank}>
                <SelectTrigger><SelectValue placeholder="Choose bank account" /></SelectTrigger>
                <SelectContent>{banks.map(b => <SelectItem key={b.id} value={b.id}>{b.bank_name} - {b.account_number}</SelectItem>)}</SelectContent>
              </Select>
            </CardContent>
          </Card>
          {summary && (
            <>
              <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Bank Balance</p><p className="text-xl font-bold mt-1">{formatCurrency(summary.bank_balance)}</p></CardContent></Card>
              <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Book Balance</p><p className="text-xl font-bold mt-1">{formatCurrency(summary.book_balance)}</p></CardContent></Card>
              <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Unreconciled</p><p className="text-xl font-bold mt-1 text-amber-400">{summary.unreconciled_count} items</p></CardContent></Card>
            </>
          )}
        </div>

        {/* Transactions */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between"><CardTitle>Bank Transactions</CardTitle>{selectedBank && <ExportButtons csvUrl={`/api/bank-accounts/${selectedBank}/transactions/export/csv`} />}</CardHeader>
          <CardContent>
            {!selectedBank ? (
              <div className="text-center py-16"><Landmark className="w-12 h-12 text-muted-foreground mx-auto mb-3" /><p className="text-muted-foreground">Select a bank account to view transactions</p></div>
            ) : txnsLoading ? (
              <div className="flex justify-center py-16"><Spinner className="w-6 h-6" /></div>
            ) : (
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Date</TableHead><TableHead>Description</TableHead><TableHead>Reference</TableHead>
                  <TableHead className="text-right">Debit</TableHead><TableHead className="text-right">Credit</TableHead><TableHead className="text-right">Balance</TableHead><TableHead>Status</TableHead><TableHead>Action</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {transactions.map(t => (
                    <TableRow key={t.id}>
                      <TableCell className="text-sm">{formatDate(t.transaction_date)}</TableCell>
                      <TableCell className="text-sm">{t.description}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{t.reference_number || '-'}</TableCell>
                      <TableCell className="text-right font-mono text-sm">{t.debit_amount > 0 ? formatCurrency(t.debit_amount) : ''}</TableCell>
                      <TableCell className="text-right font-mono text-sm">{t.credit_amount > 0 ? formatCurrency(t.credit_amount) : ''}</TableCell>
                      <TableCell className="text-right font-mono text-sm">{formatCurrency(t.balance)}</TableCell>
                      <TableCell>
                        {t.is_reconciled
                          ? <Badge variant="success" className="text-[10px]"><CheckCircle className="w-3 h-3 mr-1" />Reconciled</Badge>
                          : <Badge variant="warning" className="text-[10px]"><AlertCircle className="w-3 h-3 mr-1" />Pending</Badge>}
                      </TableCell>
                      <TableCell>
                        {!t.is_reconciled && <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => reconcile.mutate({ id: t.id })} disabled={reconcile.isPending}>Reconcile</Button>}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Add Bank Dialog */}
      <Dialog open={bankFormOpen} onOpenChange={setBankFormOpen}>
        <DialogContent><DialogHeader><DialogTitle>Add Bank Account</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1"><Label>Bank Name</Label><Input value={bankF.bank_name} onChange={e => setBankF({ ...bankF, bank_name: e.target.value })} /></div>
              <div className="space-y-1"><Label>Account Name</Label><Input value={bankF.account_name} onChange={e => setBankF({ ...bankF, account_name: e.target.value })} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1"><Label>Account Number</Label><Input value={bankF.account_number} onChange={e => setBankF({ ...bankF, account_number: e.target.value })} /></div>
              <div className="space-y-1"><Label>IFSC</Label><Input value={bankF.ifsc_code} onChange={e => setBankF({ ...bankF, ifsc_code: e.target.value })} /></div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBankFormOpen(false)}>Cancel</Button>
            <Button onClick={async () => { await createBank.mutateAsync(bankF); setBankFormOpen(false) }} disabled={createBank.isPending}>{createBank.isPending && <Spinner />} Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Transaction Dialog */}
      <Dialog open={txnFormOpen} onOpenChange={setTxnFormOpen}>
        <DialogContent><DialogHeader><DialogTitle>Add Transaction</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1"><Label>Date</Label><Input type="date" value={txnF.transaction_date} onChange={e => setTxnF({ ...txnF, transaction_date: e.target.value })} /></div>
            <div className="space-y-1"><Label>Description</Label><Input value={txnF.description} onChange={e => setTxnF({ ...txnF, description: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1"><Label>Debit (Withdrawal)</Label><Input type="number" step="0.01" value={txnF.debit_amount} onChange={e => setTxnF({ ...txnF, debit_amount: +e.target.value })} /></div>
              <div className="space-y-1"><Label>Credit (Deposit)</Label><Input type="number" step="0.01" value={txnF.credit_amount} onChange={e => setTxnF({ ...txnF, credit_amount: +e.target.value })} /></div>
            </div>
            <div className="space-y-1"><Label>Reference</Label><Input value={txnF.reference_number} onChange={e => setTxnF({ ...txnF, reference_number: e.target.value })} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTxnFormOpen(false)}>Cancel</Button>
            <Button onClick={async () => { await createTxn.mutateAsync({ bankId: selectedBank, ...txnF }); setTxnFormOpen(false) }} disabled={createTxn.isPending}>{createTxn.isPending && <Spinner />} Add</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
