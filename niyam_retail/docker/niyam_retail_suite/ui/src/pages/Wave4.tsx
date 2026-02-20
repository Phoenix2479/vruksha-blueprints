import React, { useEffect, useState } from 'react';
import { Button, Table, Input } from '../../../../shared/components/index.ts';
import { hasAnyRole } from '../../../../shared/utils/auth.ts';
import { listPromotions, createPromotion, updatePromotion, validatePromotion, updatePrice, priceHistory, quotePrices } from '../api/wave4';

export const Wave4: React.FC = () => {
  const [promos, setPromos] = useState<any[]>([]);
  const [code, setCode] = useState('');
  const [discountType, setDiscountType] = useState<'percentage'|'fixed'>('percentage');
  const [discountValue, setDiscountValue] = useState('10');
  const [promoName, setPromoName] = useState('New Promo');
  const [promoActive, setPromoActive] = useState(true);

  const [sku, setSku] = useState('');
  const [qty, setQty] = useState('1');
  const [cart, setCart] = useState<{ sku:string, quantity:number, price?:number }[]>([]);
  const [quote, setQuote] = useState<any|null>(null);
  const [validation, setValidation] = useState<any|null>(null);

  const [priceSku, setPriceSku] = useState('');
  const [newPrice, setNewPrice] = useState('');
  const [history, setHistory] = useState<any[]>([]);

  useEffect(()=>{ (async()=>{ setPromos(await listPromotions().catch(()=>[])); })(); },[]);

  const onCreatePromo = async () => {
    const dv = parseFloat(discountValue||'0'); if (!promoName.trim() || !dv) return;
    await createPromotion({ code: code || undefined, name: promoName.trim(), discount_type: discountType, discount_value: dv, start_date: new Date(), end_date: new Date(Date.now()+86400000), active: promoActive });
    setPromos(await listPromotions());
  };

  const onTogglePromo = async (p:any) => {
    await updatePromotion(p.id, { active: !p.active });
    setPromos(await listPromotions());
  };

  const onAddToCart = () => {
    const q = parseInt(qty||'0',10); if (!sku || q<=0) return; setCart([...cart, { sku, quantity: q }]); setSku(''); setQty('1');
  };
  const onQuote = async () => {
    const q = await quotePrices(cart.map(i=>({ sku: i.sku, quantity: i.quantity })));
    setQuote(q);
  };
  const onValidate = async () => {
    if (!quote) return; const v = await validatePromotion(code, quote.items.map((i:any)=>({ sku: i.sku, price: i.unit_price, quantity: i.quantity })));
    setValidation(v);
  };

  const onUpdatePrice = async () => {
    const np = parseFloat(newPrice||'0'); if (!priceSku || np<=0) return; await updatePrice(priceSku, np, 'dashboard'); setHistory(await priceHistory(priceSku)); };
  const onLoadHistory = async () => { if (priceSku) setHistory(await priceHistory(priceSku)); };

  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      <h1 className="text-2xl font-bold mb-4">Wave 4 — Pricing & Promotions</h1>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Promotions */}
        <div className="card">
          <h2 className="text-lg font-semibold mb-3">Promotions</h2>
          <div className="flex flex-wrap gap-2 mb-2">
            <Input placeholder="Code (optional)" value={code} onChange={(e:any)=>setCode(e.target.value)} />
            <Input placeholder="Name" value={promoName} onChange={(e:any)=>setPromoName(e.target.value)} />
            <select className="input" value={discountType} onChange={(e:any)=>setDiscountType(e.target.value)}>
              <option value="percentage">percentage</option>
              <option value="fixed">fixed</option>
            </select>
            <Input placeholder="Value" value={discountValue} onChange={(e:any)=>setDiscountValue(e.target.value)} />
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={promoActive} onChange={(e)=>setPromoActive(e.target.checked)} /> Active</label>
            {hasAnyRole(['manager','admin','marketing']) && <Button onClick={onCreatePromo}>Create</Button>}
          </div>
          <div className="max-h-56 overflow-auto">
            <Table columns={[{key:'code', header:'Code'},{key:'name', header:'Name'},{key:'discount_type', header:'Type'},{key:'discount_value', header:'Value'},{key:'active', header:'Active'}]} data={promos} />
          </div>
          <div className="flex flex-wrap gap-2 mt-2">
            {promos.slice(0,5).map((p:any)=>(<Button key={p.id} variant="secondary" onClick={()=>onTogglePromo(p)}>{p.code||p.name}: {p.active?'Disable':'Enable'}</Button>))}
          </div>
        </div>

        {/* Pricing */}
        <div className="card">
          <h2 className="text-lg font-semibold mb-3">Pricing</h2>
          <div className="flex flex-wrap gap-2 mb-2">
            <Input placeholder="SKU" value={priceSku} onChange={(e:any)=>setPriceSku(e.target.value)} />
            <Input placeholder="New Price" value={newPrice} onChange={(e:any)=>setNewPrice(e.target.value)} />
            {hasAnyRole(['manager','admin','ops']) && <Button onClick={onUpdatePrice}>Update Price</Button>}
            <Button variant="secondary" onClick={onLoadHistory}>Load History</Button>
          </div>
          <div className="max-h-56 overflow-auto">
            <Table columns={[{key:'effective_date', header:'Date'},{key:'old_price', header:'Old'},{key:'new_price', header:'New'},{key:'reason', header:'Reason'}]} data={history} />
          </div>
        </div>

        {/* Quote & Validate */}
        <div className="card">
          <h2 className="text-lg font-semibold mb-3">Cart Quote & Promo Validate</h2>
          <div className="flex flex-wrap gap-2 mb-2">
            <Input placeholder="SKU" value={sku} onChange={(e:any)=>setSku(e.target.value)} />
            <Input placeholder="Qty" value={qty} onChange={(e:any)=>setQty(e.target.value)} />
            <Button onClick={onAddToCart}>Add</Button>
            <Button variant="secondary" onClick={onQuote}>Quote</Button>
            <Button variant="secondary" onClick={onValidate}>Validate Promo</Button>
          </div>
          <div className="text-sm mb-2">Cart: {cart.map(i=>`${i.sku}x${i.quantity}`).join(', ') || 'empty'}</div>
          {quote && (
            <div className="text-sm">Subtotal: {quote.subtotal} | Items: {quote.items.length}</div>
          )}
          {validation && (
            <div className="text-sm">Promo: {validation.promotion?.code || validation.promotion?.name} | Discount: {validation.discount_total} | Final: {validation.final_total}</div>
          )}
        </div>
      </div>
    </div>
  );
};
