import { useState } from 'react'
import { Plus, FileText, CheckCircle, Clock, XCircle, Search, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Spinner } from '@/components/ui/spinner'
import { useJournalEntries, usePostJournalEntry, useVoidJournalEntry } from '@/hooks/useJournal'
import { JournalEntryFormDialog } from '@/components/JournalEntryFormDialog'
import { formatCurrency, formatDate } from '@/lib/utils'
import { ExportButtons } from '@/components/ExportButtons'
import type { JournalEntry, JournalStatus } from '@/types'

const statusConfig: Record<JournalStatus, { variant: 'secondary' | 'warning' | 'success' | 'destructive'; icon: typeof FileText }> = {
  DRAFT: { variant: 'secondary', icon: FileText },
  POSTED: { variant: 'success', icon: CheckCircle },
  VOID: { variant: 'destructive', icon: XCircle },
}

export function JournalEntriesPage() {
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [formOpen, setFormOpen] = useState(false)
  const [selected, setSelected] = useState<JournalEntry | null>(null)

  const { data, isLoading, refetch } = useJournalEntries({ status: statusFilter || undefined, search: search || undefined, limit: 100 })
  const postEntry = usePostJournalEntry()
  const voidEntry = useVoidJournalEntry()

  const entries = data?.data || []

  const handlePost = async (entry: JournalEntry) => {
    if (!entry.is_balanced) { alert('Cannot post unbalanced entry'); return }
    if (confirm(`Post journal entry ${entry.entry_number}?`)) {
      await postEntry.mutateAsync(entry.id)
      setSelected(null)
    }
  }

  const handleVoid = async (entry: JournalEntry) => {
    if (confirm(`Void journal entry ${entry.entry_number}? This cannot be undone.`)) {
      await voidEntry.mutateAsync(entry.id)
      setSelected(null)
    }
  }

  return (
    <div className="min-h-screen p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Journal Entries</h1>
            <p className="text-muted-foreground text-sm mt-1">Create and manage accounting journal entries</p>
          </div>
          <div className="flex gap-2 items-center">
            <ExportButtons csvUrl="/api/journal-entries/export/csv" pdfUrl="/api/journal-entries/export/pdf" />
            <Button size="sm" onClick={() => setFormOpen(true)}>
              <Plus className="w-4 h-4" /> New Entry
            </Button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-4 gap-3">
          {[
            { label: 'Total Entries', value: entries.length },
            { label: 'Draft', value: entries.filter(e => e.status === 'DRAFT').length },
            { label: 'Posted', value: entries.filter(e => e.status === 'POSTED').length },
            { label: 'Total Debits', value: formatCurrency(entries.reduce((s, e) => s + e.total_debit, 0)) },
          ].map(s => (
            <Card key={s.label}><CardContent className="p-4">
              <p className="text-xs text-muted-foreground">{s.label}</p>
              <p className="text-2xl font-bold mt-1">{s.value}</p>
            </CardContent></Card>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Card className="lg:col-span-2">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-3">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input placeholder="Search entries..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
                </div>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-32"><SelectValue placeholder="All Status" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">All</SelectItem>
                    <SelectItem value="DRAFT">Draft</SelectItem>
                    <SelectItem value="POSTED">Posted</SelectItem>
                    <SelectItem value="VOID">Void</SelectItem>
                  </SelectContent>
                </Select>
                <Button variant="ghost" size="icon" onClick={() => refetch()}><RefreshCw className="w-4 h-4" /></Button>
              </div>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="flex justify-center py-16"><Spinner className="w-6 h-6" /></div>
              ) : entries.length === 0 ? (
                <div className="text-center py-16">
                  <FileText className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
                  <p className="text-muted-foreground">No journal entries found</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Entry #</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead className="text-right">Debit</TableHead>
                      <TableHead className="text-right">Credit</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {entries.map(e => {
                      const cfg = statusConfig[e.status]
                      return (
                        <TableRow key={e.id} className={`cursor-pointer ${selected?.id === e.id ? 'bg-accent' : ''}`} onClick={() => setSelected(e)}>
                          <TableCell className="font-mono text-xs">{e.entry_number}</TableCell>
                          <TableCell className="text-sm">{formatDate(e.entry_date)}</TableCell>
                          <TableCell className="text-sm max-w-[200px] truncate">{e.description}</TableCell>
                          <TableCell className="text-right font-mono text-sm text-emerald-400">{formatCurrency(e.total_debit)}</TableCell>
                          <TableCell className="text-right font-mono text-sm text-red-400">{formatCurrency(e.total_credit)}</TableCell>
                          <TableCell>
                            <Badge variant={cfg.variant} className="text-[10px]">
                              <cfg.icon className="w-3 h-3 mr-1" />{e.status}
                            </Badge>
                            {!e.is_balanced && <Badge variant="destructive" className="ml-1 text-[10px]">Unbalanced</Badge>}
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          {/* Detail Panel */}
          <Card>
            <CardHeader><CardTitle className="text-base">Entry Details</CardTitle></CardHeader>
            <CardContent>
              {selected ? (
                <div className="space-y-4">
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="font-mono text-lg font-bold">{selected.entry_number}</p>
                      <p className="text-xs text-muted-foreground">{formatDate(selected.entry_date)}</p>
                    </div>
                    <Badge variant={statusConfig[selected.status].variant}>{selected.status}</Badge>
                  </div>
                  <p className="text-sm">{selected.description}</p>
                  {selected.reference_number && <p className="text-xs text-muted-foreground">Ref: {selected.reference_number}</p>}
                  <Separator />
                  <div className="space-y-2">
                    <p className="text-xs text-muted-foreground font-medium">Line Items</p>
                    {selected.lines?.map((line, i) => (
                      <div key={i} className="flex items-center justify-between text-sm py-1 border-b border-border/50 last:border-0">
                        <span className="truncate flex-1">{line.account_name || line.account_id}</span>
                        {line.debit_amount > 0 && <span className="text-emerald-400 font-mono ml-2">Dr {formatCurrency(line.debit_amount)}</span>}
                        {line.credit_amount > 0 && <span className="text-red-400 font-mono ml-2">Cr {formatCurrency(line.credit_amount)}</span>}
                      </div>
                    ))}
                  </div>
                  <Separator />
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div><p className="text-xs text-muted-foreground">Total Debit</p><p className="font-mono text-emerald-400">{formatCurrency(selected.total_debit)}</p></div>
                    <div><p className="text-xs text-muted-foreground">Total Credit</p><p className="font-mono text-red-400">{formatCurrency(selected.total_credit)}</p></div>
                  </div>
                  <div className="flex gap-2">
                    {selected.status === 'DRAFT' && (
                      <>
                        <Button size="sm" className="flex-1" onClick={() => handlePost(selected)} disabled={postEntry.isPending}>
                          {postEntry.isPending ? <Spinner /> : <CheckCircle className="w-4 h-4" />} Post
                        </Button>
                        <Button size="sm" variant="destructive" className="flex-1" onClick={() => handleVoid(selected)} disabled={voidEntry.isPending}>
                          <XCircle className="w-4 h-4" /> Void
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              ) : (
                <div className="text-center py-12"><p className="text-sm text-muted-foreground">Select an entry to view details</p></div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <JournalEntryFormDialog open={formOpen} onOpenChange={setFormOpen} />
    </div>
  )
}
