import { useState } from 'react';
import { Building2, Plus, RefreshCw, CheckCircle, Clock, AlertCircle } from 'lucide-react';
import { useBankAccounts, useBankTransactions, useStartReconciliation } from '@/hooks/useBank';
import type { BankAccount, BankTransaction } from '@/types';

export function BankReconciliationPage() {
  const [selectedAccount, setSelectedAccount] = useState<BankAccount | null>(null);
  const [showReconcileModal, setShowReconcileModal] = useState(false);
  const [statementDate, setStatementDate] = useState(new Date().toISOString().split('T')[0]);
  const [statementBalance, setStatementBalance] = useState('');

  const { data: accountsData, isLoading } = useBankAccounts();
  const { data: txData, refetch: refetchTx } = useBankTransactions(selectedAccount?.id || '');
  const startReconciliation = useStartReconciliation();

  const formatCurrency = (amt: number) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(amt);

  const handleStartReconciliation = async () => {
    if (!selectedAccount || !statementBalance) return;
    await startReconciliation.mutateAsync({
      bankAccountId: selectedAccount.id,
      statementDate,
      statementBalance: parseFloat(statementBalance),
    });
    setShowReconcileModal(false);
    refetchTx();
  };

  const statusColors = { PENDING: 'text-yellow-400', MATCHED: 'text-blue-400', RECONCILED: 'text-green-400', UNMATCHED: 'text-red-400' };

  return (
    <div className="min-h-screen bg-slate-900 p-6">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-white">Bank Reconciliation</h1>
            <p className="text-slate-400 mt-1">Match bank statements with ledger entries</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Bank Accounts List */}
          <div className="card">
            <h2 className="text-lg font-semibold text-white mb-4">Bank Accounts</h2>
            {isLoading ? (
              <RefreshCw className="w-5 h-5 text-slate-400 animate-spin mx-auto" />
            ) : (
              <div className="space-y-2">
                {accountsData?.data?.map((acc) => (
                  <div
                    key={acc.id}
                    onClick={() => setSelectedAccount(acc)}
                    className={`p-3 rounded-lg cursor-pointer transition-colors ${selectedAccount?.id === acc.id ? 'bg-blue-600/20 border border-blue-500' : 'bg-slate-700/50 hover:bg-slate-700'}`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <Building2 className="w-4 h-4 text-slate-400" />
                      <span className="text-white font-medium">{acc.account_name}</span>
                    </div>
                    <p className="text-sm text-slate-400">{acc.bank_name}</p>
                    <p className="text-sm text-slate-300 mt-1">{formatCurrency(acc.current_balance)}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Transactions */}
          <div className="lg:col-span-3 card">
            {selectedAccount ? (
              <>
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h2 className="text-lg font-semibold text-white">{selectedAccount.account_name}</h2>
                    <p className="text-sm text-slate-400">{selectedAccount.bank_name} - {selectedAccount.account_number}</p>
                  </div>
                  <button onClick={() => setShowReconcileModal(true)} className="btn-primary flex items-center gap-2">
                    <CheckCircle className="w-4 h-4" /> Start Reconciliation
                  </button>
                </div>

                {/* Summary Cards */}
                <div className="grid grid-cols-3 gap-4 mb-6">
                  <div className="bg-slate-700/50 rounded-lg p-4">
                    <p className="text-sm text-slate-400 mb-1">Book Balance</p>
                    <p className="text-xl font-semibold text-white">{formatCurrency(selectedAccount.current_balance)}</p>
                  </div>
                  <div className="bg-slate-700/50 rounded-lg p-4">
                    <p className="text-sm text-slate-400 mb-1">Last Reconciled</p>
                    <p className="text-xl font-semibold text-white">
                      {selectedAccount.last_reconciled_date ? new Date(selectedAccount.last_reconciled_date).toLocaleDateString('en-IN') : 'Never'}
                    </p>
                  </div>
                  <div className="bg-slate-700/50 rounded-lg p-4">
                    <p className="text-sm text-slate-400 mb-1">Unmatched Transactions</p>
                    <p className="text-xl font-semibold text-yellow-400">
                      {txData?.data?.filter((t) => t.status === 'PENDING' || t.status === 'UNMATCHED').length || 0}
                    </p>
                  </div>
                </div>

                {/* Transactions Table */}
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-slate-700">
                        <th className="text-left py-3 px-4 text-slate-400 font-medium">Date</th>
                        <th className="text-left py-3 px-4 text-slate-400 font-medium">Description</th>
                        <th className="text-left py-3 px-4 text-slate-400 font-medium">Reference</th>
                        <th className="text-right py-3 px-4 text-slate-400 font-medium">Amount</th>
                        <th className="text-center py-3 px-4 text-slate-400 font-medium">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {txData?.data?.map((tx) => (
                        <tr key={tx.id} className="border-b border-slate-700/50 hover:bg-slate-700/30">
                          <td className="py-3 px-4 text-slate-300">{new Date(tx.transaction_date).toLocaleDateString('en-IN')}</td>
                          <td className="py-3 px-4 text-white">{tx.description}</td>
                          <td className="py-3 px-4 text-slate-400 text-sm">{tx.reference_number || tx.cheque_number || '-'}</td>
                          <td className={`py-3 px-4 text-right font-medium ${tx.transaction_type === 'CREDIT' ? 'text-green-400' : 'text-red-400'}`}>
                            {tx.transaction_type === 'CREDIT' ? '+' : '-'}{formatCurrency(tx.amount)}
                          </td>
                          <td className={`py-3 px-4 text-center text-sm ${statusColors[tx.status]}`}>{tx.status}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {(!txData?.data || txData.data.length === 0) && (
                    <p className="text-center py-8 text-slate-400">No transactions found</p>
                  )}
                </div>
              </>
            ) : (
              <div className="text-center py-12">
                <Building2 className="w-12 h-12 text-slate-600 mx-auto mb-3" />
                <p className="text-slate-400">Select a bank account to view transactions</p>
              </div>
            )}
          </div>
        </div>

        {/* Reconciliation Modal */}
        {showReconcileModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-slate-800 rounded-xl border border-slate-700 p-6 w-full max-w-md">
              <h3 className="text-lg font-semibold text-white mb-4">Start Reconciliation</h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm text-slate-300 mb-1">Statement Date</label>
                  <input type="date" value={statementDate} onChange={(e) => setStatementDate(e.target.value)} className="input-field" />
                </div>
                <div>
                  <label className="block text-sm text-slate-300 mb-1">Statement Balance</label>
                  <input type="number" step="0.01" value={statementBalance} onChange={(e) => setStatementBalance(e.target.value)} className="input-field" placeholder="Enter bank statement balance" />
                </div>
                <div className="flex gap-3 pt-4">
                  <button onClick={() => setShowReconcileModal(false)} className="flex-1 btn-secondary">Cancel</button>
                  <button onClick={handleStartReconciliation} className="flex-1 btn-primary">Start</button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
