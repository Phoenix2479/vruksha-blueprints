import { useState } from 'react';
import { Plus, Search, ChevronRight, ChevronDown, RefreshCw } from 'lucide-react';
import { useAccountTree, useInitializeDefaults } from '@/hooks/useAccounts';
import { AccountForm } from '@/components/AccountForm';
import { AccountDetails } from '@/components/AccountDetails';
import type { Account, AccountTreeNode, AccountType } from '@/types';

const accountTypeColors: Record<AccountType, string> = {
  ASSET: 'bg-green-500/20 text-green-400 border-green-500/30',
  LIABILITY: 'bg-red-500/20 text-red-400 border-red-500/30',
  EQUITY: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  REVENUE: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  EXPENSE: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
};

function AccountTreeItem({
  account,
  depth = 0,
  expandedIds,
  toggleExpand,
  onSelect,
  selectedId,
}: {
  account: AccountTreeNode;
  depth?: number;
  expandedIds: Set<string>;
  toggleExpand: (id: string) => void;
  onSelect: (account: Account) => void;
  selectedId: string | null;
}) {
  const hasChildren = account.children && account.children.length > 0;
  const isExpanded = expandedIds.has(account.id);
  const isSelected = selectedId === account.id;

  return (
    <div>
      <div
        className={`flex items-center py-2 px-3 cursor-pointer hover:bg-slate-700/50 rounded-lg transition-colors ${
          isSelected ? 'bg-slate-700' : ''
        }`}
        style={{ paddingLeft: `${depth * 20 + 12}px` }}
        onClick={() => onSelect(account)}
      >
        <button
          className="w-5 h-5 mr-2 flex items-center justify-center"
          onClick={(e) => {
            e.stopPropagation();
            if (hasChildren) toggleExpand(account.id);
          }}
        >
          {hasChildren ? (
            isExpanded ? (
              <ChevronDown className="w-4 h-4 text-slate-400" />
            ) : (
              <ChevronRight className="w-4 h-4 text-slate-400" />
            )
          ) : (
            <span className="w-4" />
          )}
        </button>
        <span className="font-mono text-sm text-slate-400 mr-3">{account.account_code}</span>
        <span className="flex-1 text-white">{account.account_name}</span>
        <span
          className={`text-xs px-2 py-0.5 rounded border ${accountTypeColors[account.account_type]}`}
        >
          {account.account_type}
        </span>
        {!account.is_active && (
          <span className="ml-2 text-xs px-2 py-0.5 rounded bg-slate-600 text-slate-400">
            Inactive
          </span>
        )}
      </div>
      {hasChildren && isExpanded && (
        <div>
          {account.children.map((child) => (
            <AccountTreeItem
              key={child.id}
              account={child}
              depth={depth + 1}
              expandedIds={expandedIds}
              toggleExpand={toggleExpand}
              onSelect={onSelect}
              selectedId={selectedId}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function ChartOfAccountsPage() {
  const [searchTerm, setSearchTerm] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [selectedAccount, setSelectedAccount] = useState<Account | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [editAccount, setEditAccount] = useState<Account | null>(null);

  const { data: treeData, isLoading, refetch } = useAccountTree();
  const initializeDefaults = useInitializeDefaults();

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const expandAll = () => {
    if (treeData?.data) {
      const allIds = new Set<string>();
      const collectIds = (nodes: AccountTreeNode[]) => {
        nodes.forEach((node) => {
          if (node.children?.length) {
            allIds.add(node.id);
            collectIds(node.children);
          }
        });
      };
      collectIds(treeData.data);
      setExpandedIds(allIds);
    }
  };

  const collapseAll = () => {
    setExpandedIds(new Set());
  };

  const filterTree = (nodes: AccountTreeNode[], term: string): AccountTreeNode[] => {
    if (!term) return nodes;
    return nodes
      .map((node) => {
        const matchesSearch =
          node.account_name.toLowerCase().includes(term.toLowerCase()) ||
          node.account_code.toLowerCase().includes(term.toLowerCase());
        const filteredChildren = filterTree(node.children || [], term);

        if (matchesSearch || filteredChildren.length > 0) {
          return { ...node, children: filteredChildren };
        }
        return null;
      })
      .filter((node): node is AccountTreeNode => node !== null);
  };

  const filteredTree = treeData?.data ? filterTree(treeData.data, searchTerm) : [];

  const handleInitialize = async () => {
    if (confirm('This will create default Indian chart of accounts. Continue?')) {
      await initializeDefaults.mutateAsync();
      refetch();
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-white">Chart of Accounts</h1>
            <p className="text-slate-400 mt-1">Manage your account structure and hierarchy</p>
          </div>
          <div className="flex gap-3">
            <button
              onClick={handleInitialize}
              disabled={initializeDefaults.isPending}
              className="btn-secondary flex items-center gap-2"
            >
              <RefreshCw className={`w-4 h-4 ${initializeDefaults.isPending ? 'animate-spin' : ''}`} />
              Initialize Defaults
            </button>
            <button onClick={() => setShowForm(true)} className="btn-primary flex items-center gap-2">
              <Plus className="w-4 h-4" />
              New Account
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Account Tree */}
          <div className="lg:col-span-2 card">
            <div className="flex items-center gap-4 mb-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search accounts..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="input-field pl-10"
                />
              </div>
              <button onClick={expandAll} className="text-sm text-slate-400 hover:text-white">
                Expand All
              </button>
              <button onClick={collapseAll} className="text-sm text-slate-400 hover:text-white">
                Collapse All
              </button>
            </div>

            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <RefreshCw className="w-6 h-6 text-slate-400 animate-spin" />
              </div>
            ) : filteredTree.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-slate-400">No accounts found</p>
                <p className="text-slate-500 text-sm mt-1">
                  Click "Initialize Defaults" to create standard Indian chart of accounts
                </p>
              </div>
            ) : (
              <div className="space-y-1">
                {filteredTree.map((account) => (
                  <AccountTreeItem
                    key={account.id}
                    account={account}
                    expandedIds={expandedIds}
                    toggleExpand={toggleExpand}
                    onSelect={setSelectedAccount}
                    selectedId={selectedAccount?.id ?? null}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Account Details Panel */}
          <div className="card">
            {selectedAccount ? (
              <AccountDetails
                account={selectedAccount}
                onEdit={() => {
                  setEditAccount(selectedAccount);
                  setShowForm(true);
                }}
                onClose={() => setSelectedAccount(null)}
              />
            ) : (
              <div className="text-center py-12">
                <p className="text-slate-400">Select an account to view details</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Account Form Modal */}
      {showForm && (
        <AccountForm
          account={editAccount}
          onClose={() => {
            setShowForm(false);
            setEditAccount(null);
          }}
          onSuccess={() => {
            setShowForm(false);
            setEditAccount(null);
            refetch();
          }}
        />
      )}
    </div>
  );
}
