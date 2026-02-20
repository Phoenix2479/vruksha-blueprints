import { useState, useMemo } from 'react'
import { Plus, Search, ChevronRight, ChevronDown, RefreshCw, FolderTree, Settings2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Spinner } from '@/components/ui/spinner'
import { Separator } from '@/components/ui/separator'
import { useAccounts, useInitializeDefaults, useDeleteAccount } from '@/hooks/useAccounts'
import { AccountFormDialog } from '@/components/AccountFormDialog'
import { formatCurrency } from '@/lib/utils'
import { ExportButtons } from '@/components/ExportButtons'
import type { Account, AccountType } from '@/types'

const typeVariant: Record<AccountType, 'success' | 'destructive' | 'info' | 'warning' | 'secondary'> = {
  ASSET: 'success',
  LIABILITY: 'destructive',
  EQUITY: 'info',
  REVENUE: 'warning',
  EXPENSE: 'secondary',
}

interface TreeNode extends Account {
  children: TreeNode[]
}

function buildTree(accounts: Account[]): TreeNode[] {
  const map = new Map<string, TreeNode>()
  const roots: TreeNode[] = []
  accounts.forEach(a => map.set(a.id, { ...a, children: [] }))
  accounts.forEach(a => {
    const node = map.get(a.id)!
    if (a.parent_account_id && map.has(a.parent_account_id)) {
      map.get(a.parent_account_id)!.children.push(node)
    } else {
      roots.push(node)
    }
  })
  return roots
}

function filterTree(nodes: TreeNode[], term: string): TreeNode[] {
  if (!term) return nodes
  const lower = term.toLowerCase()
  return nodes.reduce<TreeNode[]>((acc, node) => {
    const match = node.account_name.toLowerCase().includes(lower) || node.account_code.toLowerCase().includes(lower)
    const filteredChildren = filterTree(node.children, term)
    if (match || filteredChildren.length > 0) {
      acc.push({ ...node, children: filteredChildren })
    }
    return acc
  }, [])
}

function TreeItem({
  node, depth = 0, expanded, toggle, selected, onSelect,
}: {
  node: TreeNode; depth?: number; expanded: Set<string>; toggle: (id: string) => void; selected: string | null; onSelect: (a: Account) => void
}) {
  const hasKids = node.children.length > 0
  const isOpen = expanded.has(node.id)
  return (
    <>
      <div
        className={`flex items-center py-2 px-3 rounded-md cursor-pointer transition-colors hover:bg-accent/50 ${selected === node.id ? 'bg-accent' : ''}`}
        style={{ paddingLeft: `${depth * 20 + 12}px` }}
        onClick={() => onSelect(node)}
      >
        <button className="w-5 h-5 mr-2 flex items-center justify-center shrink-0" onClick={e => { e.stopPropagation(); if (hasKids) toggle(node.id) }}>
          {hasKids ? (isOpen ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />) : <span className="w-4" />}
        </button>
        <span className="font-mono text-xs text-muted-foreground mr-3 shrink-0">{node.account_code}</span>
        <span className="flex-1 text-sm truncate">{node.account_name}</span>
        <Badge variant={typeVariant[node.account_type]} className="ml-2 text-[10px]">{node.account_type}</Badge>
        {!node.is_active && <Badge variant="outline" className="ml-1 text-[10px]">Inactive</Badge>}
      </div>
      {hasKids && isOpen && node.children.map(c => (
        <TreeItem key={c.id} node={c} depth={depth + 1} expanded={expanded} toggle={toggle} selected={selected} onSelect={onSelect} />
      ))}
    </>
  )
}

export function ChartOfAccountsPage() {
  const [search, setSearch] = useState('')
  const [formOpen, setFormOpen] = useState(false)
  const [editAccount, setEditAccount] = useState<Account | null>(null)
  const [selected, setSelected] = useState<Account | null>(null)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  const { data, isLoading, refetch } = useAccounts()
  const initDefaults = useInitializeDefaults()
  const deleteAccount = useDeleteAccount()

  const accounts = data?.data || []
  const tree = useMemo(() => buildTree(accounts), [accounts])
  const filtered = useMemo(() => filterTree(tree, search), [tree, search])

  const toggle = (id: string) => setExpanded(prev => {
    const next = new Set(prev)
    next.has(id) ? next.delete(id) : next.add(id)
    return next
  })

  const expandAll = () => {
    const ids = new Set<string>()
    const collect = (nodes: TreeNode[]) => nodes.forEach(n => { if (n.children.length) { ids.add(n.id); collect(n.children) } })
    collect(tree)
    setExpanded(ids)
  }

  const stats = useMemo(() => ({
    total: accounts.length,
    assets: accounts.filter(a => a.account_type === 'ASSET').length,
    liabilities: accounts.filter(a => a.account_type === 'LIABILITY').length,
    equity: accounts.filter(a => a.account_type === 'EQUITY').length,
    revenue: accounts.filter(a => a.account_type === 'REVENUE').length,
    expenses: accounts.filter(a => a.account_type === 'EXPENSE').length,
  }), [accounts])

  return (
    <div className="min-h-screen p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Chart of Accounts</h1>
            <p className="text-muted-foreground text-sm mt-1">Manage your account structure and hierarchy</p>
          </div>
          <div className="flex gap-2 items-center">
            <ExportButtons csvUrl="/api/accounts/export/csv" pdfUrl="/api/accounts/export/pdf" />
            <Button variant="outline" size="sm" onClick={() => { initDefaults.mutate(); }} disabled={initDefaults.isPending}>
              {initDefaults.isPending ? <Spinner /> : <Settings2 className="w-4 h-4" />}
              Initialize Defaults
            </Button>
            <Button size="sm" onClick={() => { setEditAccount(null); setFormOpen(true) }}>
              <Plus className="w-4 h-4" /> New Account
            </Button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
          {[
            { label: 'Total', value: stats.total, variant: 'outline' as const },
            { label: 'Assets', value: stats.assets, variant: 'success' as const },
            { label: 'Liabilities', value: stats.liabilities, variant: 'destructive' as const },
            { label: 'Equity', value: stats.equity, variant: 'info' as const },
            { label: 'Revenue', value: stats.revenue, variant: 'warning' as const },
            { label: 'Expenses', value: stats.expenses, variant: 'secondary' as const },
          ].map(s => (
            <Card key={s.label}>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">{s.label}</p>
                <p className="text-2xl font-bold mt-1">{s.value}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Tree */}
          <Card className="lg:col-span-2">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-3">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input placeholder="Search accounts..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
                </div>
                <Button variant="ghost" size="sm" onClick={expandAll}>Expand All</Button>
                <Button variant="ghost" size="sm" onClick={() => setExpanded(new Set())}>Collapse</Button>
                <Button variant="ghost" size="icon" onClick={() => refetch()}>
                  <RefreshCw className="w-4 h-4" />
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="flex items-center justify-center py-16"><Spinner className="w-6 h-6" /></div>
              ) : filtered.length === 0 ? (
                <div className="text-center py-16">
                  <FolderTree className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
                  <p className="text-muted-foreground">No accounts found</p>
                  <p className="text-xs text-muted-foreground mt-1">Click "Initialize Defaults" to create standard Indian chart of accounts</p>
                </div>
              ) : (
                <div className="space-y-0.5">
                  {filtered.map(n => (
                    <TreeItem key={n.id} node={n} expanded={expanded} toggle={toggle} selected={selected?.id ?? null} onSelect={setSelected} />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Detail Panel */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Account Details</CardTitle>
            </CardHeader>
            <CardContent>
              {selected ? (
                <div className="space-y-4">
                  <div>
                    <p className="text-xs text-muted-foreground">Code</p>
                    <p className="font-mono text-lg">{selected.account_code}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Name</p>
                    <p className="font-medium">{selected.account_name}</p>
                  </div>
                  <div className="flex gap-2">
                    <Badge variant={typeVariant[selected.account_type]}>{selected.account_type}</Badge>
                    <Badge variant={selected.is_active ? 'success' : 'outline'}>{selected.is_active ? 'Active' : 'Inactive'}</Badge>
                  </div>
                  <Separator />
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <p className="text-xs text-muted-foreground">Opening Balance</p>
                      <p className="font-mono text-sm">{formatCurrency(selected.opening_balance)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Current Balance</p>
                      <p className="font-mono text-sm font-medium">{formatCurrency(selected.current_balance)}</p>
                    </div>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Normal Balance</p>
                    <p className="text-sm">{selected.normal_balance}</p>
                  </div>
                  {selected.description && (
                    <div>
                      <p className="text-xs text-muted-foreground">Description</p>
                      <p className="text-sm">{selected.description}</p>
                    </div>
                  )}
                  <Separator />
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" className="flex-1" onClick={() => { setEditAccount(selected); setFormOpen(true) }}>Edit</Button>
                    <Button size="sm" variant="destructive" className="flex-1" onClick={() => { if (confirm('Delete this account?')) { deleteAccount.mutate(selected.id); setSelected(null) } }}>Delete</Button>
                  </div>
                </div>
              ) : (
                <div className="text-center py-12">
                  <p className="text-sm text-muted-foreground">Select an account to view details</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <AccountFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        account={editAccount}
        accounts={accounts}
      />
    </div>
  )
}
