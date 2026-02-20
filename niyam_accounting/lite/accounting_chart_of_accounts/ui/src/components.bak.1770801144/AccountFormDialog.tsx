import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from '@/components/ui/select'
import { Spinner } from '@/components/ui/spinner'
import { useCreateAccount, useUpdateAccount } from '@/hooks/useAccounts'
import type { Account, AccountType } from '@/types'

const accountTypes: AccountType[] = ['ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE']

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  account: Account | null
  accounts: Account[]
}

export function AccountFormDialog({ open, onOpenChange, account, accounts }: Props) {
  const isEdit = !!account
  const create = useCreateAccount()
  const update = useUpdateAccount()

  const { register, handleSubmit, reset, setValue, watch, formState: { errors } } = useForm({
    defaultValues: {
      account_code: '',
      account_name: '',
      account_type: 'ASSET' as AccountType,
      parent_account_id: '',
      description: '',
      opening_balance: 0,
    },
  })

  useEffect(() => {
    if (account) {
      reset({
        account_code: account.account_code,
        account_name: account.account_name,
        account_type: account.account_type,
        parent_account_id: account.parent_account_id || '',
        description: account.description || '',
        opening_balance: account.opening_balance,
      })
    } else {
      reset({ account_code: '', account_name: '', account_type: 'ASSET', parent_account_id: '', description: '', opening_balance: 0 })
    }
  }, [account, reset])

  const selectedType = watch('account_type')
  const parentOptions = accounts.filter(a => a.account_type === selectedType && a.id !== account?.id)

  const onSubmit = async (data: any) => {
    const payload = { ...data, parent_account_id: data.parent_account_id || null, opening_balance: Number(data.opening_balance) }
    if (isEdit) {
      await update.mutateAsync({ id: account!.id, ...payload })
    } else {
      await create.mutateAsync(payload)
    }
    onOpenChange(false)
  }

  const isPending = create.isPending || update.isPending

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit Account' : 'New Account'}</DialogTitle>
          <DialogDescription>{isEdit ? 'Update account details' : 'Add a new account to the chart of accounts'}</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="account_code">Account Code</Label>
              <Input id="account_code" placeholder="e.g., 1000" {...register('account_code', { required: true })} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="account_type">Type</Label>
              <Select value={selectedType} onValueChange={v => setValue('account_type', v as AccountType)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {accountTypes.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="account_name">Account Name</Label>
            <Input id="account_name" placeholder="e.g., Cash in Hand" {...register('account_name', { required: true })} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="parent_account_id">Parent Account (optional)</Label>
            <Select value={watch('parent_account_id')} onValueChange={v => setValue('parent_account_id', v)}>
              <SelectTrigger><SelectValue placeholder="None (root level)" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="">None (root level)</SelectItem>
                {parentOptions.map(p => (
                  <SelectItem key={p.id} value={p.id}>{p.account_code} - {p.account_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="opening_balance">Opening Balance</Label>
            <Input id="opening_balance" type="number" step="0.01" {...register('opening_balance', { valueAsNumber: true })} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea id="description" placeholder="Optional description..." rows={2} {...register('description')} />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={isPending}>
              {isPending && <Spinner />}
              {isEdit ? 'Update' : 'Create'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
