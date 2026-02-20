import { useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Spinner } from '@/components/ui/spinner'
import { useCreateJournalEntry } from '@/hooks/useJournal'
import { formatCurrency } from '@/lib/utils'

interface Line {
  account_id: string
  debit_amount: number
  credit_amount: number
  description: string
}

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function JournalEntryFormDialog({ open, onOpenChange }: Props) {
  const create = useCreateJournalEntry()
  const [entryDate, setEntryDate] = useState(new Date().toISOString().split('T')[0])
  const [description, setDescription] = useState('')
  const [reference, setReference] = useState('')
  const [lines, setLines] = useState<Line[]>([
    { account_id: '', debit_amount: 0, credit_amount: 0, description: '' },
    { account_id: '', debit_amount: 0, credit_amount: 0, description: '' },
  ])

  const totalDebit = lines.reduce((s, l) => s + (Number(l.debit_amount) || 0), 0)
  const totalCredit = lines.reduce((s, l) => s + (Number(l.credit_amount) || 0), 0)
  const isBalanced = Math.abs(totalDebit - totalCredit) < 0.01

  const addLine = () => setLines([...lines, { account_id: '', debit_amount: 0, credit_amount: 0, description: '' }])
  const removeLine = (i: number) => setLines(lines.filter((_, idx) => idx !== i))
  const updateLine = (i: number, field: keyof Line, value: string | number) => {
    const next = [...lines]
    next[i] = { ...next[i], [field]: value }
    setLines(next)
  }

  const handleSubmit = async () => {
    if (!description || lines.some(l => !l.account_id)) { alert('Fill in all required fields'); return }
    await create.mutateAsync({
      entry_date: entryDate,
      description,
      reference_number: reference || undefined,
      lines: lines.filter(l => l.account_id).map(l => ({
        account_id: l.account_id,
        debit_amount: Number(l.debit_amount) || 0,
        credit_amount: Number(l.credit_amount) || 0,
        description: l.description,
      })),
    })
    onOpenChange(false)
    setDescription(''); setReference(''); setLines([
      { account_id: '', debit_amount: 0, credit_amount: 0, description: '' },
      { account_id: '', debit_amount: 0, credit_amount: 0, description: '' },
    ])
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>New Journal Entry</DialogTitle>
          <DialogDescription>Create a double-entry journal entry with balanced debits and credits</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Entry Date</Label>
              <Input type="date" value={entryDate} onChange={e => setEntryDate(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Reference #</Label>
              <Input placeholder="Optional" value={reference} onChange={e => setReference(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Input placeholder="Entry description" value={description} onChange={e => setDescription(e.target.value)} />
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <Label>Line Items</Label>
              <Button type="button" variant="outline" size="sm" onClick={addLine}><Plus className="w-3 h-3" /> Add Line</Button>
            </div>
            <div className="rounded-md border">
              <div className="grid grid-cols-[1fr_100px_100px_1fr_32px] gap-2 p-2 bg-muted/50 text-xs font-medium text-muted-foreground">
                <span>Account ID</span><span className="text-right">Debit</span><span className="text-right">Credit</span><span>Narration</span><span />
              </div>
              {lines.map((line, i) => (
                <div key={i} className="grid grid-cols-[1fr_100px_100px_1fr_32px] gap-2 p-2 border-t items-center">
                  <Input placeholder="Account ID" value={line.account_id} onChange={e => updateLine(i, 'account_id', e.target.value)} className="h-8 text-xs" />
                  <Input type="number" step="0.01" min="0" value={line.debit_amount || ''} onChange={e => updateLine(i, 'debit_amount', e.target.value)} className="h-8 text-xs text-right" placeholder="0.00" />
                  <Input type="number" step="0.01" min="0" value={line.credit_amount || ''} onChange={e => updateLine(i, 'credit_amount', e.target.value)} className="h-8 text-xs text-right" placeholder="0.00" />
                  <Input placeholder="Narration" value={line.description} onChange={e => updateLine(i, 'description', e.target.value)} className="h-8 text-xs" />
                  <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => removeLine(i)} disabled={lines.length <= 2}>
                    <Trash2 className="w-3 h-3 text-muted-foreground" />
                  </Button>
                </div>
              ))}
              <div className="grid grid-cols-[1fr_100px_100px_1fr_32px] gap-2 p-2 border-t bg-muted/30 font-medium text-sm">
                <span>Total</span>
                <span className={`text-right font-mono ${isBalanced ? 'text-emerald-400' : 'text-red-400'}`}>{formatCurrency(totalDebit)}</span>
                <span className={`text-right font-mono ${isBalanced ? 'text-emerald-400' : 'text-red-400'}`}>{formatCurrency(totalCredit)}</span>
                <span className={`text-xs ${isBalanced ? 'text-emerald-400' : 'text-red-400'}`}>{isBalanced ? 'Balanced' : `Diff: ${formatCurrency(Math.abs(totalDebit - totalCredit))}`}</span>
                <span />
              </div>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={create.isPending || !isBalanced}>
            {create.isPending && <Spinner />} Create Entry
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
