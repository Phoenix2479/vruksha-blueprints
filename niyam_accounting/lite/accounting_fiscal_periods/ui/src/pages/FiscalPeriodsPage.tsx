import { useState } from 'react'
import { Calendar, Lock, Unlock, Plus, AlertTriangle, Building2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { Spinner } from '@/components/ui/spinner'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useFiscalYears, usePeriods, useCostCenters, useCreateFiscalYear, useCloseFiscalYear, useClosePeriod, useReopenPeriod, useCreateCostCenter } from '@/hooks/useFiscal'
import { formatDate } from '@/lib/utils'
import { ExportButtons } from '@/components/ExportButtons'

export function FiscalPeriodsPage() {
  const [fyFormOpen, setFyFormOpen] = useState(false)
  const [ccFormOpen, setCcFormOpen] = useState(false)
  const [closeConfirmId, setCloseConfirmId] = useState<string | null>(null)
  const [fyF, setFyF] = useState({ name: '', start_date: '', end_date: '' })
  const [ccF, setCcF] = useState({ code: '', name: '', description: '' })

  const { data: fyData, isLoading: fyLoading } = useFiscalYears()
  const { data: periodData, isLoading: periodLoading } = usePeriods()
  const { data: ccData, isLoading: ccLoading } = useCostCenters()
  const createFY = useCreateFiscalYear()
  const closeFY = useCloseFiscalYear()
  const closePeriod = useClosePeriod()
  const reopenPeriod = useReopenPeriod()
  const createCC = useCreateCostCenter()

  const fiscalYears = fyData?.data || []
  const periods = periodData?.data || []
  const costCenters = ccData?.data || []

  const statusVariant: Record<string, any> = { open: 'success', closed: 'secondary', active: 'success', inactive: 'secondary' }

  return (
    <div className="min-h-screen p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Fiscal Periods</h1>
            <p className="text-muted-foreground text-sm mt-1">Manage fiscal years, periods, and year-end closing</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setCcFormOpen(true)}><Plus className="w-4 h-4" /> Cost Center</Button>
            <Button size="sm" onClick={() => setFyFormOpen(true)}><Plus className="w-4 h-4" /> New Fiscal Year</Button>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Fiscal Years</p><p className="text-2xl font-bold mt-1">{fiscalYears.length}</p></CardContent></Card>
          <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Active Periods</p><p className="text-2xl font-bold mt-1 text-emerald-400">{periods.filter(p => p.status === 'open').length}</p></CardContent></Card>
          <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Cost Centers</p><p className="text-2xl font-bold mt-1">{costCenters.length}</p></CardContent></Card>
        </div>

        <Tabs defaultValue="fiscal-years">
          <TabsList>
            <TabsTrigger value="fiscal-years"><Calendar className="w-4 h-4 mr-1" />Fiscal Years</TabsTrigger>
            <TabsTrigger value="periods"><Calendar className="w-4 h-4 mr-1" />Periods</TabsTrigger>
            <TabsTrigger value="cost-centers"><Building2 className="w-4 h-4 mr-1" />Cost Centers</TabsTrigger>
          </TabsList>

          <TabsContent value="fiscal-years">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between"><CardTitle>Fiscal Years</CardTitle><ExportButtons csvUrl="/api/fiscal-years/export/csv" /></CardHeader>
              <CardContent>
                {fyLoading ? <div className="flex justify-center py-16"><Spinner className="w-6 h-6" /></div> : (
                  <Table>
                    <TableHeader><TableRow>
                      <TableHead>Name</TableHead><TableHead>Start</TableHead><TableHead>End</TableHead><TableHead>Status</TableHead><TableHead>Actions</TableHead>
                    </TableRow></TableHeader>
                    <TableBody>
                      {fiscalYears.map(fy => (
                        <TableRow key={fy.id}>
                          <TableCell className="text-sm font-medium">{fy.name}</TableCell>
                          <TableCell className="text-sm">{formatDate(fy.start_date)}</TableCell>
                          <TableCell className="text-sm">{formatDate(fy.end_date)}</TableCell>
                          <TableCell>
                            <Badge variant={statusVariant[fy.status] || 'outline'} className="text-[10px]">{fy.status}</Badge>
                            {fy.is_active && <Badge variant="info" className="ml-1 text-[10px]">Active</Badge>}
                          </TableCell>
                          <TableCell>
                            {fy.status !== 'closed' && (
                              <Button size="sm" variant="destructive" className="h-7 text-xs" onClick={() => setCloseConfirmId(fy.id)}>
                                <Lock className="w-3 h-3 mr-1" /> Close Year
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="periods">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between"><CardTitle>Accounting Periods</CardTitle><ExportButtons csvUrl="/api/periods/export/csv" /></CardHeader>
              <CardContent>
                {periodLoading ? <div className="flex justify-center py-16"><Spinner className="w-6 h-6" /></div> : (
                  <Table>
                    <TableHeader><TableRow>
                      <TableHead>#</TableHead><TableHead>Name</TableHead><TableHead>Start</TableHead><TableHead>End</TableHead><TableHead>Status</TableHead><TableHead>Actions</TableHead>
                    </TableRow></TableHeader>
                    <TableBody>
                      {periods.map(p => (
                        <TableRow key={p.id}>
                          <TableCell className="font-mono text-xs">{p.period_number}</TableCell>
                          <TableCell className="text-sm">{p.name}</TableCell>
                          <TableCell className="text-sm">{formatDate(p.start_date)}</TableCell>
                          <TableCell className="text-sm">{formatDate(p.end_date)}</TableCell>
                          <TableCell><Badge variant={statusVariant[p.status] || 'outline'} className="text-[10px]">{p.status}</Badge></TableCell>
                          <TableCell>
                            {p.status === 'open'
                              ? <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => closePeriod.mutate(p.id)}><Lock className="w-3 h-3 mr-1" /> Close</Button>
                              : <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => reopenPeriod.mutate(p.id)}><Unlock className="w-3 h-3 mr-1" /> Reopen</Button>}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="cost-centers">
            <Card>
              <CardHeader><CardTitle>Cost Centers</CardTitle></CardHeader>
              <CardContent>
                {ccLoading ? <div className="flex justify-center py-16"><Spinner className="w-6 h-6" /></div> : (
                  <Table>
                    <TableHeader><TableRow><TableHead>Code</TableHead><TableHead>Name</TableHead><TableHead>Description</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
                    <TableBody>
                      {costCenters.map(cc => (
                        <TableRow key={cc.id}>
                          <TableCell className="font-mono text-xs">{cc.code}</TableCell>
                          <TableCell className="text-sm font-medium">{cc.name}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">{cc.description || '-'}</TableCell>
                          <TableCell><Badge variant={cc.is_active ? 'success' : 'outline'} className="text-[10px]">{cc.is_active ? 'Active' : 'Inactive'}</Badge></TableCell>
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

      {/* New Fiscal Year Dialog */}
      <Dialog open={fyFormOpen} onOpenChange={setFyFormOpen}>
        <DialogContent><DialogHeader><DialogTitle>New Fiscal Year</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1"><Label>Name</Label><Input value={fyF.name} onChange={e => setFyF({ ...fyF, name: e.target.value })} placeholder="FY 2025-26" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1"><Label>Start Date</Label><Input type="date" value={fyF.start_date} onChange={e => setFyF({ ...fyF, start_date: e.target.value })} /></div>
              <div className="space-y-1"><Label>End Date</Label><Input type="date" value={fyF.end_date} onChange={e => setFyF({ ...fyF, end_date: e.target.value })} /></div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFyFormOpen(false)}>Cancel</Button>
            <Button onClick={async () => { await createFY.mutateAsync(fyF); setFyFormOpen(false) }} disabled={createFY.isPending}>{createFY.isPending && <Spinner />} Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cost Center Dialog */}
      <Dialog open={ccFormOpen} onOpenChange={setCcFormOpen}>
        <DialogContent><DialogHeader><DialogTitle>New Cost Center</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1"><Label>Code</Label><Input value={ccF.code} onChange={e => setCcF({ ...ccF, code: e.target.value })} placeholder="CC-001" /></div>
              <div className="space-y-1"><Label>Name</Label><Input value={ccF.name} onChange={e => setCcF({ ...ccF, name: e.target.value })} /></div>
            </div>
            <div className="space-y-1"><Label>Description</Label><Input value={ccF.description} onChange={e => setCcF({ ...ccF, description: e.target.value })} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCcFormOpen(false)}>Cancel</Button>
            <Button onClick={async () => { await createCC.mutateAsync(ccF); setCcFormOpen(false) }} disabled={createCC.isPending}>{createCC.isPending && <Spinner />} Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Close Year Confirmation */}
      <Dialog open={!!closeConfirmId} onOpenChange={() => setCloseConfirmId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><AlertTriangle className="w-5 h-5 text-amber-400" /> Close Fiscal Year</DialogTitle>
            <DialogDescription>This will close all open periods, calculate net income, create closing journal entries, and zero out all revenue/expense accounts. This action cannot be easily undone.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCloseConfirmId(null)}>Cancel</Button>
            <Button variant="destructive" onClick={async () => { if (closeConfirmId) { await closeFY.mutateAsync(closeConfirmId); setCloseConfirmId(null) } }} disabled={closeFY.isPending}>
              {closeFY.isPending && <Spinner />} Close Year
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
