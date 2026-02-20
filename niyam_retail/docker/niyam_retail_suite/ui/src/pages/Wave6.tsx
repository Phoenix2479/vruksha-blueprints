import React, { useEffect, useState } from 'react';
import { Button, Table, Input } from '../../../../shared/components/index.ts';
import { listKioskOrders, createKioskOrder, updateKioskStatus, listWarranties, claimWarranty } from '../api/wave6';

export const Wave6: React.FC = () => {
  const [orders, setOrders] = useState<any[]>([]);
  const [kioskId, setKioskId] = useState('KIOSK-01');
  const [sku, setSku] = useState('');
  const [qty, setQty] = useState('1');

  const [warranties, setWarranties] = useState<any[]>([]);
  const [wSku, setWSku] = useState('');
  const [wCustomerEmail, setWCustomerEmail] = useState('');
  const [wMonths, setWMonths] = useState('12');

  useEffect(()=>{ (async()=>{ setOrders(await listKioskOrders().catch(()=>[])); setWarranties(await listWarranties().catch(()=>[])); })(); },[]);

  const onCreateOrder = async () => {
    const q = parseInt(qty||'0',10); if (!kioskId || !sku || q<=0) return;
    await createKioskOrder(kioskId, [{ sku, quantity: q, price: 1 }]);
    setOrders(await listKioskOrders());
    setSku(''); setQty('1');
  };

  const onCreateWarranty = async () => {
    const months = parseInt(wMonths||'0',10); if (!wSku || !wCustomerEmail || months<=0) return;
    // Minimal warranty: will resolve product by SKU via backend would be ideal; here we ask user to enter product id via SKU -> handled elsewhere. For demo, assuming SKU equals product_id is not correct, so keep UI as listing only.
    alert('Create warranty requires product selection by ID; use backend or inventory UI to copy product ID.');
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      <h1 className="text-2xl font-bold mb-4">Wave 6 — POS Extensions</h1>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card">
          <h2 className="text-lg font-semibold mb-3">Kiosk Orders</h2>
          <div className="flex flex-wrap gap-2 mb-2">
            <Input placeholder="Kiosk ID" value={kioskId} onChange={(e:any)=>setKioskId(e.target.value)} />
            <Input placeholder="SKU" value={sku} onChange={(e:any)=>setSku(e.target.value)} />
            <Input placeholder="Qty" value={qty} onChange={(e:any)=>setQty(e.target.value)} />
            <Button onClick={onCreateOrder}>Create</Button>
          </div>
          <div className="max-h-56 overflow-auto">
            <Table columns={[{key:'order_number', header:'Number'},{key:'order_status', header:'Status'},{key:'total', header:'Total'},{key:'created_at', header:'At'}]} data={orders} />
          </div>
          <div className="flex flex-wrap gap-2 mt-2">
            {orders.slice(0,5).map((o:any)=>(
              <Button key={o.id} variant="secondary" onClick={async()=>{ const ns=o.order_status==='pending'?'preparing': o.order_status==='preparing'?'ready':'completed'; await updateKioskStatus(o.id, ns); setOrders(await listKioskOrders()); }}>{o.order_number}: {o.order_status} → next</Button>
            ))}
          </div>
        </div>
        <div className="card">
          <h2 className="text-lg font-semibold mb-3">Warranties</h2>
          <div className="flex flex-wrap gap-2 mb-2">
            <Input placeholder="Product ID" value={wSku} onChange={(e:any)=>setWSku(e.target.value)} />
            <Input placeholder="Customer Email" value={wCustomerEmail} onChange={(e:any)=>setWCustomerEmail(e.target.value)} />
            <Input placeholder="Months" value={wMonths} onChange={(e:any)=>setWMonths(e.target.value)} />
            <Button variant="secondary" onClick={onCreateWarranty}>Create (via API)</Button>
          </div>
          <div className="max-h-56 overflow-auto">
            <Table columns={[{key:'warranty_number', header:'Number'},{key:'status', header:'Status'},{key:'expiry_date', header:'Expiry'},{key:'created_at', header:'At'}]} data={warranties} />
          </div>
          <div className="flex flex-wrap gap-2 mt-2">
            {warranties.slice(0,5).map((w:any)=>(
              <Button key={w.id} variant="secondary" onClick={async()=>{ await claimWarranty(w.id,'Dashboard claim'); setWarranties(await listWarranties()); }}>{w.warranty_number}: Claim</Button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
