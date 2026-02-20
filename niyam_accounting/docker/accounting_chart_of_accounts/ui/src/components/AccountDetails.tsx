import { Edit, Trash2, X, DollarSign } from 'lucide-react';
import { useAccountBalance, useDeleteAccount, useUpdateAccount } from '@/hooks/useAccounts';
import type { Account } from '@/types';

interface Props {
  account: Account;
  onEdit: () => void;
  onClose: () => void;
}

export function AccountDetails({ account, onEdit, onClose }: Props) {
  const { data: balanceData, isLoading: balanceLoading } = useAccountBalance(account.id);
  const deleteAccount = useDeleteAccount();
  const updateAccount = useUpdateAccount();

  const handleDelete = async () => {
    if (confirm(`Are you sure you want to delete "${account.account_name}"? This cannot be undone.`)) {
      try {
        await deleteAccount.mutateAsync(account.id);
        onClose();
      } catch (error) {
        console.error('Failed to delete:', error);
        alert('Failed to delete account. It may have transactions or child accounts.');
      }
    }
  };

  const handleToggleActive = async () => {
    try {
      await updateAccount.mutateAsync({
        id: account.id,
        input: { is_active: !account.is_active },
      });
    } catch (error) {
      console.error('Failed to update:', error);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: account.currency || 'INR',
    }).format(amount);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-white">Account Details</h3>
        <button onClick={onClose} className="text-slate-400 hover:text-white">
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="space-y-4">
        {/* Account Info */}
        <div className="bg-slate-700/50 rounded-lg p-4">
          <div className="flex items-center gap-3 mb-3">
            <span className="font-mono text-lg text-slate-300">{account.account_code}</span>
            {account.is_system && (
              <span className="text-xs px-2 py-0.5 rounded bg-blue-500/20 text-blue-400 border border-blue-500/30">
                System
              </span>
            )}
          </div>
          <h4 className="text-xl font-semibold text-white mb-2">{account.account_name}</h4>
          {account.description && (
            <p className="text-sm text-slate-400">{account.description}</p>
          )}
        </div>

        {/* Type & Balance */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-slate-700/50 rounded-lg p-3">
            <p className="text-xs text-slate-400 mb-1">Type</p>
            <p className="text-white font-medium">{account.account_type}</p>
            <p className="text-xs text-slate-500">{account.account_sub_type.replace(/_/g, ' ')}</p>
          </div>
          <div className="bg-slate-700/50 rounded-lg p-3">
            <p className="text-xs text-slate-400 mb-1">Normal Balance</p>
            <p className="text-white font-medium">{account.normal_balance}</p>
          </div>
        </div>

        {/* Balance */}
        <div className="bg-slate-700/50 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-3">
            <DollarSign className="w-4 h-4 text-slate-400" />
            <span className="text-sm text-slate-400">Current Balance</span>
          </div>
          {balanceLoading ? (
            <p className="text-slate-400">Loading...</p>
          ) : balanceData?.data ? (
            <div className="space-y-2">
              <p className="text-2xl font-bold text-white">
                {formatCurrency(balanceData.data.balance)}
              </p>
              <div className="flex justify-between text-sm">
                <span className="text-slate-400">
                  Debits: {formatCurrency(balanceData.data.debit_total)}
                </span>
                <span className="text-slate-400">
                  Credits: {formatCurrency(balanceData.data.credit_total)}
                </span>
              </div>
            </div>
          ) : (
            <p className="text-2xl font-bold text-white">{formatCurrency(account.current_balance)}</p>
          )}
        </div>

        {/* Status */}
        <div className="flex items-center justify-between bg-slate-700/50 rounded-lg p-3">
          <span className="text-sm text-slate-400">Status</span>
          <button
            onClick={handleToggleActive}
            disabled={account.is_system}
            className={`text-sm px-3 py-1 rounded-full ${
              account.is_active
                ? 'bg-green-500/20 text-green-400'
                : 'bg-red-500/20 text-red-400'
            } ${account.is_system ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:opacity-80'}`}
          >
            {account.is_active ? 'Active' : 'Inactive'}
          </button>
        </div>

        {/* Metadata */}
        <div className="text-xs text-slate-500 space-y-1">
          <p>Created: {new Date(account.created_at).toLocaleString()}</p>
          <p>Updated: {new Date(account.updated_at).toLocaleString()}</p>
        </div>

        {/* Actions */}
        <div className="flex gap-3 pt-4 border-t border-slate-700">
          <button
            onClick={onEdit}
            disabled={account.is_system}
            className="flex-1 btn-secondary flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Edit className="w-4 h-4" />
            Edit
          </button>
          <button
            onClick={handleDelete}
            disabled={account.is_system}
            className="flex-1 bg-red-600/20 hover:bg-red-600/30 text-red-400 font-medium py-2 px-4 rounded-lg transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Trash2 className="w-4 h-4" />
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}
