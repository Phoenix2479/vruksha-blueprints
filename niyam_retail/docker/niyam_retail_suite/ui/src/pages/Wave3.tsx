import React, { useEffect, useState } from 'react';
import { Button, Table, Input } from '../../../../shared/components/index.ts';
import { hasAnyRole } from '../../../../shared/utils/auth.ts';
import { listReturns, createReturn, updateReturnStatus, listTransfers, createTransfer, updateTransferStatus, listPOs, createPO, updatePOStatus, listVendors, createVendor } from '../api/wave3';

export const Wave3: React.FC = () => {
  // Returns state
  const [returns, setReturns] = useState<any[]>([]);
  const [retSku, setRetSku] = useState('');
  const [retQty, setRetQty] = useState('1');
  const [retPrice, setRetPrice] = useState('0');
  const [retReason, setRetReason] = useState('');

  // Transfers state
  const [transfers, setTransfers] = useState<any[]>([]);
  const [trSku, setTrSku] = useState('');
  const [trQty, setTrQty] = useState('1');

  // POs state
  const [pos, setPOs] = useState<any[]>([]);
  const [vendors, setVendors] = useState<any[]>([]);
  const [vendorId, setVendorId] = useState('');
  const [poSku, setPoSku] = useState('');
  const [poQty, setPoQty] = useState('10');
  const [poCost, setPoCost] = useState('1.00');
  const [vendorCode, setVendorCode] = useState('SUP-' + Date.now().toString().slice(-6));
  const [vendorName, setVendorName] = useState('New Supplier');

  useEffect(()=>{ (async()=>{
    setReturns(await listReturns().catch(()=>[]));
    setTransfers(await listTransfers().catch(()=>[]));
    setPOs(await listPOs().catch(()=>[]));
    setVendors(await listVendors().catch(()=>[]));
  })(); },[]);

  const refreshAll = async () => {
    setReturns(await listReturns().catch(()=>[]));
    setTransfers(await listTransfers().catch(()=>[]));
    setPOs(await listPOs().catch(()=>[]));
    setVendors(await listVendors().catch(()=>[]));
  };

  const onCreateReturn = async () => {
    const qty = parseInt(retQty||'0',10); const price = parseFloat(retPrice||'0');
    if (!retSku || qty<=0) return;
    await createReturn({ items:[{ sku: retSku, quantity: qty, unit_price: price }], reason: retReason||undefined, refund_method: 'cash' });
    setRetSku(''); setRetQty('1'); setRetPrice('0'); setRetReason('');
    setReturns(await listReturns());
  };

  const onCreateTransfer = async () => {
    const qty = parseInt(trQty||'0',10); if (!trSku || qty<=0) return;
    await createTransfer([{ sku: trSku, quantity: qty }]);
    setTrSku(''); setTrQty('1');
    setTransfers(await listTransfers());
  };

  const onCreateVendor = async () => {
    if (!vendorCode.trim() || !vendorName.trim()) return;
    await createVendor(vendorCode.trim(), vendorName.trim());
    setVendors(await listVendors());
  };

  const onCreatePO = async () => {
    const qty = parseInt(poQty||'0',10); const cost = parseFloat(poCost||'0');
    if (!vendorId || !poSku || qty<=0 || cost<=0) return;
    await createPO(vendorId, [{ sku: poSku, quantity: qty, unit_cost: cost }]);
    setPOs(await listPOs());
  };

  const nextTransferStatus = (s:string) => s==='pending' ? 'in_transit' : s==='in_transit' ? 'completed' : 'completed';

  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      <h1 className="text-2xl font-bold mb-4">Wave 3 — Returns, Transfers, Supply</h1>
      <div className="flex gap-2 mb-4">
        <Button variant="secondary" onClick={refreshAll}>Refresh</Button>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Returns */}
        <div className="card">
          <h2 className="text-lg font-semibold mb-3">Returns</h2>
          <div className="flex flex-wrap gap-2 mb-2">
            <Input placeholder="SKU" value={retSku} onChange={(e:any)=>setRetSku(e.target.value)} />
            <Input placeholder="Qty" value={retQty} onChange={(e:any)=>setRetQty(e.target.value)} />
            <Input placeholder="Unit Price" value={retPrice} onChange={(e:any)=>setRetPrice(e.target.value)} />
            <Input placeholder="Reason" value={retReason} onChange={(e:any)=>setRetReason(e.target.value)} />
            {hasAnyRole(['manager','admin','ops']) && <Button onClick={onCreateReturn}>Create Return</Button>}
          </div>
          <div className="max-h-56 overflow-auto">
            <Table columns={[{key:'return_number', header:'Number'},{key:'status', header:'Status'},{key:'total', header:'Total'},{key:'created_at', header:'At'}]} data={returns} />
          </div>
          <div className="flex flex-wrap gap-2 mt-2">
            {returns.slice(0,5).map((r:any)=>(
              <Button key={r.id} variant="secondary" onClick={async()=>{ const ns=nextTransferStatus(r.status); await updateReturnStatus(r.id, ns==='completed'?'approved':'approved'); setReturns(await listReturns()); }}>Approve {r.return_number}</Button>
            ))}
          </div>
        </div>

        {/* Transfers */}
        <div className="card">
          <h2 className="text-lg font-semibold mb-3">Stock Transfers</h2>
          <div className="flex flex-wrap gap-2 mb-2">
            <Input placeholder="SKU" value={trSku} onChange={(e:any)=>setTrSku(e.target.value)} />
            <Input placeholder="Qty" value={trQty} onChange={(e:any)=>setTrQty(e.target.value)} />
            {hasAnyRole(['manager','admin','ops']) && <Button onClick={onCreateTransfer}>Create Transfer</Button>}
          </div>
          <div className="max-h-56 overflow-auto">
            <Table columns={[{key:'transfer_number', header:'Number'},{key:'status', header:'Status'},{key:'created_at', header:'At'}]} data={transfers} />
          </div>
          <div className="flex flex-wrap gap-2 mt-2">
            {transfers.slice(0,5).map((t:any)=>(
              <Button key={t.id} variant="secondary" onClick={async()=>{ const ns=nextTransferStatus(t.status); await updateTransferStatus(t.id, ns); setTransfers(await listTransfers()); }}>{t.transfer_number}: {t.status} → {nextTransferStatus(t.status)}</Button>
            ))}
          </div>
        </div>

        {/* Vendors & Purchase Orders */}
        <div className="card">
          <h2 className="text-lg font-semibold mb-3">Vendors</h2>
          <div className="flex flex-wrap gap-2 mb-2">
            <Input placeholder="Code" value={vendorCode} onChange={(e:any)=>setVendorCode(e.target.value)} />
            <Input placeholder="Name" value={vendorName} onChange={(e:any)=>setVendorName(e.target.value)} />
            {hasAnyRole(['manager','admin','ops']) && <Button onClick={onCreateVendor}>Add Vendor</Button>}
          </div>
          <div className="max-h-40 overflow-auto">
            <Table columns={[{key:'code', header:'Code'},{key:'name', header:'Name'},{key:'created_at', header:'At'}]} data={vendors} />
          </div>
        </div>

        <div className="card">
          <h2 className="text-lg font-semibold mb-3">Purchase Orders</h2>
          <div className="flex flex-wrap gap-2 mb-2">
            <select className="input" value={vendorId} onChange={(e)=>setVendorId(e.target.value)}>
              <option value="">Select Vendor</option>
              {vendors.map((v:any)=>(<option key={v.id} value={v.id}>{v.name} ({v.code})</option>))}
            </select>
            <Input placeholder="SKU" value={poSku} onChange={(e:any)=>setPoSku(e.target.value)} />
            <Input placeholder="Qty" value={poQty} onChange={(e:any)=>setPoQty(e.target.value)} />
            <Input placeholder="Unit Cost" value={poCost} onChange={(e:any)=>setPoCost(e.target.value)} />
            {hasAnyRole(['manager','admin','ops']) && <Button onClick={onCreatePO}>Create PO</Button>}
          </div>
          <div className="max-h-56 overflow-auto">
            <Table columns={[{key:'po_number', header:'Number'},{key:'status', header:'Status'},{key:'total', header:'Total'},{key:'created_at', header:'At'}]} data={pos} />
          </div>
          <div className="flex flex-wrap gap-2 mt-2">
            {pos.slice(0,5).map((p:any)=>(
              <Button key={p.id} variant="secondary" onClick={async()=>{ const next = p.status==='draft'?'ordered': p.status==='ordered'?'received':'received'; await updatePOStatus(p.id, next); setPOs(await listPOs()); }}>{p.po_number}: next → {p.status==='draft'?'ordered': p.status==='ordered'?'received':'received'}</Button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
