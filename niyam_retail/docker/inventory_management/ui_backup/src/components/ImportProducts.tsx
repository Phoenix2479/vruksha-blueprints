import React, { useState } from 'react';
import { UploadCloud, CheckCircle2, AlertTriangle } from 'lucide-react';
import { Button, Input } from '../../../../shared/components/index.ts';
import { createImportSession, uploadImportFiles, getImportPreview, commitImport } from '../api/inventory';

interface ImportProductsProps {
  isOpen: boolean;
  onClose: () => void;
  onCompleted: () => void;
}

export const ImportProducts: React.FC<ImportProductsProps> = ({ isOpen, onClose, onCompleted }) => {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [files, setFiles] = useState<File[]>([]);
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [defaultTax, setDefaultTax] = useState('0');
  const [defaultCategory, setDefaultCategory] = useState('');
  const [strategy, setStrategy] = useState<'create' | 'upsert'>('create');
  const [importNotes, setImportNotes] = useState('');

  if (!isOpen) return null;

  const startSession = async () => {
    if (sessionId) return sessionId;
    const res = await createImportSession();
    setSessionId(res.session_id);
    return res.session_id;
  };

  const handleFiles = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    const fs: File[] = Array.from(fileList);
    setFiles(fs);
  };

  const handleUpload = async () => {
    if (!files.length) return;
    setLoading(true);
    try {
      const sid = await startSession();
      const res = await uploadImportFiles(sid, files);
      setWarnings(res.warnings || []);
      const preview = await getImportPreview(sid);
      setRows(preview);
      setStep(2);
    } catch (e) {
      alert('Failed to parse file. Please check format (CSV/XLSX).');
    } finally {
      setLoading(false);
    }
  };

  const handleCommit = async () => {
    if (!sessionId) return;
    setLoading(true);
    try {
      const res = await commitImport(sessionId, {
        strategy,
        default_tax: parseFloat(defaultTax || '0') || 0,
        default_category: defaultCategory || undefined,
        rows,
        import_notes: importNotes || undefined,
      } as any);
      setWarnings(res.warnings || []);
      setStep(3);
    } catch (e) {
      alert('Import failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-5xl max-h-[90vh] overflow-hidden">
        <div className="px-6 py-4 border-b flex items-center justify-between">
          <h2 className="text-lg font-semibold">Bulk Import Products</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700">✕</button>
        </div>

        <div className="p-6 space-y-6 overflow-auto">
          {step === 1 && (
            <div>
              <p className="text-sm text-gray-600 mb-4">Upload a CSV/XLSX exported from your vendor bill or any list. We’ll auto-detect columns and let you review before importing.</p>
              <div className="border-2 border-dashed rounded-lg p-8 text-center">
                <UploadCloud className="w-10 h-10 mx-auto text-gray-400" />
                <p className="mt-2 text-gray-700">Drag & drop files here, or click to select</p>
                <input type="file" accept=".csv,.xlsx,.xls" multiple onChange={(e) => handleFiles(e.target.files)} className="mt-4" />
              </div>

              {!!files.length && (
                <div className="mt-4 text-sm text-gray-700">Selected: {files.map(f => f.name).join(', ')}</div>
              )}

              <div className="mt-6 flex items-center gap-3">
                <Button variant="secondary" onClick={onClose}>Cancel</Button>
                <Button variant="primary" onClick={handleUpload} loading={loading} disabled={!files.length}>Upload & Preview</Button>
              </div>
            </div>
          )}

          {step === 2 && (
            <div>
              <div className="flex items-center gap-4 mb-4">
                <div className="w-40">
                  <label className="label">Strategy</label>
                  <select className="input" value={strategy} onChange={(e) => setStrategy(e.target.value as any)}>
                    <option value="create">Create</option>
                    <option value="upsert">Upsert by SKU</option>
                  </select>
                </div>
                <div className="w-32">
                  <label className="label">Default Tax %</label>
                  <Input value={defaultTax} onChange={(e: any) => setDefaultTax(e.target.value)} placeholder="0" />
                </div>
                <div className="w-56">
                  <label className="label">Default Category</label>
                  <Input value={defaultCategory} onChange={(e: any) => setDefaultCategory(e.target.value)} placeholder="(optional)" />
                </div>
              </div>

              <div className="mb-4">
                <label className="label">Import Notes (optional)</label>
                <textarea
                  className="input min-h-[60px]"
                  value={importNotes}
                  onChange={(e) => setImportNotes(e.target.value)}
                  placeholder="E.g., Vendor bill #1234, Fall collection restock, corrections applied, etc."
                />
              </div>

              <div className="overflow-auto border rounded-lg">
                <table className="min-w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      {['name','sku','category','unit_price','tax_rate','quantity'].map(h => (
                        <th key={h} className="px-3 py-2 text-left font-medium text-gray-600">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r, idx) => (
                      <tr key={idx} className="border-t">
                        <td className="px-3 py-2"><Input value={r.name || ''} onChange={(e: any) => { const v=e.target.value; setRows(prev => prev.map((x,i)=> i===idx? {...x, name:v}: x)); }} /></td>
                        <td className="px-3 py-2"><Input value={r.sku || ''} onChange={(e: any) => { const v=e.target.value; setRows(prev => prev.map((x,i)=> i===idx? {...x, sku:v}: x)); }} /></td>
                        <td className="px-3 py-2"><Input value={r.category || ''} onChange={(e: any) => { const v=e.target.value; setRows(prev => prev.map((x,i)=> i===idx? {...x, category:v}: x)); }} /></td>
                        <td className="px-3 py-2"><Input value={r.unit_price ?? ''} onChange={(e: any) => { const v=e.target.value; setRows(prev => prev.map((x,i)=> i===idx? {...x, unit_price:v}: x)); }} /></td>
                        <td className="px-3 py-2"><Input value={r.tax_rate ?? ''} onChange={(e: any) => { const v=e.target.value; setRows(prev => prev.map((x,i)=> i===idx? {...x, tax_rate:v}: x)); }} /></td>
                        <td className="px-3 py-2"><Input value={r.quantity ?? ''} onChange={(e: any) => { const v=e.target.value; setRows(prev => prev.map((x,i)=> i===idx? {...x, quantity:v}: x)); }} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {!!warnings.length && (
                <div className="mt-3 text-sm text-yellow-700 bg-yellow-50 border border-yellow-200 rounded p-3 flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 mt-[2px]" />
                  <div>
                    <p className="font-medium">Warnings</p>
                    <ul className="list-disc ml-5">
                      {warnings.map((w, i) => <li key={i}>{w}</li>)}
                    </ul>
                  </div>
                </div>
              )}

              <div className="mt-6 flex items-center gap-3">
                <Button variant="secondary" onClick={onClose}>Cancel</Button>
                <Button variant="primary" onClick={handleCommit} loading={loading} disabled={!rows.length}>Import Products</Button>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="text-center py-10">
              <CheckCircle2 className="w-12 h-12 text-green-600 mx-auto" />
              <h3 className="mt-3 text-lg font-semibold">Import Completed</h3>
              {!!warnings.length && (
                <p className="mt-2 text-sm text-yellow-700">Some warnings occurred. Review the imported products.</p>
              )}
              <div className="mt-6">
                <Button variant="primary" onClick={() => { onCompleted(); onClose(); }}>Done</Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
