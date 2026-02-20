import { useState } from 'react';
import { BarChart3, PieChart, TrendingUp, FileText, Download, RefreshCw, Calendar } from 'lucide-react';
import { useBalanceSheet, useProfitLoss, useCashFlow, useTrialBalance } from '@/hooks/useReports';

type ReportType = 'balance-sheet' | 'profit-loss' | 'cash-flow' | 'trial-balance';

export function FinancialReportsPage() {
  const [reportType, setReportType] = useState<ReportType>('balance-sheet');
  const [asOfDate, setAsOfDate] = useState(new Date().toISOString().split('T')[0]);
  const [startDate, setStartDate] = useState(() => { const d = new Date(); d.setMonth(d.getMonth() - 1); d.setDate(1); return d.toISOString().split('T')[0]; });
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);

  const { data: bsData, isLoading: bsLoading } = useBalanceSheet(asOfDate);
  const { data: plData, isLoading: plLoading } = useProfitLoss(startDate, endDate);
  const { data: cfData, isLoading: cfLoading } = useCashFlow(startDate, endDate);
  const { data: tbData, isLoading: tbLoading } = useTrialBalance(asOfDate);

  const formatCurrency = (amt: number) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(amt);

  const reports = [
    { id: 'balance-sheet', label: 'Balance Sheet', icon: BarChart3, needsDateRange: false },
    { id: 'profit-loss', label: 'Profit & Loss', icon: TrendingUp, needsDateRange: true },
    { id: 'cash-flow', label: 'Cash Flow', icon: PieChart, needsDateRange: true },
    { id: 'trial-balance', label: 'Trial Balance', icon: FileText, needsDateRange: false },
  ];

  const currentReport = reports.find(r => r.id === reportType)!;

  const renderSection = (title: string, section: { accounts: Array<{ code: string; name: string; amount: number }>; total: number } | undefined, indent = false) => {
    if (!section) return null;
    return (
      <div className={indent ? 'ml-4' : ''}>
        <h4 className="text-slate-400 font-medium mb-2">{title}</h4>
        {section.accounts.map((acc, i) => (
          <div key={i} className="flex justify-between py-1 border-b border-slate-700/30">
            <span className="text-slate-300">{acc.code} - {acc.name}</span>
            <span className="text-white">{formatCurrency(acc.amount)}</span>
          </div>
        ))}
        <div className="flex justify-between py-2 font-semibold border-t border-slate-600">
          <span className="text-slate-300">Total {title}</span>
          <span className="text-white">{formatCurrency(section.total)}</span>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-slate-900 p-6">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div><h1 className="text-2xl font-bold text-white">Financial Reports</h1><p className="text-slate-400 mt-1">Balance Sheet, P&L, Cash Flow, and more</p></div>
          <button className="btn-primary flex items-center gap-2"><Download className="w-4 h-4" /> Export PDF</button>
        </div>

        {/* Report Selector and Date Controls */}
        <div className="card mb-6">
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex gap-2">
              {reports.map((rep) => (
                <button key={rep.id} onClick={() => setReportType(rep.id as ReportType)} className={`px-4 py-2 rounded-lg font-medium transition-colors flex items-center gap-2 ${reportType === rep.id ? 'bg-blue-600 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'}`}>
                  <rep.icon className="w-4 h-4" /> {rep.label}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2 ml-auto">
              <Calendar className="w-4 h-4 text-slate-400" />
              {currentReport.needsDateRange ? (
                <>
                  <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="input-field w-36" />
                  <span className="text-slate-400">to</span>
                  <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="input-field w-36" />
                </>
              ) : (
                <input type="date" value={asOfDate} onChange={(e) => setAsOfDate(e.target.value)} className="input-field w-40" />
              )}
            </div>
          </div>
        </div>

        {/* Report Content */}
        <div className="card">
          {/* Balance Sheet */}
          {reportType === 'balance-sheet' && (
            bsLoading ? <RefreshCw className="w-6 h-6 text-slate-400 animate-spin mx-auto" /> : bsData?.data ? (
              <div className="grid grid-cols-2 gap-8">
                <div>
                  <h3 className="text-lg font-semibold text-white mb-4 pb-2 border-b border-slate-600">Assets</h3>
                  {renderSection('Current Assets', bsData.data.assets.current)}
                  {renderSection('Fixed Assets', bsData.data.assets.fixed)}
                  {renderSection('Other Assets', bsData.data.assets.other)}
                  <div className="flex justify-between py-3 mt-4 border-t-2 border-slate-500 font-bold">
                    <span className="text-white">Total Assets</span>
                    <span className="text-green-400">{formatCurrency(bsData.data.assets.total)}</span>
                  </div>
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-white mb-4 pb-2 border-b border-slate-600">Liabilities & Equity</h3>
                  {renderSection('Current Liabilities', bsData.data.liabilities.current)}
                  {renderSection('Long-term Liabilities', bsData.data.liabilities.long_term)}
                  {renderSection('Equity', bsData.data.equity.section)}
                  <div className="flex justify-between py-3 mt-4 border-t-2 border-slate-500 font-bold">
                    <span className="text-white">Total Liabilities & Equity</span>
                    <span className="text-green-400">{formatCurrency(bsData.data.total_liabilities_equity)}</span>
                  </div>
                </div>
              </div>
            ) : <p className="text-center text-slate-400">No data available</p>
          )}

          {/* Profit & Loss */}
          {reportType === 'profit-loss' && (
            plLoading ? <RefreshCw className="w-6 h-6 text-slate-400 animate-spin mx-auto" /> : plData?.data ? (
              <div className="space-y-6">
                <div className="grid grid-cols-2 gap-8">
                  <div>
                    <h3 className="text-lg font-semibold text-white mb-4 pb-2 border-b border-slate-600">Revenue</h3>
                    {renderSection('Operating Revenue', plData.data.revenue.operating)}
                    {renderSection('Other Revenue', plData.data.revenue.other)}
                    <div className="flex justify-between py-3 mt-4 border-t-2 border-slate-500 font-bold">
                      <span className="text-white">Total Revenue</span>
                      <span className="text-green-400">{formatCurrency(plData.data.revenue.total)}</span>
                    </div>
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-white mb-4 pb-2 border-b border-slate-600">Expenses</h3>
                    {renderSection('Cost of Goods Sold', plData.data.expenses.cost_of_goods)}
                    {renderSection('Operating Expenses', plData.data.expenses.operating)}
                    {renderSection('Other Expenses', plData.data.expenses.other)}
                    <div className="flex justify-between py-3 mt-4 border-t-2 border-slate-500 font-bold">
                      <span className="text-white">Total Expenses</span>
                      <span className="text-red-400">{formatCurrency(plData.data.expenses.total)}</span>
                    </div>
                  </div>
                </div>
                <div className="bg-slate-700/50 rounded-lg p-4 grid grid-cols-3 gap-4">
                  <div><p className="text-slate-400 text-sm">Gross Profit</p><p className="text-xl font-semibold text-white">{formatCurrency(plData.data.gross_profit)}</p></div>
                  <div><p className="text-slate-400 text-sm">Operating Profit</p><p className="text-xl font-semibold text-white">{formatCurrency(plData.data.operating_profit)}</p></div>
                  <div><p className="text-slate-400 text-sm">Net Profit</p><p className={`text-xl font-semibold ${plData.data.net_profit >= 0 ? 'text-green-400' : 'text-red-400'}`}>{formatCurrency(plData.data.net_profit)}</p></div>
                </div>
              </div>
            ) : <p className="text-center text-slate-400">No data available</p>
          )}

          {/* Cash Flow */}
          {reportType === 'cash-flow' && (
            cfLoading ? <RefreshCw className="w-6 h-6 text-slate-400 animate-spin mx-auto" /> : cfData?.data ? (
              <div className="space-y-6">
                <div className="grid grid-cols-3 gap-6">
                  <div><h4 className="text-white font-medium mb-3">Operating Activities</h4>
                    {cfData.data.operating.items.map((item, i) => <div key={i} className="flex justify-between py-1 text-sm"><span className="text-slate-400">{item.description}</span><span className="text-white">{formatCurrency(item.amount)}</span></div>)}
                    <div className="flex justify-between py-2 mt-2 border-t border-slate-600 font-semibold"><span className="text-slate-300">Net Operating</span><span className={cfData.data.operating.total >= 0 ? 'text-green-400' : 'text-red-400'}>{formatCurrency(cfData.data.operating.total)}</span></div>
                  </div>
                  <div><h4 className="text-white font-medium mb-3">Investing Activities</h4>
                    {cfData.data.investing.items.map((item, i) => <div key={i} className="flex justify-between py-1 text-sm"><span className="text-slate-400">{item.description}</span><span className="text-white">{formatCurrency(item.amount)}</span></div>)}
                    <div className="flex justify-between py-2 mt-2 border-t border-slate-600 font-semibold"><span className="text-slate-300">Net Investing</span><span className={cfData.data.investing.total >= 0 ? 'text-green-400' : 'text-red-400'}>{formatCurrency(cfData.data.investing.total)}</span></div>
                  </div>
                  <div><h4 className="text-white font-medium mb-3">Financing Activities</h4>
                    {cfData.data.financing.items.map((item, i) => <div key={i} className="flex justify-between py-1 text-sm"><span className="text-slate-400">{item.description}</span><span className="text-white">{formatCurrency(item.amount)}</span></div>)}
                    <div className="flex justify-between py-2 mt-2 border-t border-slate-600 font-semibold"><span className="text-slate-300">Net Financing</span><span className={cfData.data.financing.total >= 0 ? 'text-green-400' : 'text-red-400'}>{formatCurrency(cfData.data.financing.total)}</span></div>
                  </div>
                </div>
                <div className="bg-slate-700/50 rounded-lg p-4 grid grid-cols-3 gap-4">
                  <div><p className="text-slate-400 text-sm">Opening Cash</p><p className="text-xl font-semibold text-white">{formatCurrency(cfData.data.opening_cash)}</p></div>
                  <div><p className="text-slate-400 text-sm">Net Change</p><p className={`text-xl font-semibold ${cfData.data.net_change >= 0 ? 'text-green-400' : 'text-red-400'}`}>{formatCurrency(cfData.data.net_change)}</p></div>
                  <div><p className="text-slate-400 text-sm">Closing Cash</p><p className="text-xl font-semibold text-white">{formatCurrency(cfData.data.closing_cash)}</p></div>
                </div>
              </div>
            ) : <p className="text-center text-slate-400">No data available</p>
          )}

          {/* Trial Balance */}
          {reportType === 'trial-balance' && (
            tbLoading ? <RefreshCw className="w-6 h-6 text-slate-400 animate-spin mx-auto" /> : tbData?.data ? (
              <table className="w-full">
                <thead><tr className="border-b border-slate-700"><th className="text-left py-3 px-4 text-slate-400">Code</th><th className="text-left py-3 px-4 text-slate-400">Account</th><th className="text-left py-3 px-4 text-slate-400">Type</th><th className="text-right py-3 px-4 text-slate-400">Debit</th><th className="text-right py-3 px-4 text-slate-400">Credit</th></tr></thead>
                <tbody>
                  {tbData.data.accounts.map((acc, i) => (
                    <tr key={i} className="border-b border-slate-700/50"><td className="py-2 px-4 font-mono text-slate-400">{acc.code}</td><td className="py-2 px-4 text-white">{acc.name}</td><td className="py-2 px-4 text-slate-400 text-sm">{acc.type}</td><td className="py-2 px-4 text-right text-green-400">{acc.debit > 0 ? formatCurrency(acc.debit) : '-'}</td><td className="py-2 px-4 text-right text-red-400">{acc.credit > 0 ? formatCurrency(acc.credit) : '-'}</td></tr>
                  ))}
                </tbody>
                <tfoot><tr className="bg-slate-700/50 font-semibold"><td colSpan={3} className="py-3 px-4 text-white">Total</td><td className="py-3 px-4 text-right text-green-400">{formatCurrency(tbData.data.total_debit)}</td><td className="py-3 px-4 text-right text-red-400">{formatCurrency(tbData.data.total_credit)}</td></tr></tfoot>
              </table>
            ) : <p className="text-center text-slate-400">No data available</p>
          )}
        </div>
      </div>
    </div>
  );
}
