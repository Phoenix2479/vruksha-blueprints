import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from '@/components/ui/select'
import { Spinner } from '@/components/ui/spinner'
import { usePayBill } from '@/hooks/useAP'
import type { Vendor } from '@/types'

interface Props { open: boolean; onOpenChange: (o: boolean) => void; billId: string | null; vendors: Vendor[] }

export function PaymentDialog({ open, onOpenChange, billId }: Props) {
  const pay = usePayBill()
  const [amount, setAmount] = useState('')
  const [method, setMethod] = useState('BANK_TRANSFER')
  const [reference, setReference] = useState('')
  const [payDate, setPayDate] = useState(new Date().toISOString().split('T')[0])

  const handleSubmit = async () => {
    if (!billId || !amount) return
    await pay.mutateAsync({ id: billId, amount: Number(amount), payment_method: method, payment_date: payDate, reference_number: reference || undefined })
    onOpenChange(false)
    setAmount(''); setReference('')
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader><DialogTitle>Record Payment</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2"><Label>Payment Date</Label><Input type="date" value={payDate} onChange={e => setPayDate(e.target.value)} /></div>
          <div className="space-y-2"><Label>Amount</Label><Input type="number" step="0.01" placeholder="0.00" value={amount} onChange={e => setAmount(e.target.value)} /></div>
          <div className="space-y-2">
            <Label>Payment Method</Label>
            <Select value={method} onValueChange={setMethod}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="BANK_TRANSFER">Bank Transfer</SelectItem>
                <SelectItem value="CHEQUE">Cheque</SelectItem>
                <SelectItem value="CASH">Cash</SelectItem>
                <SelectItem value="UPI">UPI</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2"><Label>Reference #</Label><Input value={reference} onChange={e => setReference(e.target.value)} placeholder="Cheque/UTR number" /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={pay.isPending}>{pay.isPending && <Spinner />} Pay</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
