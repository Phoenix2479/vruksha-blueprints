import React, { useEffect, useState } from 'react';
import { Button, Table, Input } from '../../../../shared/components/index.ts';
import { hasAnyRole } from '../../../../shared/utils/auth.ts';
import {
  createCategory, listCategories, createVariant, listVariants,
  searchProducts, pushChannelInventory, postEcomOrder, listChannelLogs, listEcomOrders
} from '../api/wave2';

export const Wave2: React.FC = () => {
  // Categories
  const [categories, setCategories] = useState<any[]>([]);
  const [catName, setCatName] = useState('Apparel');

  // Variants
  const [prodSearch, setProdSearch] = useState('');
  const [products, setProducts] = useState<any[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<string>('');
  const [variants, setVariants] = useState<any[]>([]);
  const [variantSku, setVariantSku] = useState('');
  const [variantAttrs, setVariantAttrs] = useState('{"size":"M","color":"Black"}');

  // Channel push
  const [channel, setChannel] = useState('amazon');
  const [channelSKU, setChannelSKU] = useState('');
  const [channelQty, setChannelQty] = useState('5');
  const [channelLogs, setChannelLogs] = useState<any[]>([]);

  // Ecom webhook
  const [ecomSource, setEcomSource] = useState('shopify');
  const [ecomSku, setEcomSku] = useState('');
  const [orders, setOrders] = useState<any[]>([]);

  useEffect(()=>{ (async()=>{ setCategories(await listCategories().catch(()=>[])); setChannelLogs(await listChannelLogs().catch(()=>[])); setOrders(await listEcomOrders().catch(()=>[])); })(); },[]);

  const onCreateCategory = async () => { if (!catName.trim()) return; await createCategory(catName.trim()); setCategories(await listCategories()); setCatName(''); };
  const onSearchProducts = async () => { setProducts(await searchProducts(prodSearch)); };
  const onSelectProduct = async (id: string) => { setSelectedProduct(id); setVariants(await listVariants(id)); };
  const onAddVariant = async () => {
    if (!selectedProduct || !variantSku.trim()) return;
    let attrs: any = undefined;
    try { attrs = JSON.parse(variantAttrs); } catch {}
    await createVariant(selectedProduct, variantSku.trim(), attrs);
    setVariants(await listVariants(selectedProduct));
    setVariantSku('');
  };
  const onPushChannel = async () => {
    const qty = parseInt(channelQty||'0',10);
    if (!channelSKU || !qty) return;
    await pushChannelInventory(channel, [{ sku: channelSKU, quantity: qty }]);
    setChannelLogs(await listChannelLogs());
  };
  const onPostOrder = async () => {
    if (!ecomSku.trim()) return;
    await postEcomOrder(ecomSource, { id: `DASH-${Date.now()}`, items:[{ sku: ecomSku, qty: 1 }] });
    setOrders(await listEcomOrders());
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      <h1 className="text-2xl font-bold mb-4">Wave 2 — Catalog & Channel</h1>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Categories */}
        <div className="card">
          <h2 className="text-lg font-semibold mb-3">Categories</h2>
          <div className="flex gap-2 mb-2">
            <Input placeholder="Category name" value={catName} onChange={(e:any)=>setCatName(e.target.value)} />
            {hasAnyRole(['manager','admin','ops']) && <Button onClick={onCreateCategory}>Create</Button>}
          </div>
          <Table columns={[{key:'name', header:'Name'},{key:'created_at', header:'Created'}]} data={categories} />
        </div>

        {/* Variants */}
        <div className="card">
          <h2 className="text-lg font-semibold mb-3">Product Variants</h2>
          <div className="flex gap-2 mb-2">
            <Input placeholder="Search products" value={prodSearch} onChange={(e:any)=>setProdSearch(e.target.value)} />
            <Button variant="secondary" onClick={onSearchProducts}>Search</Button>
          </div>
          <div className="flex gap-2 mb-2">
            <select className="input" value={selectedProduct} onChange={(e)=>onSelectProduct(e.target.value)}>
              <option value="">Select product</option>
              {products.map((p:any)=>(<option key={p.id} value={p.id}>{p.name} ({p.sku})</option>))}
            </select>
            <Input placeholder="Variant SKU" value={variantSku} onChange={(e:any)=>setVariantSku(e.target.value)} />
            <Input placeholder='Attributes JSON' value={variantAttrs} onChange={(e:any)=>setVariantAttrs(e.target.value)} />
            {hasAnyRole(['manager','admin']) && <Button onClick={onAddVariant}>Add</Button>}
          </div>
          <div className="max-h-56 overflow-auto">
            <Table columns={[{key:'sku', header:'SKU'},{key:'attributes', header:'Attributes'},{key:'created_at', header:'Created'}]} data={variants.map(v=>({ ...v, attributes: typeof v.attributes==='object'? JSON.stringify(v.attributes): v.attributes }))} />
          </div>
        </div>

        {/* Channel Push */}
        <div className="card">
          <h2 className="text-lg font-semibold mb-3">Channel Sync</h2>
          <div className="flex gap-2 mb-2">
            <Input placeholder="Channel" value={channel} onChange={(e:any)=>setChannel(e.target.value)} />
            <Input placeholder="SKU" value={channelSKU} onChange={(e:any)=>setChannelSKU(e.target.value)} />
            <Input placeholder="Qty" value={channelQty} onChange={(e:any)=>setChannelQty(e.target.value)} />
            {hasAnyRole(['manager','admin','ops']) && <Button onClick={onPushChannel}>Queue</Button>}
          </div>
          <p className="text-xs text-gray-500">Queues a sync log entry; background worker can push to provider.</p>
          <div className="max-h-56 overflow-auto mt-3">
            <Table columns={[{key:'channel', header:'Channel'},{key:'action', header:'Action'},{key:'status', header:'Status'},{key:'attempts', header:'Attempts'},{key:'created_at', header:'At'}]} data={channelLogs} />
          </div>
        </div>

        {/* E-com Webhook */}
        <div className="card">
          <h2 className="text-lg font-semibold mb-3">E‑commerce Webhook Tester</h2>
          <div className="flex gap-2 mb-2">
            <Input placeholder="Source (shopify/magento)" value={ecomSource} onChange={(e:any)=>setEcomSource(e.target.value)} />
            <Input placeholder="Order SKU" value={ecomSku} onChange={(e:any)=>setEcomSku(e.target.value)} />
            <Button onClick={onPostOrder}>Send</Button>
          </div>
          <p className="text-xs text-gray-500">Sends a minimal order payload to the integration service.</p>
          <div className="max-h-56 overflow-auto mt-3">
            <Table columns={[{key:'source', header:'Source'},{key:'external_id', header:'External ID'},{key:'status', header:'Status'},{key:'created_at', header:'At'}]} data={orders} />
          </div>
        </div>
      </div>
    </div>
  );
};
