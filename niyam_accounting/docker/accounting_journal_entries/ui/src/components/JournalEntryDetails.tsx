import { Edit, Trash2, X, CheckCircle, RotateCcw } from 'lucide-react';
import type { JournalEntry } from '@/types';

interface Props {
  entry: JournalEntry;
  onEdit: () => void;
  onPost: () => void;
  onDelete: () => void;
  onClose: () => void;
}

export function JournalEntryDetails({ entry, onEdit, onPost, onDelete, onClose }: Props) {
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 2,
    }).format(amount);
  };

  const canEdit = entry.status === 'DRAFT';
  const canPost = entry.status === 'DRAFT' && entry.is_balanced;
  const canDelete = entry.status === 'DRAFT';

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-white">Entry Details</h3>
        <button onClick={onClose} className="text-slate-400 hover:text-white">
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="space-y-4">
        {/* Header Info */}
        <div className="bg-slate-700/50 rounded-lg p-4">
          <div className="flex items-center gap-3 mb-2">
            <span className="font-mono text-lg text-slate-300">{entry.entry_number}</span>
            <span className={`text-xs px-2 py-0.5 rounded ${
              entry.status === 'POSTED' ? 'bg-green-500/20 text-green-400' :
              entry.status === 'REVERSED' ? 'bg-red-500/20 text-red-400' :
              entry.status === 'PENDING' ? 'bg-yellow-500/20 text-yellow-400' :
              'bg-slate-500/20 text-slate-400'
            }`}>
              {entry.status}
            </span>
          </div>
          <p className="text-white mb-2">{entry.description}</p>
          <div className="flex items-center gap-4 text-sm text-slate-400">
            <span>Date: {new Date(entry.entry_date).toLocaleDateString('en-IN')}</span>
            <span>Type: {entry.entry_type}</span>
          </div>
          {entry.reference_number && (
            <p className="text-sm text-slate-400 mt-1">Ref: {entry.reference_number}</p>
          )}
        </div>

        {/* Totals */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-slate-700/50 rounded-lg p-3">
            <p className="text-xs text-slate-400 mb-1">Total Debit</p>
            <p className="text-xl font-semibold text-green-400">{formatCurrency(entry.total_debit)}</p>
          </div>
          <div className="bg-slate-700/50 rounded-lg p-3">
            <p className="text-xs text-slate-400 mb-1">Total Credit</p>
            <p className="text-xl font-semibold text-red-400">{formatCurrency(entry.total_credit)}</p>
          </div>
        </div>

        {/* Balance Status */}
        <div className={`rounded-lg p-3 flex items-center gap-2 ${
          entry.is_balanced ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'
        }`}>
          {entry.is_balanced ? (
            <>
              <CheckCircle className="w-4 h-4" />
              <span className="text-sm">Entry is balanced</span>
            </>
          ) : (
            <>
              <X className="w-4 h-4" />
              <span className="text-sm">Entry is unbalanced by {formatCurrency(Math.abs(entry.total_debit - entry.total_credit))}</span>
            </>
          )}
        </div>

        {/* Line Items */}
        {entry.lines && entry.lines.length > 0 && (
          <div>
            <p className="text-sm font-medium text-slate-300 mb-2">Line Items</p>
            <div className="space-y-2">
              {entry.lines.map((line) => (
                <div key={line.id} className="bg-slate-700/50 rounded-lg p-3">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-white text-sm">
                      {line.account_code} - {line.account_name}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    {line.description && (
                      <span className="text-slate-400">{line.description}</span>
                    )}
                    <div className="flex gap-4 ml-auto">
                      {line.debit_amount > 0 && (
                        <span className="text-green-400">Dr: {formatCurrency(line.debit_amount)}</span>
                      )}
                      {line.credit_amount > 0 && (
                        <span className="text-red-400">Cr: {formatCurrency(line.credit_amount)}</span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Metadata */}
        <div className="text-xs text-slate-500 space-y-1">
          <p>Created: {new Date(entry.created_at).toLocaleString()}</p>
          {entry.posted_at && <p>Posted: {new Date(entry.posted_at).toLocaleString()}</p>}
        </div>

        {/* Actions */}
        <div className="flex gap-2 pt-4 border-t border-slate-700">
          {canEdit && (
            <button onClick={onEdit} className="flex-1 btn-secondary flex items-center justify-center gap-2">
              <Edit className="w-4 h-4" />
              Edit
            </button>
          )}
          {canPost && (
            <button
              onClick={onPost}
              className="flex-1 bg-green-600 hover:bg-green-700 text-white font-medium py-2 px-4 rounded-lg transition-colors flex items-center justify-center gap-2"
            >
              <CheckCircle className="w-4 h-4" />
              Post
            </button>
          )}
          {canDelete && (
            <button
              onClick={onDelete}
              className="bg-red-600/20 hover:bg-red-600/30 text-red-400 font-medium py-2 px-4 rounded-lg transition-colors flex items-center justify-center gap-2"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
