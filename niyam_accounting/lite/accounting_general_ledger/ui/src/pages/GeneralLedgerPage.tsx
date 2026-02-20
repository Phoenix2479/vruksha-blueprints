import { useState } from 'react'
import { BookOpen, Search, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell, TableFooter } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Spinner } from '@/components/ui/spinner'
import { useLedger, useTrialBalance, useBalances } from '@/hooks/useLedger'
import { formatCurrency, formatDate } from '@/lib/utils'
import { ExportButtons } from '@/components/ExportButtons'

export function GeneralLedgerPage() {
  const [accountId, setAccountId] = useState('')
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null)
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  const { data: ledgerData, isLoading: ledgerLoading } = useLedger(
    selectedAccountId,
    { from_date: dateFrom || undefined, to_date: dateTo || undefined }
  )
  const { data: tbData, isLoading: tbLoading } = useTrialBalance()
  const { data: balData, isLoading: balLoading } = useBalances()

  const ledger = ledgerData?.data || []
  const trialBalance = tbData?.data || []
  const balances = balData?.data || []

  const tbTotalDebit = trialBalance.reduce((s, r) => s + r.debit_total, 0)
  const tbTotalCredit = trialBalance.reduce((s, r) => s + r.credit_total, 0)

  return (
    <div className="min-h-screen p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">General Ledger</h1>
          <p className="text-muted-foreground text-sm mt-1">View account ledgers, trial balance, and account balances</p>
        </div>

        <Tabs defaultValue="ledger">
          <TabsList>
            <TabsTrigger value="ledger">Account Ledger</TabsTrigger>
            <TabsTrigger value="trial-balance">Trial Balance</TabsTrigger>
            <TabsTrigger value="balances">Account Balances</TabsTrigger>
          </TabsList>

          <TabsContent value="ledger">
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center gap-3">
                  <Input placeholder="Enter Account ID" value={accountId} onChange={e => setAccountId(e.target.value)} className="max-w-xs" />
                  <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="w-40" />
                  <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="w-40" />
                  <Button size="sm" onClick={() => setSelectedAccountId(accountId)}>
                    <Search className="w-4 h-4" /> View Ledger
                  </Button>
                  {selectedAccountId && <ExportButtons csvUrl={`/api/ledger/${selectedAccountId}/export/csv?start_date=${dateFrom}&end_date=${dateTo}`} />}
                </div>
              </CardHeader>
              <CardContent>
                {!selectedAccountId ? (
                  <div className="text-center py-16">
                    <BookOpen className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
                    <p className="text-muted-foreground">Enter an account ID to view its ledger</p>
                  </div>
                ) : ledgerLoading ? (
                  <div className="flex justify-center py-16"><Spinner className="w-6 h-6" /></div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Entry #</TableHead>
                        <TableHead>Description</TableHead>
                        <TableHead className="text-right">Debit</TableHead>
                        <TableHead className="text-right">Credit</TableHead>
                        <TableHead className="text-right">Balance</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {ledger.map(e => (
                        <TableRow key={e.id}>
                          <TableCell className="text-sm">{formatDate(e.entry_date)}</TableCell>
                          <TableCell className="font-mono text-xs">{e.entry_number}</TableCell>
                          <TableCell className="text-sm">{e.description}</TableCell>
                          <TableCell className="text-right font-mono text-sm">{e.debit_amount > 0 ? formatCurrency(e.debit_amount) : ''}</TableCell>
                          <TableCell className="text-right font-mono text-sm">{e.credit_amount > 0 ? formatCurrency(e.credit_amount) : ''}</TableCell>
                          <TableCell className="text-right font-mono text-sm font-medium">{formatCurrency(e.running_balance)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="trial-balance">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between"><CardTitle>Trial Balance</CardTitle><ExportButtons csvUrl="/api/trial-balance/export/csv" pdfUrl="/api/trial-balance/export/pdf" /></CardHeader>
              <CardContent>
                {tbLoading ? <div className="flex justify-center py-16"><Spinner className="w-6 h-6" /></div> : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Code</TableHead>
                        <TableHead>Account</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead className="text-right">Debit</TableHead>
                        <TableHead className="text-right">Credit</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {trialBalance.map(r => (
                        <TableRow key={r.account_id}>
                          <TableCell className="font-mono text-xs">{r.account_code}</TableCell>
                          <TableCell className="text-sm">{r.account_name}</TableCell>
                          <TableCell><Badge variant="outline" className="text-[10px]">{r.account_type}</Badge></TableCell>
                          <TableCell className="text-right font-mono text-sm">{r.debit_total > 0 ? formatCurrency(r.debit_total) : ''}</TableCell>
                          <TableCell className="text-right font-mono text-sm">{r.credit_total > 0 ? formatCurrency(r.credit_total) : ''}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                    <TableFooter>
                      <TableRow>
                        <TableCell colSpan={3} className="font-bold">Total</TableCell>
                        <TableCell className="text-right font-mono font-bold">{formatCurrency(tbTotalDebit)}</TableCell>
                        <TableCell className="text-right font-mono font-bold">{formatCurrency(tbTotalCredit)}</TableCell>
                      </TableRow>
                    </TableFooter>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="balances">
            <Card>
              <CardHeader><CardTitle>Account Balances</CardTitle></CardHeader>
              <CardContent>
                {balLoading ? <div className="flex justify-center py-16"><Spinner className="w-6 h-6" /></div> : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Code</TableHead>
                        <TableHead>Account</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead className="text-right">Balance</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {balances.filter(b => b.current_balance !== 0).map(b => (
                        <TableRow key={b.account_id} className="cursor-pointer" onClick={() => { setAccountId(b.account_id); setSelectedAccountId(b.account_id) }}>
                          <TableCell className="font-mono text-xs">{b.account_code}</TableCell>
                          <TableCell className="text-sm">{b.account_name}</TableCell>
                          <TableCell><Badge variant="outline" className="text-[10px]">{b.account_type}</Badge></TableCell>
                          <TableCell className={`text-right font-mono text-sm font-medium ${b.current_balance >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{formatCurrency(Math.abs(b.current_balance))}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
