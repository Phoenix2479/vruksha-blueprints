import { useState, useEffect, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getVouchers, getVoucherTypes, getAccounts, getParties, createVoucher, postVoucher, voidVoucher, getRecurring, createRecurring, runRecurring, pauseRecurring, deleteRecurring } from '../api/vouchers';
import type { Voucher, VoucherType, VoucherLine, Account, Party, RecurringTemplate } from '../types';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { Badge } from '../components/ui/badge';
import { Separator } from '../components/ui/separator';
import { formatCurrency, formatDate } from '../lib/utils';
import { Plus, Send, Ban, Download, FileText, Clock, Play, Pause, Trash2, RefreshCw, Keyboard } from 'lucide-react';

type Tab = 'vouchers' | 'create' | 'recurring';

export function VoucherEntryPage() {
  const [tab, setTab] = useState<Tab>('vouchers');
  const [typeFilter, setTypeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const keyMap: Record<string, string> = { F4: 'contra', F5: 'payment', F6: 'receipt', F7: 'journal', F8: 'sales', F9: 'purchase' };
      if (keyMap[e.key]) { e.preventDefault(); setTab('create'); setSelectedType(keyMap[e.key]); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const [selectedType, setSelectedType] = useState('payment');

  return (
    <div className="max-w-7xl mx-auto p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Voucher Entry</h1>
          <p className="text-sm text-muted-foreground">Tally-style transaction entry — use F4-F9 shortcuts</p>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Keyboard className="w-3.5 h-3.5" />
          <span>F4 Contra | F5 Payment | F6 Receipt | F7 Journal | F8 Sales | F9 Purchase</span>
        </div>
      </div>

      <div className="flex gap-2 border-b border-border pb-2">
        {(['vouchers', 'create', 'recurring'] as Tab[]).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium rounded-t-md transition-colors ${tab === t ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-muted'}`}>
            {t === 'vouchers' ? 'Voucher Register' : t === 'create' ? 'New Voucher' : 'Recurring'}
          </button>
        ))}
      </div>

      {tab === 'vouchers' && <VoucherList typeFilter={typeFilter} setTypeFilter={setTypeFilter} statusFilter={statusFilter} setStatusFilter={setStatusFilter} onNew={() => setTab('create')} />}
      {tab === 'create' && <VoucherForm selectedType={selectedType} setSelectedType={setSelectedType} onCreated={() => setTab('vouchers')} />}
      {tab === 'recurring' && <RecurringPanel />}
    </div>
  );
}

function VoucherList({ typeFilter, setTypeFilter, statusFilter, setStatusFilter, onNew }: {
  typeFilter: string; setTypeFilter: (v: string) => void;
  statusFilter: string; setStatusFilter: (v: string) => void;
  onNew: () => void;
}) {
  const qc = useQueryClient();
  const params: Record<string, string> = {};
  if (typeFilter) params.voucher_type = typeFilter;
  if (statusFilter) params.status = statusFilter;

  const { data: vouchers = [], isLoading } = useQuery({ queryKey: ['vouchers', params], queryFn: () => getVouchers(params) });
  const postMut = useMutation({ mutationFn: postVoucher, onSuccess: () => qc.invalidateQueries({ queryKey: ['vouchers'] }) });
  const voidMut = useMutation({ mutationFn: voidVoucher, onSuccess: () => qc.invalidateQueries({ queryKey: ['vouchers'] }) });

  const statusColor = (s: string) => s === 'posted' ? 'default' : s === 'void' ? 'destructive' : 'secondary';
  const typeColor = (t: string) => {
    const m: Record<string, string> = { sales: 'bg-emerald-500/10 text-emerald-400', purchase: 'bg-orange-500/10 text-orange-400', payment: 'bg-red-500/10 text-red-400', receipt: 'bg-blue-500/10 text-blue-400', contra: 'bg-purple-500/10 text-purple-400', journal: 'bg-slate-500/10 text-slate-400' };
    return m[t] || '';
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">Voucher Register</CardTitle>
          <div className="flex gap-2">
            <a href="/api/vouchers/export/csv" className="inline-flex items-center gap-1 px-3 py-1.5 text-xs border rounded-md hover:bg-muted"><Download className="w-3 h-3" />CSV</a>
            <a href="/api/vouchers/export/pdf" target="_blank" className="inline-flex items-center gap-1 px-3 py-1.5 text-xs border rounded-md hover:bg-muted"><FileText className="w-3 h-3" />PDF</a>
            <Button size="sm" onClick={onNew}><Plus className="w-4 h-4 mr-1" />New Voucher</Button>
          </div>
        </div>
        <div className="flex gap-2 mt-2">
          <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} className="text-xs px-2 py-1 border rounded-md bg-background">
            <option value="">All Types</option>
            {['sales','purchase','payment','receipt','contra','journal'].map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
          </select>
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="text-xs px-2 py-1 border rounded-md bg-background">
            <option value="">All Status</option>
            <option value="draft">Draft</option><option value="posted">Posted</option><option value="void">Void</option>
          </select>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? <p className="text-sm text-muted-foreground">Loading...</p> : vouchers.length === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">No vouchers found. Create your first voucher!</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-border text-muted-foreground text-xs">
                <th className="text-left py-2 px-2">Voucher #</th><th className="text-left py-2 px-2">Type</th>
                <th className="text-left py-2 px-2">Date</th><th className="text-right py-2 px-2">Amount</th>
                <th className="text-left py-2 px-2">Narration</th><th className="text-center py-2 px-2">Status</th>
                <th className="text-right py-2 px-2">Actions</th>
              </tr></thead>
              <tbody>
                {(vouchers as Voucher[]).map(v => (
                  <tr key={v.id} className="border-b border-border/50 hover:bg-muted/30">
                    <td className="py-2 px-2 font-mono text-xs">{v.voucher_number}</td>
                    <td className="py-2 px-2"><span className={`text-xs px-2 py-0.5 rounded ${typeColor(v.voucher_type)}`}>{v.voucher_type}</span></td>
                    <td className="py-2 px-2 text-xs">{formatDate(v.voucher_date)}</td>
                    <td className="py-2 px-2 text-right font-mono">{formatCurrency(v.amount)}</td>
                    <td className="py-2 px-2 text-xs text-muted-foreground max-w-[200px] truncate">{v.narration || '-'}</td>
                    <td className="py-2 px-2 text-center"><Badge variant={statusColor(v.status)}>{v.status}</Badge></td>
                    <td className="py-2 px-2 text-right">
                      {v.status === 'draft' && (
                        <div className="flex gap-1 justify-end">
                          <Button size="sm" variant="outline" className="h-6 px-2 text-xs" onClick={() => postMut.mutate(v.id)}><Send className="w-3 h-3 mr-1" />Post</Button>
                          <Button size="sm" variant="ghost" className="h-6 px-2 text-xs text-destructive" onClick={() => voidMut.mutate(v.id)}><Ban className="w-3 h-3" /></Button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function VoucherForm({ selectedType, setSelectedType, onCreated }: { selectedType: string; setSelectedType: (t: string) => void; onCreated: () => void }) {
  const qc = useQueryClient();
  const { data: accounts = [] } = useQuery<Account[]>({ queryKey: ['accounts'], queryFn: () => getAccounts() });
  const { data: parties = [] } = useQuery<Party[]>({ queryKey: ['parties'], queryFn: () => getParties() });
  const { data: voucherTypes = [] } = useQuery<VoucherType[]>({ queryKey: ['voucher-types'], queryFn: () => getVoucherTypes() });

  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [partyId, setPartyId] = useState('');
  const [narration, setNarration] = useState('');
  const [reference, setReference] = useState('');
  const [lines, setLines] = useState<VoucherLine[]>([
    { account_id: '', amount: 0, dr_cr: 'dr' },
    { account_id: '', amount: 0, dr_cr: 'cr' },
  ]);

  const addLine = () => setLines([...lines, { account_id: '', amount: 0, dr_cr: lines.length % 2 === 0 ? 'dr' : 'cr' }]);
  const removeLine = (i: number) => { if (lines.length > 2) setLines(lines.filter((_, idx) => idx !== i)); };
  const updateLine = (i: number, field: string, value: any) => {
    const updated = [...lines];
    (updated[i] as any)[field] = value;
    setLines(updated);
  };

  const totalDr = lines.filter(l => l.dr_cr === 'dr').reduce((s, l) => s + (l.amount || 0), 0);
  const totalCr = lines.filter(l => l.dr_cr === 'cr').reduce((s, l) => s + (l.amount || 0), 0);
  const isBalanced = Math.abs(totalDr - totalCr) < 0.01;

  const createMut = useMutation({
    mutationFn: createVoucher,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['vouchers'] }); onCreated(); }
  });

  const handleSubmit = () => {
    if (!isBalanced || lines.some(l => !l.account_id || !l.amount)) return;
    const partyType = partyId ? parties.find((p: Party) => p.id === partyId)?.party_type : undefined;
    createMut.mutate({
      voucher_type: selectedType, voucher_date: date, party_id: partyId || undefined,
      party_type: partyType, amount: totalDr, narration, reference, lines
    });
  };

  const typeInfo = voucherTypes.find((t: VoucherType) => t.type === selectedType);
  const needsParty = ['sales', 'purchase', 'payment', 'receipt'].includes(selectedType);
  const partyLabel = ['sales', 'receipt'].includes(selectedType) ? 'Customer' : 'Vendor';
  const filteredParties = needsParty ? parties.filter((p: Party) =>
    ['sales', 'receipt'].includes(selectedType) ? p.party_type === 'customer' : p.party_type === 'vendor'
  ) : [];

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          New Voucher
          {typeInfo && <Badge variant="outline">{typeInfo.shortcut}</Badge>}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div>
            <Label className="text-xs">Voucher Type</Label>
            <select value={selectedType} onChange={e => setSelectedType(e.target.value)}
              className="w-full mt-1 text-sm px-3 py-2 border rounded-md bg-background">
              {voucherTypes.map((t: VoucherType) => <option key={t.type} value={t.type}>{t.label} ({t.shortcut})</option>)}
            </select>
          </div>
          <div>
            <Label className="text-xs">Date</Label>
            <Input type="date" value={date} onChange={e => setDate(e.target.value)} className="mt-1" />
          </div>
          {needsParty && (
            <div>
              <Label className="text-xs">{partyLabel}</Label>
              <select value={partyId} onChange={e => setPartyId(e.target.value)}
                className="w-full mt-1 text-sm px-3 py-2 border rounded-md bg-background">
                <option value="">-- Select --</option>
                {filteredParties.map((p: Party) => <option key={p.id} value={p.id}>{p.name} ({p.code})</option>)}
              </select>
            </div>
          )}
          <div>
            <Label className="text-xs">Reference</Label>
            <Input value={reference} onChange={e => setReference(e.target.value)} placeholder="Ref #" className="mt-1" />
          </div>
        </div>

        {typeInfo && (
          <div className="text-xs text-muted-foreground bg-muted/30 px-3 py-2 rounded-md">
            {typeInfo.description} — <span className="font-medium">Dr: {typeInfo.dr}</span> | <span className="font-medium">Cr: {typeInfo.cr}</span>
          </div>
        )}

        <Separator />

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-sm font-medium">Line Items</Label>
            <Button size="sm" variant="outline" onClick={addLine}><Plus className="w-3 h-3 mr-1" />Add Line</Button>
          </div>
          <table className="w-full text-sm">
            <thead><tr className="text-xs text-muted-foreground border-b">
              <th className="text-left py-1 px-1 w-10">#</th>
              <th className="text-left py-1 px-1">Account</th>
              <th className="text-center py-1 px-1 w-20">Dr/Cr</th>
              <th className="text-right py-1 px-1 w-32">Amount</th>
              <th className="text-left py-1 px-1">Description</th>
              <th className="py-1 px-1 w-8"></th>
            </tr></thead>
            <tbody>
              {lines.map((line, i) => (
                <tr key={i} className="border-b border-border/30">
                  <td className="py-1 px-1 text-xs text-muted-foreground">{i + 1}</td>
                  <td className="py-1 px-1">
                    <select value={line.account_id} onChange={e => updateLine(i, 'account_id', e.target.value)}
                      className="w-full text-xs px-2 py-1.5 border rounded bg-background">
                      <option value="">Select account...</option>
                      {(accounts as Account[]).map(a => <option key={a.id} value={a.id}>{a.account_code} - {a.account_name}</option>)}
                    </select>
                  </td>
                  <td className="py-1 px-1 text-center">
                    <select value={line.dr_cr} onChange={e => updateLine(i, 'dr_cr', e.target.value)}
                      className="text-xs px-2 py-1.5 border rounded bg-background">
                      <option value="dr">Dr</option><option value="cr">Cr</option>
                    </select>
                  </td>
                  <td className="py-1 px-1">
                    <Input type="number" step="0.01" min="0" value={line.amount || ''} onChange={e => updateLine(i, 'amount', parseFloat(e.target.value) || 0)}
                      className="text-right text-xs h-8" />
                  </td>
                  <td className="py-1 px-1">
                    <Input value={line.description || ''} onChange={e => updateLine(i, 'description', e.target.value)}
                      className="text-xs h-8" placeholder="Optional" />
                  </td>
                  <td className="py-1 px-1">
                    {lines.length > 2 && (
                      <button onClick={() => removeLine(i)} className="text-destructive hover:text-destructive/80"><Trash2 className="w-3.5 h-3.5" /></button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="flex justify-end gap-6 text-sm pt-2">
            <span>Total Dr: <strong className={totalDr > 0 ? 'text-emerald-400' : ''}>{formatCurrency(totalDr)}</strong></span>
            <span>Total Cr: <strong className={totalCr > 0 ? 'text-blue-400' : ''}>{formatCurrency(totalCr)}</strong></span>
            <span className={isBalanced ? 'text-emerald-400' : 'text-destructive'}>{isBalanced ? 'Balanced' : `Diff: ${formatCurrency(Math.abs(totalDr - totalCr))}`}</span>
          </div>
        </div>

        <div>
          <Label className="text-xs">Narration</Label>
          <Textarea value={narration} onChange={e => setNarration(e.target.value)} rows={2} className="mt-1" placeholder="Transaction description..." />
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onCreated}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={!isBalanced || lines.some(l => !l.account_id || !l.amount) || createMut.isPending}>
            {createMut.isPending ? 'Creating...' : 'Create Voucher'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function RecurringPanel() {
  const qc = useQueryClient();
  const { data: templates = [], isLoading } = useQuery<RecurringTemplate[]>({ queryKey: ['recurring'], queryFn: getRecurring });
  const { data: accounts = [] } = useQuery<Account[]>({ queryKey: ['accounts'], queryFn: () => getAccounts() });

  const runMut = useMutation({ mutationFn: runRecurring, onSuccess: () => qc.invalidateQueries({ queryKey: ['recurring'] }) });
  const pauseMut = useMutation({ mutationFn: pauseRecurring, onSuccess: () => qc.invalidateQueries({ queryKey: ['recurring'] }) });
  const deleteMut = useMutation({ mutationFn: deleteRecurring, onSuccess: () => qc.invalidateQueries({ queryKey: ['recurring'] }) });

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', voucher_type: 'payment', frequency: 'monthly', start_date: new Date().toISOString().split('T')[0], end_date: '', amount: 0, narration: '', auto_post: false, lines: [{ account_id: '', amount: 0, dr_cr: 'dr' as const, description: '' }, { account_id: '', amount: 0, dr_cr: 'cr' as const, description: '' }] });

  const createMut = useMutation({
    mutationFn: createRecurring,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['recurring'] }); setShowForm(false); }
  });

  const handleCreate = () => {
    if (!form.name || form.lines.some(l => !l.account_id || !l.amount)) return;
    createMut.mutate({ ...form, end_date: form.end_date || undefined });
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2"><Clock className="w-5 h-5" />Recurring Transactions</CardTitle>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => runMut.mutate()} disabled={runMut.isPending}>
              <RefreshCw className={`w-4 h-4 mr-1 ${runMut.isPending ? 'animate-spin' : ''}`} />Generate Due
            </Button>
            <Button size="sm" onClick={() => setShowForm(!showForm)}><Plus className="w-4 h-4 mr-1" />New Template</Button>
          </div>
        </div>
        {runMut.isSuccess && runMut.data && (
          <div className="text-xs bg-emerald-500/10 text-emerald-400 px-3 py-2 rounded-md mt-2">
            Generated {(runMut.data as any).generated_count} voucher(s)
          </div>
        )}
      </CardHeader>
      <CardContent>
        {showForm && (
          <div className="border rounded-md p-4 mb-4 space-y-3 bg-muted/10">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div><Label className="text-xs">Name</Label><Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="mt-1" placeholder="Monthly Rent" /></div>
              <div><Label className="text-xs">Type</Label>
                <select value={form.voucher_type} onChange={e => setForm({ ...form, voucher_type: e.target.value })} className="w-full mt-1 text-sm px-3 py-2 border rounded-md bg-background">
                  {['payment','receipt','journal','sales','purchase','contra'].map(t => <option key={t} value={t}>{t}</option>)}
                </select></div>
              <div><Label className="text-xs">Frequency</Label>
                <select value={form.frequency} onChange={e => setForm({ ...form, frequency: e.target.value })} className="w-full mt-1 text-sm px-3 py-2 border rounded-md bg-background">
                  {['daily','weekly','monthly','quarterly','yearly'].map(f => <option key={f} value={f}>{f}</option>)}
                </select></div>
              <div><Label className="text-xs">Amount</Label><Input type="number" step="0.01" value={form.amount || ''} onChange={e => setForm({ ...form, amount: parseFloat(e.target.value) || 0 })} className="mt-1" /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-xs">Start Date</Label><Input type="date" value={form.start_date} onChange={e => setForm({ ...form, start_date: e.target.value })} className="mt-1" /></div>
              <div><Label className="text-xs">End Date (optional)</Label><Input type="date" value={form.end_date} onChange={e => setForm({ ...form, end_date: e.target.value })} className="mt-1" /></div>
            </div>
            <div><Label className="text-xs">Narration</Label><Input value={form.narration} onChange={e => setForm({ ...form, narration: e.target.value })} className="mt-1" /></div>
            <div className="space-y-1">
              <Label className="text-xs">Lines</Label>
              {form.lines.map((line, i) => (
                <div key={i} className="flex gap-2 items-center">
                  <select value={line.account_id} onChange={e => { const l = [...form.lines]; l[i].account_id = e.target.value; setForm({ ...form, lines: l }); }} className="flex-1 text-xs px-2 py-1.5 border rounded bg-background">
                    <option value="">Select account</option>
                    {(accounts as Account[]).map(a => <option key={a.id} value={a.id}>{a.account_code} - {a.account_name}</option>)}
                  </select>
                  <select value={line.dr_cr} onChange={e => { const l = [...form.lines]; l[i].dr_cr = e.target.value as 'dr' | 'cr'; setForm({ ...form, lines: l }); }} className="text-xs px-2 py-1.5 border rounded bg-background w-16">
                    <option value="dr">Dr</option><option value="cr">Cr</option>
                  </select>
                  <Input type="number" step="0.01" value={line.amount || ''} onChange={e => { const l = [...form.lines]; l[i].amount = parseFloat(e.target.value) || 0; setForm({ ...form, lines: l }); }} className="w-28 text-xs h-8" />
                </div>
              ))}
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setShowForm(false)}>Cancel</Button>
              <Button size="sm" onClick={handleCreate} disabled={createMut.isPending}>Create Template</Button>
            </div>
          </div>
        )}

        {isLoading ? <p className="text-sm text-muted-foreground">Loading...</p> : templates.length === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">No recurring templates. Create one to auto-generate vouchers!</p>
        ) : (
          <table className="w-full text-sm">
            <thead><tr className="border-b text-xs text-muted-foreground">
              <th className="text-left py-2 px-2">Name</th><th className="text-left py-2 px-2">Type</th>
              <th className="text-left py-2 px-2">Frequency</th><th className="text-right py-2 px-2">Amount</th>
              <th className="text-left py-2 px-2">Next Run</th><th className="text-center py-2 px-2">Runs</th>
              <th className="text-center py-2 px-2">Status</th><th className="text-right py-2 px-2">Actions</th>
            </tr></thead>
            <tbody>
              {(templates as RecurringTemplate[]).map(t => (
                <tr key={t.id} className="border-b border-border/50 hover:bg-muted/30">
                  <td className="py-2 px-2 font-medium">{t.name}</td>
                  <td className="py-2 px-2 text-xs">{t.voucher_type}</td>
                  <td className="py-2 px-2 text-xs">{t.frequency}</td>
                  <td className="py-2 px-2 text-right font-mono">{formatCurrency(t.amount)}</td>
                  <td className="py-2 px-2 text-xs">{formatDate(t.next_run_date)}</td>
                  <td className="py-2 px-2 text-center text-xs">{t.run_count}</td>
                  <td className="py-2 px-2 text-center"><Badge variant={t.is_active ? 'default' : 'secondary'}>{t.is_active ? 'Active' : 'Paused'}</Badge></td>
                  <td className="py-2 px-2 text-right">
                    <div className="flex gap-1 justify-end">
                      <button onClick={() => pauseMut.mutate(t.id)} className="p-1 hover:bg-muted rounded" title={t.is_active ? 'Pause' : 'Resume'}>
                        {t.is_active ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                      </button>
                      <button onClick={() => { if (confirm('Delete this template?')) deleteMut.mutate(t.id); }} className="p-1 hover:bg-muted rounded text-destructive">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </CardContent>
    </Card>
  );
}
