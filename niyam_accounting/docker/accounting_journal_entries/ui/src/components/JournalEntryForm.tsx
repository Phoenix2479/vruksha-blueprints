import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { X, Plus, Trash2 } from 'lucide-react';
import { useCreateJournalEntry, useUpdateJournalEntry, useAccounts } from '@/hooks/useJournal';
import type { JournalEntry, CreateJournalEntryInput, JournalEntryType } from '@/types';

interface LineItem {
  id: string;
  account_id: string;
  debit_amount: number;
  credit_amount: number;
  description: string;
}

interface Props {
  entry?: JournalEntry | null;
  onClose: () => void;
  onSuccess: () => void;
}

const entryTypes: JournalEntryType[] = ['STANDARD', 'ADJUSTING', 'CLOSING', 'REVERSING', 'RECURRING'];

export function JournalEntryForm({ entry, onClose, onSuccess }: Props) {
  const isEdit = !!entry;
  const createEntry = useCreateJournalEntry();
  const updateEntry = useUpdateJournalEntry();
  const { data: accountsData } = useAccounts();

  const [lines, setLines] = useState<LineItem[]>(() => {
    if (entry?.lines?.length) {
      return entry.lines.map((l) => ({
        id: l.id,
        account_id: l.account_id,
        debit_amount: l.debit_amount,
        credit_amount: l.credit_amount,
        description: l.description || '',
      }));
    }
    return [
      { id: '1', account_id: '', debit_amount: 0, credit_amount: 0, description: '' },
      { id: '2', account_id: '', debit_amount: 0, credit_amount: 0, description: '' },
    ];
  });

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm({
    defaultValues: {
      entry_date: entry?.entry_date?.split('T')[0] || new Date().toISOString().split('T')[0],
      entry_type: entry?.entry_type || 'STANDARD',
      description: entry?.description || '',
      reference_number: entry?.reference_number || '',
    },
  });

  const totalDebit = lines.reduce((sum, l) => sum + (l.debit_amount || 0), 0);
  const totalCredit = lines.reduce((sum, l) => sum + (l.credit_amount || 0), 0);
  const isBalanced = Math.abs(totalDebit - totalCredit) < 0.01;

  const addLine = () => {
    setLines([...lines, { id: Date.now().toString(), account_id: '', debit_amount: 0, credit_amount: 0, description: '' }]);
  };

  const removeLine = (id: string) => {
    if (lines.length > 2) {
      setLines(lines.filter((l) => l.id !== id));
    }
  };

  const updateLine = (id: string, field: keyof LineItem, value: string | number) => {
    setLines(lines.map((l) => {
      if (l.id === id) {
        const updated = { ...l, [field]: value };
        // Clear the opposite field when entering a value
        if (field === 'debit_amount' && value) updated.credit_amount = 0;
        if (field === 'credit_amount' && value) updated.debit_amount = 0;
        return updated;
      }
      return l;
    }));
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 2,
    }).format(amount);
  };

  const onSubmit = async (data: { entry_date: string; entry_type: string; description: string; reference_number: string }) => {
    const validLines = lines.filter((l) => l.account_id && (l.debit_amount || l.credit_amount));
    if (validLines.length < 2) {
      alert('At least 2 lines with amounts are required');
      return;
    }
    if (!isBalanced) {
      alert('Entry must be balanced (debits = credits)');
      return;
    }

    const input: CreateJournalEntryInput = {
      entry_date: data.entry_date,
      entry_type: data.entry_type as JournalEntryType,
      description: data.description,
      reference_number: data.reference_number || undefined,
      lines: validLines.map((l) => ({
        account_id: l.account_id,
        debit_amount: l.debit_amount || undefined,
        credit_amount: l.credit_amount || undefined,
        description: l.description || undefined,
      })),
    };

    try {
      if (isEdit && entry) {
        await updateEntry.mutateAsync({ id: entry.id, input });
      } else {
        await createEntry.mutateAsync(input);
      }
      onSuccess();
    } catch (error) {
      console.error('Failed to save:', error);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-slate-800 rounded-xl border border-slate-700 w-full max-w-4xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b border-slate-700">
          <h2 className="text-lg font-semibold text-white">
            {isEdit ? 'Edit Journal Entry' : 'New Journal Entry'}
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="p-4 space-y-4">
          {/* Header Fields */}
          <div className="grid grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">Date *</label>
              <input
                type="date"
                {...register('entry_date', { required: true })}
                className="input-field"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">Type</label>
              <select {...register('entry_type')} className="input-field">
                {entryTypes.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
            <div className="col-span-2">
              <label className="block text-sm font-medium text-slate-300 mb-1">Reference</label>
              <input
                {...register('reference_number')}
                className="input-field"
                placeholder="Invoice #, Check #, etc."
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">Description *</label>
            <input
              {...register('description', { required: true })}
              className="input-field"
              placeholder="Enter description"
            />
          </div>

          {/* Line Items */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-slate-300">Line Items</label>
              <button type="button" onClick={addLine} className="text-sm text-blue-400 hover:text-blue-300 flex items-center gap-1">
                <Plus className="w-4 h-4" /> Add Line
              </button>
            </div>
            <div className="border border-slate-600 rounded-lg overflow-hidden">
              <table className="w-full">
                <thead className="bg-slate-700/50">
                  <tr>
                    <th className="text-left py-2 px-3 text-slate-400 text-sm font-medium">Account</th>
                    <th className="text-left py-2 px-3 text-slate-400 text-sm font-medium w-32">Debit</th>
                    <th className="text-left py-2 px-3 text-slate-400 text-sm font-medium w-32">Credit</th>
                    <th className="text-left py-2 px-3 text-slate-400 text-sm font-medium">Memo</th>
                    <th className="w-10"></th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((line) => (
                    <tr key={line.id} className="border-t border-slate-700">
                      <td className="py-2 px-3">
                        <select
                          value={line.account_id}
                          onChange={(e) => updateLine(line.id, 'account_id', e.target.value)}
                          className="input-field py-1 text-sm"
                        >
                          <option value="">Select account</option>
                          {accountsData?.data?.map((acc) => (
                            <option key={acc.id} value={acc.id}>
                              {acc.account_code} - {acc.account_name}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="py-2 px-3">
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={line.debit_amount || ''}
                          onChange={(e) => updateLine(line.id, 'debit_amount', parseFloat(e.target.value) || 0)}
                          className="input-field py-1 text-sm text-right"
                          placeholder="0.00"
                        />
                      </td>
                      <td className="py-2 px-3">
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={line.credit_amount || ''}
                          onChange={(e) => updateLine(line.id, 'credit_amount', parseFloat(e.target.value) || 0)}
                          className="input-field py-1 text-sm text-right"
                          placeholder="0.00"
                        />
                      </td>
                      <td className="py-2 px-3">
                        <input
                          value={line.description}
                          onChange={(e) => updateLine(line.id, 'description', e.target.value)}
                          className="input-field py-1 text-sm"
                          placeholder="Line memo"
                        />
                      </td>
                      <td className="py-2 px-3">
                        <button
                          type="button"
                          onClick={() => removeLine(line.id)}
                          className="text-slate-400 hover:text-red-400"
                          disabled={lines.length <= 2}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-slate-700/50 font-semibold">
                  <tr>
                    <td className="py-2 px-3 text-white">Total</td>
                    <td className="py-2 px-3 text-right text-green-400">{formatCurrency(totalDebit)}</td>
                    <td className="py-2 px-3 text-right text-red-400">{formatCurrency(totalCredit)}</td>
                    <td colSpan={2} className="py-2 px-3">
                      {isBalanced ? (
                        <span className="text-green-400 text-sm">Balanced</span>
                      ) : (
                        <span className="text-red-400 text-sm">
                          Difference: {formatCurrency(Math.abs(totalDebit - totalCredit))}
                        </span>
                      )}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <button type="button" onClick={onClose} className="btn-secondary">
              Cancel
            </button>
            <button type="submit" disabled={isSubmitting || !isBalanced} className="btn-primary">
              {isSubmitting ? 'Saving...' : isEdit ? 'Update' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
