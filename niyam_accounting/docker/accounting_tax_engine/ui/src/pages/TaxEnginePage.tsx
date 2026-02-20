import { useState } from 'react';
import { Calculator, FileText, Shield, RefreshCw, Plus } from 'lucide-react';
import { useGSTRates, useTDSSections, useTDSEntries, useCalculateGST, useCalculateTDS } from '@/hooks/useTax';

type TabType = 'gst-rates' | 'tds-sections' | 'tds-entries' | 'calculator';

export function TaxEnginePage() {
  const [activeTab, setActiveTab] = useState<TabType>('calculator');
  const [gstAmount, setGstAmount] = useState('1000');
  const [gstRate, setGstRate] = useState('18');
  const [isInterstate, setIsInterstate] = useState(false);
  const [tdsSection, setTdsSection] = useState('194C');
  const [tdsAmount, setTdsAmount] = useState('50000');
  const [tdsDeducteeType, setTdsDeducteeType] = useState<'INDIVIDUAL' | 'COMPANY'>('INDIVIDUAL');
  const [hasPan, setHasPan] = useState(true);

  const { data: gstRatesData, isLoading: gstLoading } = useGSTRates();
  const { data: tdsSectionsData, isLoading: tdsSecLoading } = useTDSSections();
  const { data: tdsEntriesData, isLoading: tdsEntLoading } = useTDSEntries({});
  const calculateGST = useCalculateGST();
  const calculateTDS = useCalculateTDS();

  const formatCurrency = (amt: number) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(amt);

  const handleCalculateGST = async () => {
    await calculateGST.mutateAsync({ base_amount: parseFloat(gstAmount), rate: parseFloat(gstRate), is_interstate: isInterstate });
  };

  const handleCalculateTDS = async () => {
    await calculateTDS.mutateAsync({ section_code: tdsSection, base_amount: parseFloat(tdsAmount), deductee_type: tdsDeducteeType, has_pan: hasPan });
  };

  const tabs = [
    { id: 'calculator', label: 'Tax Calculator', icon: Calculator },
    { id: 'gst-rates', label: 'GST Rates', icon: FileText },
    { id: 'tds-sections', label: 'TDS Sections', icon: Shield },
    { id: 'tds-entries', label: 'TDS Entries', icon: FileText },
  ];

  return (
    <div className="min-h-screen bg-slate-900 p-6">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-white">Tax Engine</h1>
            <p className="text-slate-400 mt-1">GST & TDS calculations and compliance</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-6">
          {tabs.map((tab) => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id as TabType)} className={`px-4 py-2 rounded-lg font-medium transition-colors flex items-center gap-2 ${activeTab === tab.id ? 'bg-blue-600 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'}`}>
              <tab.icon className="w-4 h-4" /> {tab.label}
            </button>
          ))}
        </div>

        {/* Calculator Tab */}
        {activeTab === 'calculator' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* GST Calculator */}
            <div className="card">
              <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2"><Calculator className="w-5 h-5" /> GST Calculator</h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm text-slate-300 mb-1">Base Amount</label>
                  <input type="number" value={gstAmount} onChange={(e) => setGstAmount(e.target.value)} className="input-field" />
                </div>
                <div>
                  <label className="block text-sm text-slate-300 mb-1">GST Rate (%)</label>
                  <select value={gstRate} onChange={(e) => setGstRate(e.target.value)} className="input-field">
                    <option value="0">0%</option><option value="5">5%</option><option value="12">12%</option><option value="18">18%</option><option value="28">28%</option>
                  </select>
                </div>
                <div className="flex items-center gap-3">
                  <input type="checkbox" id="interstate" checked={isInterstate} onChange={(e) => setIsInterstate(e.target.checked)} className="w-4 h-4" />
                  <label htmlFor="interstate" className="text-slate-300">Interstate (IGST)</label>
                </div>
                <button onClick={handleCalculateGST} disabled={calculateGST.isPending} className="btn-primary w-full">{calculateGST.isPending ? 'Calculating...' : 'Calculate GST'}</button>
                {calculateGST.data?.data && (
                  <div className="bg-slate-700/50 rounded-lg p-4 space-y-2">
                    <div className="flex justify-between"><span className="text-slate-400">Base Amount</span><span className="text-white">{formatCurrency(calculateGST.data.data.base_amount)}</span></div>
                    {!isInterstate ? (
                      <>
                        <div className="flex justify-between"><span className="text-slate-400">CGST ({parseFloat(gstRate)/2}%)</span><span className="text-white">{formatCurrency(calculateGST.data.data.cgst)}</span></div>
                        <div className="flex justify-between"><span className="text-slate-400">SGST ({parseFloat(gstRate)/2}%)</span><span className="text-white">{formatCurrency(calculateGST.data.data.sgst)}</span></div>
                      </>
                    ) : (
                      <div className="flex justify-between"><span className="text-slate-400">IGST ({gstRate}%)</span><span className="text-white">{formatCurrency(calculateGST.data.data.igst)}</span></div>
                    )}
                    <div className="flex justify-between border-t border-slate-600 pt-2"><span className="text-slate-300 font-medium">Total Amount</span><span className="text-green-400 font-semibold">{formatCurrency(calculateGST.data.data.total_amount)}</span></div>
                  </div>
                )}
              </div>
            </div>

            {/* TDS Calculator */}
            <div className="card">
              <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2"><Shield className="w-5 h-5" /> TDS Calculator</h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm text-slate-300 mb-1">TDS Section</label>
                  <select value={tdsSection} onChange={(e) => setTdsSection(e.target.value)} className="input-field">
                    <option value="194A">194A - Interest</option><option value="194C">194C - Contractor</option><option value="194H">194H - Commission</option><option value="194I">194I - Rent</option><option value="194J">194J - Professional</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-slate-300 mb-1">Payment Amount</label>
                  <input type="number" value={tdsAmount} onChange={(e) => setTdsAmount(e.target.value)} className="input-field" />
                </div>
                <div>
                  <label className="block text-sm text-slate-300 mb-1">Deductee Type</label>
                  <select value={tdsDeducteeType} onChange={(e) => setTdsDeducteeType(e.target.value as 'INDIVIDUAL' | 'COMPANY')} className="input-field">
                    <option value="INDIVIDUAL">Individual/HUF</option><option value="COMPANY">Company</option>
                  </select>
                </div>
                <div className="flex items-center gap-3">
                  <input type="checkbox" id="hasPan" checked={hasPan} onChange={(e) => setHasPan(e.target.checked)} className="w-4 h-4" />
                  <label htmlFor="hasPan" className="text-slate-300">Deductee has PAN</label>
                </div>
                <button onClick={handleCalculateTDS} disabled={calculateTDS.isPending} className="btn-primary w-full">{calculateTDS.isPending ? 'Calculating...' : 'Calculate TDS'}</button>
                {calculateTDS.data?.data && (
                  <div className="bg-slate-700/50 rounded-lg p-4 space-y-2">
                    <div className="flex justify-between"><span className="text-slate-400">Payment Amount</span><span className="text-white">{formatCurrency(parseFloat(tdsAmount))}</span></div>
                    <div className="flex justify-between"><span className="text-slate-400">TDS Rate</span><span className="text-white">{calculateTDS.data.data.rate}%</span></div>
                    <div className="flex justify-between border-t border-slate-600 pt-2"><span className="text-slate-300 font-medium">TDS Amount</span><span className="text-red-400 font-semibold">{formatCurrency(calculateTDS.data.data.tds_amount)}</span></div>
                    <div className="flex justify-between"><span className="text-slate-300 font-medium">Net Payable</span><span className="text-green-400 font-semibold">{formatCurrency(parseFloat(tdsAmount) - calculateTDS.data.data.tds_amount)}</span></div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* GST Rates Tab */}
        {activeTab === 'gst-rates' && (
          <div className="card">
            <div className="flex justify-between mb-4">
              <h2 className="text-lg font-semibold text-white">GST Rates (HSN/SAC)</h2>
              <button className="btn-primary flex items-center gap-2"><Plus className="w-4 h-4" /> Add Rate</button>
            </div>
            {gstLoading ? <RefreshCw className="w-5 h-5 text-slate-400 animate-spin mx-auto" /> : (
              <table className="w-full">
                <thead><tr className="border-b border-slate-700"><th className="text-left py-3 px-4 text-slate-400">HSN/SAC Code</th><th className="text-left py-3 px-4 text-slate-400">Description</th><th className="text-right py-3 px-4 text-slate-400">Rate</th><th className="text-right py-3 px-4 text-slate-400">CGST</th><th className="text-right py-3 px-4 text-slate-400">SGST</th><th className="text-right py-3 px-4 text-slate-400">IGST</th></tr></thead>
                <tbody>
                  {gstRatesData?.data?.map((rate) => (
                    <tr key={rate.id} className="border-b border-slate-700/50 hover:bg-slate-700/30">
                      <td className="py-3 px-4 font-mono text-slate-300">{rate.hsn_sac_code}</td>
                      <td className="py-3 px-4 text-white">{rate.description}</td>
                      <td className="py-3 px-4 text-right text-white">{rate.rate}%</td>
                      <td className="py-3 px-4 text-right text-slate-300">{rate.cgst_rate}%</td>
                      <td className="py-3 px-4 text-right text-slate-300">{rate.sgst_rate}%</td>
                      <td className="py-3 px-4 text-right text-slate-300">{rate.igst_rate}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* TDS Sections Tab */}
        {activeTab === 'tds-sections' && (
          <div className="card">
            <div className="flex justify-between mb-4">
              <h2 className="text-lg font-semibold text-white">TDS Sections</h2>
              <button className="btn-primary flex items-center gap-2"><Plus className="w-4 h-4" /> Add Section</button>
            </div>
            {tdsSecLoading ? <RefreshCw className="w-5 h-5 text-slate-400 animate-spin mx-auto" /> : (
              <table className="w-full">
                <thead><tr className="border-b border-slate-700"><th className="text-left py-3 px-4 text-slate-400">Section</th><th className="text-left py-3 px-4 text-slate-400">Description</th><th className="text-right py-3 px-4 text-slate-400">Threshold</th><th className="text-right py-3 px-4 text-slate-400">Individual</th><th className="text-right py-3 px-4 text-slate-400">Company</th><th className="text-right py-3 px-4 text-slate-400">No PAN</th></tr></thead>
                <tbody>
                  {tdsSectionsData?.data?.map((sec) => (
                    <tr key={sec.id} className="border-b border-slate-700/50 hover:bg-slate-700/30">
                      <td className="py-3 px-4 font-mono text-blue-400">{sec.section_code}</td>
                      <td className="py-3 px-4 text-white">{sec.section_name}</td>
                      <td className="py-3 px-4 text-right text-slate-300">{formatCurrency(sec.threshold_amount)}</td>
                      <td className="py-3 px-4 text-right text-slate-300">{sec.rate_individual}%</td>
                      <td className="py-3 px-4 text-right text-slate-300">{sec.rate_company}%</td>
                      <td className="py-3 px-4 text-right text-red-400">{sec.rate_no_pan}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* TDS Entries Tab */}
        {activeTab === 'tds-entries' && (
          <div className="card">
            <div className="flex justify-between mb-4">
              <h2 className="text-lg font-semibold text-white">TDS Entries</h2>
              <button className="btn-primary flex items-center gap-2"><Plus className="w-4 h-4" /> Record TDS</button>
            </div>
            {tdsEntLoading ? <RefreshCw className="w-5 h-5 text-slate-400 animate-spin mx-auto" /> : (
              <table className="w-full">
                <thead><tr className="border-b border-slate-700"><th className="text-left py-3 px-4 text-slate-400">Date</th><th className="text-left py-3 px-4 text-slate-400">Section</th><th className="text-left py-3 px-4 text-slate-400">Deductee</th><th className="text-left py-3 px-4 text-slate-400">PAN</th><th className="text-right py-3 px-4 text-slate-400">Amount</th><th className="text-right py-3 px-4 text-slate-400">TDS</th><th className="text-center py-3 px-4 text-slate-400">Status</th></tr></thead>
                <tbody>
                  {tdsEntriesData?.data?.map((entry) => (
                    <tr key={entry.id} className="border-b border-slate-700/50 hover:bg-slate-700/30">
                      <td className="py-3 px-4 text-slate-300">{new Date(entry.transaction_date).toLocaleDateString('en-IN')}</td>
                      <td className="py-3 px-4 font-mono text-blue-400">{entry.section_code}</td>
                      <td className="py-3 px-4 text-white">{entry.deductee_name}</td>
                      <td className="py-3 px-4 font-mono text-slate-400">{entry.deductee_pan}</td>
                      <td className="py-3 px-4 text-right text-white">{formatCurrency(entry.base_amount)}</td>
                      <td className="py-3 px-4 text-right text-red-400">{formatCurrency(entry.tds_amount)}</td>
                      <td className="py-3 px-4 text-center"><span className={`text-xs px-2 py-1 rounded ${entry.status === 'DEPOSITED' ? 'bg-green-500/20 text-green-400' : entry.status === 'DEDUCTED' ? 'bg-blue-500/20 text-blue-400' : 'bg-yellow-500/20 text-yellow-400'}`}>{entry.status}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
