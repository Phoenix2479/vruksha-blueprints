import { useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from '@/components/ui/select'
import { Spinner } from '@/components/ui/spinner'
import { useCreateBill } from '@/hooks/useAP'
import { formatCurrency } from '@/lib/utils'
import type { Vendor } from '@/types'

interface Props { open: boolean; onOpenChange: (o: boolean) => void; vendors: Vendor[] }

export function BillFormDialog({ open, onOpenChange, vendors }: Props) {
  const create = useCreateBill()
  const [vendorId, setVendorId] = useState('')
  const [billDate, setBillDate] = useState(new Date().toISOString().split('T')[0])
  const [dueDate, setDueDate] = useState('')
  const [reference, setReference] = useState('')
  const [lines, setLines] = useState([{ description: '', account_id: '', quantity: 1, unit_price: 0, tax_rate: 18, hsn_sac_code: '' }])

  const addLine = () => setLines([...lines, { description: '', account_id: '', quantity: 1, unit_price: 0, tax_rate: 18, hsn_sac_code: '' }])
  const removeLine = (i: number) => setLines(lines.filter((_, idx) => idx !== i))
  const updateLine = (i: number, field: string, value: any) => { const next = [...lines]; next[i] = { ...next[i], [field]: value }; setLines(next) }

  const total = lines.reduce((s, l) => s + (l.quantity * l.unit_price), 0)
  const taxTotal = lines.reduce((s, l) => s + (l.quantity * l.unit_price * l.tax_rate / 100), 0)

  const handleSubmit = async () => {
    if (!vendorId || lines.some(l => !l.description)) { alert('Fill required fields'); return }
    await create.mutateAsync({ vendor_id: vendorId, bill_date: billDate, due_date: dueDate, reference_number: reference || undefined, lines })
    onOpenChange(false)
    setVendorId(''); setLines([{ description: '', account_id: '', quantity: 1, unit_price: 0, tax_rate: 18, hsn_sac_code: '' }])
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[750px] max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>New Bill</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Vendor</Label>
              <Select value={vendorId} onValueChange={setVendorId}>
                <SelectTrigger><SelectValue placeholder="Select vendor" /></SelectTrigger>
                <SelectContent>{vendors.map(v => <SelectItem key={v.id} value={v.id}>{v.vendor_name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-2"><Label>Reference #</Label><Input value={reference} onChange={e => setReference(e.target.value)} /></div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2"><Label>Bill Date</Label><Input type="date" value={billDate} onChange={e => setBillDate(e.target.value)} /></div>
            <div className="space-y-2"><Label>Due Date</Label><Input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} /></div>
          </div>

          <div className="space-y-2">
            <div className="flex justify-between items-center"><Label>Line Items</Label><Button type="button" variant="outline" size="sm" onClick={addLine}><Plus className="w-3 h-3" /> Add</Button></div>
            <div className="rounded-md border">
              <div className="grid grid-cols-[1fr_60px_80px_60px_60px_32px] gap-2 p-2 bg-muted/50 text-xs font-medium text-muted-foreground">
                <span>Description</span><span>Qty</span><span>Price</span><span>Tax %</span><span>HSN</span><span />
              </div>
              {lines.map((l, i) => (
                <div key={i} className="grid grid-cols-[1fr_60px_80px_60px_60px_32px] gap-2 p-2 border-t items-center">
                  <Input placeholder="Description" value={l.description} onChange={e => updateLine(i, 'description', e.target.value)} className="h-8 text-xs" />
                  <Input type="number" min="1" value={l.quantity} onChange={e => updateLine(i, 'quantity', +e.target.value)} className="h-8 text-xs" />
                  <Input type="number" step="0.01" value={l.unit_price} onChange={e => updateLine(i, 'unit_price', +e.target.value)} className="h-8 text-xs" />
                  <Input type="number" value={l.tax_rate} onChange={e => updateLine(i, 'tax_rate', +e.target.value)} className="h-8 text-xs" />
                  <Input placeholder="HSN" value={l.hsn_sac_code} onChange={e => updateLine(i, 'hsn_sac_code', e.target.value)} className="h-8 text-xs" />
                  <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => removeLine(i)} disabled={lines.length <= 1}><Trash2 className="w-3 h-3" /></Button>
                </div>
              ))}
              <div className="p-2 border-t bg-muted/30 text-sm font-medium flex justify-end gap-6">
                <span>Subtotal: {formatCurrency(total)}</span>
                <span>Tax: {formatCurrency(taxTotal)}</span>
                <span className="font-bold">Total: {formatCurrency(total + taxTotal)}</span>
              </div>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={create.isPending}>{create.isPending && <Spinner />} Create Bill</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
