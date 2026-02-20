import { useState } from 'react';
import { Calendar, RefreshCw, Search } from 'lucide-react';
import { useAccountLedger, useAccountBalances } from '@/hooks/useLedger';

interface Props {
  accountId: string | null;
  onSelectAccount: (id: string) => void;
}

export function AccountLedgerView({ accountId, onSelectAccount }: Props) {
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    return d.toISOString().split('T')[0];
  });
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);

  const { data: accountsData } = useAccountBalances({});
  const { data: ledgerData, isLoading } = useAccountLedger(accountId || '', {
    start_date: startDate,
    end_date: endDate,
  });

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 2,
    }).format(amount);
  };

  return (
    <div className="card">
      <div className="flex items-center gap-4 mb-4 flex-wrap">
        <div className="flex-1 min-w-[200px]">
          <label className="block text-sm text-slate-400 mb-1">Account</label>
          <select
            value={accountId || ''}
            onChange={(e) => onSelectAccount(e.target.value)}
            className="input-field"
          >
            <option value="">Select Account</option>
            {accountsData?.data?.map((acc) => (
              <option key={acc.account_id} value={acc.account_id}>
                {acc.account_code} - {acc.account_name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm text-slate-400 mb-1">Start Date</label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="input-field w-40"
          />
        </div>
        <div>
          <label className="block text-sm text-slate-400 mb-1">End Date</label>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="input-field w-40"
          />
        </div>
      </div>

      {!accountId ? (
        <div className="text-center py-12">
          <Search className="w-12 h-12 text-slate-600 mx-auto mb-3" />
          <p className="text-slate-400">Select an account to view its ledger</p>
        </div>
      ) : isLoading ? (
        <div className="flex items-center justify-center py-12">
          <RefreshCw className="w-6 h-6 text-slate-400 animate-spin" />
        </div>
      ) : ledgerData?.data ? (
        <>
          {/* Account Summary */}
          <div className="grid grid-cols-4 gap-4 mb-6">
            <div className="bg-slate-700/50 rounded-lg p-4">
              <p className="text-sm text-slate-400 mb-1">Opening Balance</p>
              <p className="text-xl font-semibold text-white">
                {formatCurrency(ledgerData.data.opening_balance)}
              </p>
            </div>
            <div className="bg-slate-700/50 rounded-lg p-4">
              <p className="text-sm text-slate-400 mb-1">Total Debits</p>
              <p className="text-xl font-semibold text-green-400">
                {formatCurrency(ledgerData.data.total_debits)}
              </p>
            </div>
            <div className="bg-slate-700/50 rounded-lg p-4">
              <p className="text-sm text-slate-400 mb-1">Total Credits</p>
              <p className="text-xl font-semibold text-red-400">
                {formatCurrency(ledgerData.data.total_credits)}
              </p>
            </div>
            <div className="bg-slate-700/50 rounded-lg p-4">
              <p className="text-sm text-slate-400 mb-1">Closing Balance</p>
              <p className="text-xl font-semibold text-white">
                {formatCurrency(ledgerData.data.closing_balance)}
              </p>
            </div>
          </div>

          {/* Ledger Entries */}
          {ledgerData.data.entries.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-700">
                    <th className="text-left py-3 px-4 text-slate-400 font-medium">Date</th>
                    <th className="text-left py-3 px-4 text-slate-400 font-medium">Reference</th>
                    <th className="text-left py-3 px-4 text-slate-400 font-medium">Description</th>
                    <th className="text-right py-3 px-4 text-slate-400 font-medium">Debit</th>
                    <th className="text-right py-3 px-4 text-slate-400 font-medium">Credit</th>
                    <th className="text-right py-3 px-4 text-slate-400 font-medium">Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {ledgerData.data.entries.map((entry) => (
                    <tr key={entry.id} className="border-b border-slate-700/50 hover:bg-slate-700/30">
                      <td className="py-3 px-4 text-slate-300">
                        {new Date(entry.entry_date).toLocaleDateString('en-IN')}
                      </td>
                      <td className="py-3 px-4 font-mono text-slate-400 text-sm">
                        {entry.reference_number || '-'}
                      </td>
                      <td className="py-3 px-4 text-white">{entry.description || '-'}</td>
                      <td className="py-3 px-4 text-right text-green-400">
                        {entry.debit_amount > 0 ? formatCurrency(entry.debit_amount) : '-'}
                      </td>
                      <td className="py-3 px-4 text-right text-red-400">
                        {entry.credit_amount > 0 ? formatCurrency(entry.credit_amount) : '-'}
                      </td>
                      <td className="py-3 px-4 text-right font-semibold text-white">
                        {formatCurrency(entry.balance)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-8">
              <p className="text-slate-400">No entries in this period</p>
            </div>
          )}
        </>
      ) : (
        <div className="text-center py-12">
          <p className="text-slate-400">Failed to load ledger data</p>
        </div>
      )}
    </div>
  );
}
