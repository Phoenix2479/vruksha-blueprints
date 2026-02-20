import { useState } from 'react';
import { Search, Calendar, RefreshCw, CheckCircle, AlertCircle, Download } from 'lucide-react';
import { useTrialBalance, useAccountBalances } from '@/hooks/useLedger';
import { AccountLedgerView } from '@/components/AccountLedgerView';

type ViewMode = 'trial-balance' | 'account-ledger' | 'balances';

export function GeneralLedgerPage() {
  const [viewMode, setViewMode] = useState<ViewMode>('trial-balance');
  const [asOfDate, setAsOfDate] = useState(new Date().toISOString().split('T')[0]);
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [accountTypeFilter, setAccountTypeFilter] = useState<string>('');

  const { data: trialBalanceData, isLoading: tbLoading, refetch: refetchTB } = useTrialBalance(asOfDate);
  const { data: balancesData, isLoading: balancesLoading } = useAccountBalances({
    account_type: accountTypeFilter || undefined,
    as_of_date: asOfDate,
  });

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 2,
    }).format(amount);
  };

  return (
    <div className="min-h-screen bg-slate-900 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-white">General Ledger</h1>
            <p className="text-slate-400 mt-1">View account balances and ledger entries</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-slate-400" />
              <input
                type="date"
                value={asOfDate}
                onChange={(e) => setAsOfDate(e.target.value)}
                className="input-field w-40"
              />
            </div>
            <button onClick={() => refetchTB()} className="btn-secondary flex items-center gap-2">
              <RefreshCw className="w-4 h-4" />
              Refresh
            </button>
          </div>
        </div>

        {/* View Mode Tabs */}
        <div className="flex gap-2 mb-6">
          {[
            { id: 'trial-balance', label: 'Trial Balance' },
            { id: 'balances', label: 'Account Balances' },
            { id: 'account-ledger', label: 'Account Ledger' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setViewMode(tab.id as ViewMode)}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                viewMode === tab.id
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Trial Balance View */}
        {viewMode === 'trial-balance' && (
          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-white">Trial Balance</h2>
              {trialBalanceData?.data && (
                <div className="flex items-center gap-2">
                  {trialBalanceData.data.is_balanced ? (
                    <span className="flex items-center gap-1 text-green-400">
                      <CheckCircle className="w-4 h-4" />
                      Balanced
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-red-400">
                      <AlertCircle className="w-4 h-4" />
                      Out of Balance
                    </span>
                  )}
                </div>
              )}
            </div>

            {tbLoading ? (
              <div className="flex items-center justify-center py-12">
                <RefreshCw className="w-6 h-6 text-slate-400 animate-spin" />
              </div>
            ) : trialBalanceData?.data?.accounts?.length ? (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-slate-700">
                      <th className="text-left py-3 px-4 text-slate-400 font-medium">Account Code</th>
                      <th className="text-left py-3 px-4 text-slate-400 font-medium">Account Name</th>
                      <th className="text-left py-3 px-4 text-slate-400 font-medium">Type</th>
                      <th className="text-right py-3 px-4 text-slate-400 font-medium">Debit</th>
                      <th className="text-right py-3 px-4 text-slate-400 font-medium">Credit</th>
                    </tr>
                  </thead>
                  <tbody>
                    {trialBalanceData.data.accounts.map((account) => (
                      <tr
                        key={account.account_id}
                        className="border-b border-slate-700/50 hover:bg-slate-700/30 cursor-pointer"
                        onClick={() => {
                          setSelectedAccountId(account.account_id);
                          setViewMode('account-ledger');
                        }}
                      >
                        <td className="py-3 px-4 font-mono text-slate-300">{account.account_code}</td>
                        <td className="py-3 px-4 text-white">{account.account_name}</td>
                        <td className="py-3 px-4 text-slate-400 text-sm">{account.account_type}</td>
                        <td className="py-3 px-4 text-right text-green-400">
                          {account.debit_balance > 0 ? formatCurrency(account.debit_balance) : '-'}
                        </td>
                        <td className="py-3 px-4 text-right text-red-400">
                          {account.credit_balance > 0 ? formatCurrency(account.credit_balance) : '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-slate-700/50 font-semibold">
                      <td colSpan={3} className="py-3 px-4 text-white">Total</td>
                      <td className="py-3 px-4 text-right text-green-400">
                        {formatCurrency(trialBalanceData.data.total_debits)}
                      </td>
                      <td className="py-3 px-4 text-right text-red-400">
                        {formatCurrency(trialBalanceData.data.total_credits)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            ) : (
              <div className="text-center py-12">
                <p className="text-slate-400">No ledger entries found</p>
              </div>
            )}
          </div>
        )}

        {/* Account Balances View */}
        {viewMode === 'balances' && (
          <div className="card">
            <div className="flex items-center gap-4 mb-4">
              <h2 className="text-lg font-semibold text-white">Account Balances</h2>
              <select
                value={accountTypeFilter}
                onChange={(e) => setAccountTypeFilter(e.target.value)}
                className="input-field w-40"
              >
                <option value="">All Types</option>
                <option value="ASSET">Assets</option>
                <option value="LIABILITY">Liabilities</option>
                <option value="EQUITY">Equity</option>
                <option value="REVENUE">Revenue</option>
                <option value="EXPENSE">Expenses</option>
              </select>
            </div>

            {balancesLoading ? (
              <div className="flex items-center justify-center py-12">
                <RefreshCw className="w-6 h-6 text-slate-400 animate-spin" />
              </div>
            ) : balancesData?.data?.length ? (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-slate-700">
                      <th className="text-left py-3 px-4 text-slate-400 font-medium">Account</th>
                      <th className="text-left py-3 px-4 text-slate-400 font-medium">Type</th>
                      <th className="text-right py-3 px-4 text-slate-400 font-medium">Debits</th>
                      <th className="text-right py-3 px-4 text-slate-400 font-medium">Credits</th>
                      <th className="text-right py-3 px-4 text-slate-400 font-medium">Balance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {balancesData.data.map((account) => (
                      <tr
                        key={account.account_id}
                        className="border-b border-slate-700/50 hover:bg-slate-700/30 cursor-pointer"
                        onClick={() => {
                          setSelectedAccountId(account.account_id);
                          setViewMode('account-ledger');
                        }}
                      >
                        <td className="py-3 px-4">
                          <span className="font-mono text-slate-400 mr-2">{account.account_code}</span>
                          <span className="text-white">{account.account_name}</span>
                        </td>
                        <td className="py-3 px-4 text-slate-400 text-sm">{account.account_type}</td>
                        <td className="py-3 px-4 text-right text-slate-300">
                          {formatCurrency(account.debit_total)}
                        </td>
                        <td className="py-3 px-4 text-right text-slate-300">
                          {formatCurrency(account.credit_total)}
                        </td>
                        <td className="py-3 px-4 text-right font-semibold text-white">
                          {formatCurrency(account.balance)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-center py-12">
                <p className="text-slate-400">No accounts found</p>
              </div>
            )}
          </div>
        )}

        {/* Account Ledger View */}
        {viewMode === 'account-ledger' && (
          <AccountLedgerView
            accountId={selectedAccountId}
            onSelectAccount={setSelectedAccountId}
          />
        )}
      </div>
    </div>
  );
}
