import React, { useEffect, useState } from 'react';
import { Button, Table, Input } from '../../../../shared/components/index.ts';
import { taxSummary, taxByRate, revenueReport, auditList } from '../api/wave5';

function todayISO(){ return new Date().toISOString().slice(0,10); }
function daysAgoISO(n:number){ const d=new Date(); d.setDate(d.getDate()-n); return d.toISOString().slice(0,10); }

export const Wave5: React.FC = () => {
  const [from, setFrom] = useState(daysAgoISO(30));
  const [to, setTo] = useState(todayISO());
  const [includeUnpaid, setIncludeUnpaid] = useState(false);
  const [summary, setSummary] = useState<any|null>(null);
  const [byRate, setByRate] = useState<any[]>([]);
  const [revenue, setRevenue] = useState<any[]>([]);
  const [audit, setAudit] = useState<any[]>([]);

  const refresh = async () => {
    setSummary(await taxSummary(from, to, includeUnpaid).catch(()=>null));
    setByRate(await taxByRate(from, to, includeUnpaid).catch(()=>[]));
    setRevenue(await revenueReport(from, to).catch(()=>[]));
    setAudit(await auditList(100).catch(()=>[]));
  };

  useEffect(()=>{ refresh(); },[]);

  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      <h1 className="text-2xl font-bold mb-4">Wave 5 — Finance & Compliance</h1>
      <div className="flex flex-wrap gap-2 mb-4 items-center">
        <Input type="date" value={from} onChange={(e:any)=>setFrom(e.target.value)} />
        <Input type="date" value={to} onChange={(e:any)=>setTo(e.target.value)} />
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={includeUnpaid} onChange={(e)=>setIncludeUnpaid(e.target.checked)} /> Include unpaid</label>
        <Button variant="secondary" onClick={refresh}>Refresh</Button>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card">
          <h2 className="text-lg font-semibold mb-3">Tax Summary</h2>
          <div className="text-sm">Subtotal: {summary?.subtotal ?? 0} | Tax: {summary?.tax ?? 0} | Total: {summary?.total ?? 0} | Count: {summary?.count ?? 0}</div>
          <div className="max-h-56 overflow-auto mt-2">
            <Table columns={[{key:'tax_rate', header:'Rate %'},{key:'tax_amount', header:'Tax Amount'}]} data={byRate} />
          </div>
        </div>
        <div className="card">
          <h2 className="text-lg font-semibold mb-3">Revenue by Status</h2>
          <div className="max-h-56 overflow-auto">
            <Table columns={[{key:'status', header:'Status'},{key:'count', header:'Count'},{key:'total', header:'Total'},{key:'paid', header:'Paid'}]} data={revenue} />
          </div>
        </div>
        <div className="card lg:col-span-2">
          <h2 className="text-lg font-semibold mb-3">Audit Log (latest 100)</h2>
          <div className="max-h-64 overflow-auto">
            <Table columns={[{key:'created_at', header:'At'},{key:'entity_type', header:'Entity'},{key:'action', header:'Action'},{key:'user_id', header:'User'}]} data={audit} />
          </div>
        </div>
      </div>
    </div>
  );
};
