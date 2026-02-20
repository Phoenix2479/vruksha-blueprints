import { useState } from 'react';
import { Calendar, Lock, Unlock, Plus, RefreshCw, Target, Building2, CheckCircle } from 'lucide-react';
import { useFiscalYears, useFiscalPeriods, useBudgets, useCostCenters, useCreateFiscalYear, useClosePeriod, useReopenPeriod, useCloseFiscalYear } from '@/hooks/useFiscal';
import type { FiscalYear } from '@/types';

type TabType = 'fiscal-years' | 'periods' | 'budgets' | 'cost-centers';

export function FiscalPeriodsPage() {
  const [activeTab, setActiveTab] = useState<TabType>('fiscal-years');
  const [selectedYear, setSelectedYear] = useState<FiscalYear | null>(null);
  const [showNewYearModal, setShowNewYearModal] = useState(false);
  const [newYearName, setNewYearName] = useState('');
  const [newYearStart, setNewYearStart] = useState('');
  const [newYearEnd, setNewYearEnd] = useState('');

  const { data: yearsData, isLoading: yearsLoading, refetch: refetchYears } = useFiscalYears();
  const { data: periodsData, isLoading: periodsLoading } = useFiscalPeriods(selectedYear?.id || '');
  const { data: budgetsData, isLoading: budgetsLoading } = useBudgets(selectedYear?.id);
  const { data: costCentersData, isLoading: ccLoading } = useCostCenters();
  const createFiscalYear = useCreateFiscalYear();
  const closePeriod = useClosePeriod();
  const reopenPeriod = useReopenPeriod();
  const closeFiscalYear = useCloseFiscalYear();

  const formatCurrency = (amt: number) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(amt);
  const statusColors: Record<string, string> = { OPEN: 'bg-green-500/20 text-green-400', CLOSED: 'bg-yellow-500/20 text-yellow-400', LOCKED: 'bg-red-500/20 text-red-400' };

  const tabs = [
    { id: 'fiscal-years', label: 'Fiscal Years', icon: Calendar },
    { id: 'periods', label: 'Periods', icon: Calendar },
    { id: 'budgets', label: 'Budgets', icon: Target },
    { id: 'cost-centers', label: 'Cost Centers', icon: Building2 },
  ];

  const handleCreateYear = async () => {
    if (!newYearName || !newYearStart || !newYearEnd) return;
    await createFiscalYear.mutateAsync({ year_name: newYearName, start_date: newYearStart, end_date: newYearEnd });
    setShowNewYearModal(false);
    setNewYearName(''); setNewYearStart(''); setNewYearEnd('');
    refetchYears();
  };

  return (
    <div className="min-h-screen bg-slate-900 p-6">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div><h1 className="text-2xl font-bold text-white">Fiscal Periods & Budgets</h1><p className="text-slate-400 mt-1">Manage fiscal years, periods, and budgets</p></div>
          <button onClick={() => setShowNewYearModal(true)} className="btn-primary flex items-center gap-2"><Plus className="w-4 h-4" /> New Fiscal Year</button>
        </div>

        {/* Summary */}
        <div className="grid grid-cols-4 gap-4 mb-6">
          <div className="card"><p className="text-sm text-slate-400 mb-1">Total Fiscal Years</p><p className="text-2xl font-semibold text-white">{yearsData?.data?.length || 0}</p></div>
          <div className="card"><p className="text-sm text-slate-400 mb-1">Current Year</p><p className="text-xl font-semibold text-green-400">{yearsData?.data?.find(y => y.is_current)?.year_name || 'None'}</p></div>
          <div className="card"><p className="text-sm text-slate-400 mb-1">Open Periods</p><p className="text-2xl font-semibold text-blue-400">{periodsData?.data?.filter(p => p.status === 'OPEN').length || 0}</p></div>
          <div className="card"><p className="text-sm text-slate-400 mb-1">Active Budgets</p><p className="text-2xl font-semibold text-purple-400">{budgetsData?.data?.length || 0}</p></div>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-6">
          {tabs.map((tab) => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id as TabType)} className={`px-4 py-2 rounded-lg font-medium transition-colors flex items-center gap-2 ${activeTab === tab.id ? 'bg-blue-600 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'}`}>
              <tab.icon className="w-4 h-4" /> {tab.label}
            </button>
          ))}
        </div>

        {/* Fiscal Years */}
        {activeTab === 'fiscal-years' && (
          <div className="card">
            <h2 className="text-lg font-semibold text-white mb-4">Fiscal Years</h2>
            {yearsLoading ? <RefreshCw className="w-5 h-5 text-slate-400 animate-spin mx-auto" /> : (
              <div className="space-y-3">
                {yearsData?.data?.map((year) => (
                  <div key={year.id} onClick={() => setSelectedYear(year)} className={`p-4 rounded-lg border cursor-pointer transition-colors ${selectedYear?.id === year.id ? 'bg-slate-700 border-blue-500' : 'bg-slate-700/50 border-slate-600 hover:bg-slate-700'}`}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span className="text-white font-semibold">{year.year_name}</span>
                        {year.is_current && <span className="text-xs px-2 py-0.5 rounded bg-blue-500/20 text-blue-400">Current</span>}
                        <span className={`text-xs px-2 py-0.5 rounded ${statusColors[year.status]}`}>{year.status}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-slate-400">{new Date(year.start_date).toLocaleDateString('en-IN')} - {new Date(year.end_date).toLocaleDateString('en-IN')}</span>
                        {year.status === 'OPEN' && (
                          <button onClick={(e) => { e.stopPropagation(); closeFiscalYear.mutateAsync(year.id); }} className="text-yellow-400 hover:text-yellow-300 p-1" title="Close Year"><Lock className="w-4 h-4" /></button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Periods */}
        {activeTab === 'periods' && (
          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-white">Fiscal Periods</h2>
              <select value={selectedYear?.id || ''} onChange={(e) => { const y = yearsData?.data?.find(y => y.id === e.target.value); setSelectedYear(y || null); }} className="input-field w-48">
                <option value="">Select Fiscal Year</option>
                {yearsData?.data?.map((y) => <option key={y.id} value={y.id}>{y.year_name}</option>)}
              </select>
            </div>
            {!selectedYear ? <p className="text-center text-slate-400 py-8">Select a fiscal year to view periods</p> : periodsLoading ? <RefreshCw className="w-5 h-5 text-slate-400 animate-spin mx-auto" /> : (
              <table className="w-full">
                <thead><tr className="border-b border-slate-700"><th className="text-left py-3 px-4 text-slate-400">#</th><th className="text-left py-3 px-4 text-slate-400">Period</th><th className="text-left py-3 px-4 text-slate-400">Start Date</th><th className="text-left py-3 px-4 text-slate-400">End Date</th><th className="text-center py-3 px-4 text-slate-400">Status</th><th className="text-center py-3 px-4 text-slate-400">Actions</th></tr></thead>
                <tbody>
                  {periodsData?.data?.map((period) => (
                    <tr key={period.id} className="border-b border-slate-700/50">
                      <td className="py-3 px-4 text-slate-400">{period.period_number}</td>
                      <td className="py-3 px-4 text-white">{period.period_name}</td>
                      <td className="py-3 px-4 text-slate-300">{new Date(period.start_date).toLocaleDateString('en-IN')}</td>
                      <td className="py-3 px-4 text-slate-300">{new Date(period.end_date).toLocaleDateString('en-IN')}</td>
                      <td className="py-3 px-4 text-center"><span className={`text-xs px-2 py-1 rounded ${statusColors[period.status]}`}>{period.status}</span></td>
                      <td className="py-3 px-4 text-center">
                        {period.status === 'OPEN' && <button onClick={() => closePeriod.mutateAsync(period.id)} className="text-yellow-400 hover:text-yellow-300 p-1" title="Close Period"><Lock className="w-4 h-4" /></button>}
                        {period.status === 'CLOSED' && <button onClick={() => reopenPeriod.mutateAsync(period.id)} className="text-green-400 hover:text-green-300 p-1" title="Reopen Period"><Unlock className="w-4 h-4" /></button>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* Budgets */}
        {activeTab === 'budgets' && (
          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-white">Budgets</h2>
              <button className="btn-primary flex items-center gap-2"><Plus className="w-4 h-4" /> New Budget</button>
            </div>
            {budgetsLoading ? <RefreshCw className="w-5 h-5 text-slate-400 animate-spin mx-auto" /> : (
              <table className="w-full">
                <thead><tr className="border-b border-slate-700"><th className="text-left py-3 px-4 text-slate-400">Budget</th><th className="text-left py-3 px-4 text-slate-400">Account</th><th className="text-left py-3 px-4 text-slate-400">Cost Center</th><th className="text-right py-3 px-4 text-slate-400">Budgeted</th><th className="text-right py-3 px-4 text-slate-400">Actual</th><th className="text-right py-3 px-4 text-slate-400">Variance</th><th className="text-right py-3 px-4 text-slate-400">%</th></tr></thead>
                <tbody>
                  {budgetsData?.data?.map((budget) => (
                    <tr key={budget.id} className="border-b border-slate-700/50">
                      <td className="py-3 px-4 text-white">{budget.budget_name}</td>
                      <td className="py-3 px-4 text-slate-300">{budget.account_name}</td>
                      <td className="py-3 px-4 text-slate-400">{budget.cost_center_name || '-'}</td>
                      <td className="py-3 px-4 text-right text-white">{formatCurrency(budget.budgeted_amount)}</td>
                      <td className="py-3 px-4 text-right text-slate-300">{formatCurrency(budget.actual_amount)}</td>
                      <td className={`py-3 px-4 text-right ${budget.variance >= 0 ? 'text-green-400' : 'text-red-400'}`}>{formatCurrency(budget.variance)}</td>
                      <td className={`py-3 px-4 text-right ${budget.variance_percentage >= 0 ? 'text-green-400' : 'text-red-400'}`}>{budget.variance_percentage.toFixed(1)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* Cost Centers */}
        {activeTab === 'cost-centers' && (
          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-white">Cost Centers</h2>
              <button className="btn-primary flex items-center gap-2"><Plus className="w-4 h-4" /> New Cost Center</button>
            </div>
            {ccLoading ? <RefreshCw className="w-5 h-5 text-slate-400 animate-spin mx-auto" /> : (
              <table className="w-full">
                <thead><tr className="border-b border-slate-700"><th className="text-left py-3 px-4 text-slate-400">Code</th><th className="text-left py-3 px-4 text-slate-400">Name</th><th className="text-left py-3 px-4 text-slate-400">Description</th><th className="text-center py-3 px-4 text-slate-400">Status</th></tr></thead>
                <tbody>
                  {costCentersData?.data?.map((cc) => (
                    <tr key={cc.id} className="border-b border-slate-700/50">
                      <td className="py-3 px-4 font-mono text-slate-300">{cc.code}</td>
                      <td className="py-3 px-4 text-white">{cc.name}</td>
                      <td className="py-3 px-4 text-slate-400">{cc.description || '-'}</td>
                      <td className="py-3 px-4 text-center"><span className={`text-xs px-2 py-1 rounded ${cc.is_active ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>{cc.is_active ? 'Active' : 'Inactive'}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* New Fiscal Year Modal */}
        {showNewYearModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-slate-800 rounded-xl border border-slate-700 p-6 w-full max-w-md">
              <h3 className="text-lg font-semibold text-white mb-4">Create Fiscal Year</h3>
              <div className="space-y-4">
                <div><label className="block text-sm text-slate-300 mb-1">Year Name</label><input value={newYearName} onChange={(e) => setNewYearName(e.target.value)} className="input-field" placeholder="e.g., FY 2024-25" /></div>
                <div><label className="block text-sm text-slate-300 mb-1">Start Date</label><input type="date" value={newYearStart} onChange={(e) => setNewYearStart(e.target.value)} className="input-field" /></div>
                <div><label className="block text-sm text-slate-300 mb-1">End Date</label><input type="date" value={newYearEnd} onChange={(e) => setNewYearEnd(e.target.value)} className="input-field" /></div>
                <div className="flex gap-3 pt-4"><button onClick={() => setShowNewYearModal(false)} className="flex-1 btn-secondary">Cancel</button><button onClick={handleCreateYear} className="flex-1 btn-primary">Create</button></div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
