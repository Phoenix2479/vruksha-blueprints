import { useForm } from 'react-hook-form'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Spinner } from '@/components/ui/spinner'
import { useCreateVendor } from '@/hooks/useAP'

export function VendorFormDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const create = useCreateVendor()
  const { register, handleSubmit, reset } = useForm({
    defaultValues: { vendor_code: '', vendor_name: '', gstin: '', pan: '', contact_person: '', email: '', phone: '', address: '', payment_terms: 30, credit_limit: 0, tds_applicable: false, tds_section: '', bank_name: '', bank_account_number: '', bank_ifsc: '' },
  })

  const onSubmit = async (data: any) => {
    await create.mutateAsync(data)
    reset(); onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Add Vendor</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2"><Label>Vendor Code</Label><Input {...register('vendor_code', { required: true })} placeholder="V-001" /></div>
            <div className="space-y-2"><Label>Vendor Name</Label><Input {...register('vendor_name', { required: true })} placeholder="Vendor name" /></div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2"><Label>GSTIN</Label><Input {...register('gstin')} placeholder="22AAAAA0000A1Z5" /></div>
            <div className="space-y-2"><Label>PAN</Label><Input {...register('pan')} placeholder="AAAAA0000A" /></div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2"><Label>Contact Person</Label><Input {...register('contact_person')} /></div>
            <div className="space-y-2"><Label>Email</Label><Input type="email" {...register('email')} /></div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2"><Label>Phone</Label><Input {...register('phone')} /></div>
            <div className="space-y-2"><Label>Address</Label><Input {...register('address')} /></div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2"><Label>Payment Terms (days)</Label><Input type="number" {...register('payment_terms', { valueAsNumber: true })} /></div>
            <div className="space-y-2"><Label>Credit Limit</Label><Input type="number" step="0.01" {...register('credit_limit', { valueAsNumber: true })} /></div>
            <div className="space-y-2"><Label>TDS Section</Label><Input {...register('tds_section')} placeholder="194C" /></div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2"><Label>Bank Name</Label><Input {...register('bank_name')} /></div>
            <div className="space-y-2"><Label>Account Number</Label><Input {...register('bank_account_number')} /></div>
            <div className="space-y-2"><Label>IFSC</Label><Input {...register('bank_ifsc')} /></div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={create.isPending}>{create.isPending && <Spinner />} Create Vendor</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
