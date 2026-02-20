import { useState } from 'react';
import { Plus, Search, RefreshCw, FileText, CheckCircle, Clock, XCircle } from 'lucide-react';
import { useJournalEntries, usePostJournalEntry, useDeleteJournalEntry } from '@/hooks/useJournal';
import { JournalEntryForm } from '@/components/JournalEntryForm';
import { JournalEntryDetails } from '@/components/JournalEntryDetails';
import type { JournalEntry, JournalEntryStatus } from '@/types';

const statusConfig: Record<JournalEntryStatus, { color: string; icon: typeof CheckCircle }> = {
  DRAFT: { color: 'bg-slate-500/20 text-slate-400 border-slate-500/30', icon: FileText },
  PENDING: { color: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30', icon: Clock },
  POSTED: { color: 'bg-green-500/20 text-green-400 border-green-500/30', icon: CheckCircle },
  REVERSED: { color: 'bg-red-500/20 text-red-400 border-red-500/30', icon: XCircle },
};

export function JournalEntriesPage() {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [showForm, setShowForm] = useState(false);
  const [selectedEntry, setSelectedEntry] = useState<JournalEntry | null>(null);
  const [editEntry, setEditEntry] = useState<JournalEntry | null>(null);

  const { data: entriesData, isLoading, refetch } = useJournalEntries({
    status: statusFilter || undefined,
    search: searchTerm || undefined,
    limit: 50,
  });

  const postEntry = usePostJournalEntry();
  const deleteEntry = useDeleteJournalEntry();

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 2,
    }).format(amount);
  };

  const handlePost = async (entry: JournalEntry) => {
    if (!entry.is_balanced) {
      alert('Cannot post unbalanced entry');
      return;
    }
    if (confirm(`Post journal entry ${entry.entry_number}?`)) {
      await postEntry.mutateAsync(entry.id);
      refetch();
    }
  };

  const handleDelete = async (entry: JournalEntry) => {
    if (confirm(`Delete journal entry ${entry.entry_number}? This cannot be undone.`)) {
      await deleteEntry.mutateAsync(entry.id);
      refetch();
      setSelectedEntry(null);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-white">Journal Entries</h1>
            <p className="text-slate-400 mt-1">Create and manage accounting journal entries</p>
          </div>
          <button onClick={() => setShowForm(true)} className="btn-primary flex items-center gap-2">
            <Plus className="w-4 h-4" />
            New Entry
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Entry List */}
          <div className="lg:col-span-2 card">
            <div className="flex items-center gap-4 mb-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search entries..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="input-field pl-10"
                />
              </div>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="input-field w-36"
              >
                <option value="">All Status</option>
                <option value="DRAFT">Draft</option>
                <option value="PENDING">Pending</option>
                <option value="POSTED">Posted</option>
                <option value="REVERSED">Reversed</option>
              </select>
              <button onClick={() => refetch()} className="btn-secondary">
                <RefreshCw className="w-4 h-4" />
              </button>
            </div>

            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <RefreshCw className="w-6 h-6 text-slate-400 animate-spin" />
              </div>
            ) : entriesData?.data?.length ? (
              <div className="space-y-2">
                {entriesData.data.map((entry) => {
                  const config = statusConfig[entry.status];
                  const StatusIcon = config.icon;
                  return (
                    <div
                      key={entry.id}
                      onClick={() => setSelectedEntry(entry)}
                      className={`p-4 rounded-lg border cursor-pointer transition-colors ${
                        selectedEntry?.id === entry.id
                          ? 'bg-slate-700 border-blue-500'
                          : 'bg-slate-700/50 border-slate-600 hover:bg-slate-700'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-3">
                          <span className="font-mono text-slate-300">{entry.entry_number}</span>
                          <span className={`text-xs px-2 py-0.5 rounded border flex items-center gap-1 ${config.color}`}>
                            <StatusIcon className="w-3 h-3" />
                            {entry.status}
                          </span>
                          {!entry.is_balanced && (
                            <span className="text-xs px-2 py-0.5 rounded bg-red-500/20 text-red-400">
                              Unbalanced
                            </span>
                          )}
                        </div>
                        <span className="text-sm text-slate-400">
                          {new Date(entry.entry_date).toLocaleDateString('en-IN')}
                        </span>
                      </div>
                      <p className="text-white mb-2">{entry.description}</p>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-slate-400">
                          {entry.reference_number && `Ref: ${entry.reference_number}`}
                        </span>
                        <div className="flex gap-4">
                          <span className="text-green-400">Dr: {formatCurrency(entry.total_debit)}</span>
                          <span className="text-red-400">Cr: {formatCurrency(entry.total_credit)}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-12">
                <p className="text-slate-400">No journal entries found</p>
              </div>
            )}
          </div>

          {/* Entry Details Panel */}
          <div className="card">
            {selectedEntry ? (
              <JournalEntryDetails
                entry={selectedEntry}
                onEdit={() => {
                  setEditEntry(selectedEntry);
                  setShowForm(true);
                }}
                onPost={() => handlePost(selectedEntry)}
                onDelete={() => handleDelete(selectedEntry)}
                onClose={() => setSelectedEntry(null)}
              />
            ) : (
              <div className="text-center py-12">
                <FileText className="w-12 h-12 text-slate-600 mx-auto mb-3" />
                <p className="text-slate-400">Select an entry to view details</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Journal Entry Form Modal */}
      {showForm && (
        <JournalEntryForm
          entry={editEntry}
          onClose={() => {
            setShowForm(false);
            setEditEntry(null);
          }}
          onSuccess={() => {
            setShowForm(false);
            setEditEntry(null);
            refetch();
          }}
        />
      )}
    </div>
  );
}
