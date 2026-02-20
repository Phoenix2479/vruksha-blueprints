import { useForm } from 'react-hook-form';
import { X } from 'lucide-react';
import { useCreateAccount, useUpdateAccount, useAccounts } from '@/hooks/useAccounts';
import type { Account, CreateAccountInput, AccountType, AccountSubType } from '@/types';

const accountTypes: AccountType[] = ['ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE'];

const subTypesByType: Record<AccountType, AccountSubType[]> = {
  ASSET: ['CURRENT_ASSET', 'FIXED_ASSET', 'OTHER_ASSET'],
  LIABILITY: ['CURRENT_LIABILITY', 'LONG_TERM_LIABILITY'],
  EQUITY: ['OWNERS_EQUITY', 'RETAINED_EARNINGS'],
  REVENUE: ['OPERATING_REVENUE', 'OTHER_REVENUE'],
  EXPENSE: ['OPERATING_EXPENSE', 'COST_OF_GOODS', 'OTHER_EXPENSE'],
};

interface Props {
  account?: Account | null;
  onClose: () => void;
  onSuccess: () => void;
}

export function AccountForm({ account, onClose, onSuccess }: Props) {
  const isEdit = !!account;
  const createAccount = useCreateAccount();
  const updateAccount = useUpdateAccount();
  const { data: accountsData } = useAccounts({ limit: 1000 });

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<CreateAccountInput>({
    defaultValues: account
      ? {
          account_code: account.account_code,
          account_name: account.account_name,
          account_type: account.account_type,
          account_sub_type: account.account_sub_type,
          parent_account_id: account.parent_account_id,
          description: account.description || '',
          currency: account.currency,
          opening_balance: account.opening_balance,
        }
      : {
          currency: 'INR',
          opening_balance: 0,
        },
  });

  const selectedType = watch('account_type');
  const availableSubTypes = selectedType ? subTypesByType[selectedType] : [];

  // Get potential parent accounts (same type, not self)
  const parentAccounts =
    accountsData?.data?.filter(
      (a) => a.account_type === selectedType && a.id !== account?.id
    ) || [];

  const onSubmit = async (data: CreateAccountInput) => {
    try {
      if (isEdit && account) {
        await updateAccount.mutateAsync({
          id: account.id,
          input: {
            account_name: data.account_name,
            description: data.description,
            parent_account_id: data.parent_account_id,
          },
        });
      } else {
        await createAccount.mutateAsync(data);
      }
      onSuccess();
    } catch (error) {
      console.error('Failed to save account:', error);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-slate-800 rounded-xl border border-slate-700 w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b border-slate-700">
          <h2 className="text-lg font-semibold text-white">
            {isEdit ? 'Edit Account' : 'New Account'}
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="p-4 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">
                Account Code *
              </label>
              <input
                {...register('account_code', { required: 'Account code is required' })}
                className="input-field"
                placeholder="e.g., 1001"
                disabled={isEdit}
              />
              {errors.account_code && (
                <p className="text-red-400 text-xs mt-1">{errors.account_code.message}</p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">Currency</label>
              <input
                {...register('currency')}
                className="input-field"
                placeholder="INR"
                disabled={isEdit}
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">
              Account Name *
            </label>
            <input
              {...register('account_name', { required: 'Account name is required' })}
              className="input-field"
              placeholder="e.g., Cash in Hand"
            />
            {errors.account_name && (
              <p className="text-red-400 text-xs mt-1">{errors.account_name.message}</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">
                Account Type *
              </label>
              <select
                {...register('account_type', { required: 'Account type is required' })}
                className="input-field"
                disabled={isEdit}
              >
                <option value="">Select type</option>
                {accountTypes.map((type) => (
                  <option key={type} value={type}>
                    {type.replace('_', ' ')}
                  </option>
                ))}
              </select>
              {errors.account_type && (
                <p className="text-red-400 text-xs mt-1">{errors.account_type.message}</p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">
                Sub Type *
              </label>
              <select
                {...register('account_sub_type', { required: 'Sub type is required' })}
                className="input-field"
                disabled={isEdit || !selectedType}
              >
                <option value="">Select sub type</option>
                {availableSubTypes.map((subType) => (
                  <option key={subType} value={subType}>
                    {subType.replace(/_/g, ' ')}
                  </option>
                ))}
              </select>
              {errors.account_sub_type && (
                <p className="text-red-400 text-xs mt-1">{errors.account_sub_type.message}</p>
              )}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">
              Parent Account
            </label>
            <select {...register('parent_account_id')} className="input-field">
              <option value="">No parent (top-level)</option>
              {parentAccounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.account_code} - {a.account_name}
                </option>
              ))}
            </select>
          </div>

          {!isEdit && (
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">
                Opening Balance
              </label>
              <input
                type="number"
                step="0.01"
                {...register('opening_balance', { valueAsNumber: true })}
                className="input-field"
                placeholder="0.00"
              />
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">Description</label>
            <textarea
              {...register('description')}
              className="input-field"
              rows={3}
              placeholder="Optional description..."
            />
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <button type="button" onClick={onClose} className="btn-secondary">
              Cancel
            </button>
            <button type="submit" disabled={isSubmitting} className="btn-primary">
              {isSubmitting ? 'Saving...' : isEdit ? 'Update' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
