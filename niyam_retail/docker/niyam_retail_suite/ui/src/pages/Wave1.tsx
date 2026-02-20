import React, { useEffect, useState } from 'react';
import { Button, Table, Input } from '../../../../shared/components/index.ts';
import { hasAnyRole } from '../../../../shared/utils/auth.ts';
import {
  listSegments, createSegment, listCustomers, addCustomerTags,
  getLoyaltySummary, redeemPoints,
  listFeedback, createFeedback,
  listNotifications, enqueueNotification,
  listCampaigns, createCampaign, runCampaign,
} from '../api/wave1';

export const Wave1: React.FC = () => {
  // CRM
  const [segments, setSegments] = useState<any[]>([]);
  const [segName, setSegName] = useState('');
  const [segDesc, setSegDesc] = useState('');
  const [custSearch, setCustSearch] = useState('');
  const [customers, setCustomers] = useState<any[]>([]);
  const [tagInput, setTagInput] = useState('vip');
  const [selectedCustomer, setSelectedCustomer] = useState<string>('');

  // Loyalty
  const [loyaltyCustomerId, setLoyaltyCustomerId] = useState('');
  const [loyalty, setLoyalty] = useState<any|null>(null);
  const [redeem, setRedeem] = useState('');

  // Feedback
  const [feedback, setFeedback] = useState<any[]>([]);
  const [rating, setRating] = useState('');
  const [comments, setComments] = useState('');

  // Notifications
  const [queue, setQueue] = useState<any[]>([]);
  const [recipient, setRecipient] = useState('test@example.com');

  // Marketing
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [campaignName, setCampaignName] = useState('Welcome Campaign');

  useEffect(() => { (async()=>{ await refreshAll(); })(); }, []);

  const refreshAll = async () => {
    try {
      const [segs, fbs, nots, camps] = await Promise.all([
        listSegments().catch(()=>[]),
        listFeedback().catch(()=>[]),
        listNotifications().catch(()=>[]),
        listCampaigns().catch(()=>[]),
      ]);
      setSegments(segs); setFeedback(fbs); setQueue(nots); setCampaigns(camps);
    } catch {}
  };

  const onCreateSegment = async () => {
    if (!segName.trim()) return;
    await createSegment(segName.trim(), segDesc || undefined);
    setSegName(''); setSegDesc('');
    setSegments(await listSegments());
  };

  const onSearchCustomers = async () => { setCustomers(await listCustomers(custSearch)); };
  const onAddTags = async () => { if (!selectedCustomer) return; const names = tagInput.split(',').map(s=>s.trim()).filter(Boolean); if (names.length===0) return; await addCustomerTags(selectedCustomer, names); alert('Tags added'); };

  const onLoadLoyalty = async () => { if (!loyaltyCustomerId) return; setLoyalty(await getLoyaltySummary(loyaltyCustomerId)); };
  const onRedeem = async () => { const pts = parseInt(redeem||'0',10); if (!loyaltyCustomerId || !pts) return; await redeemPoints(loyaltyCustomerId, pts, 'dashboard'); await onLoadLoyalty(); setRedeem(''); };

  const onSubmitFeedback = async () => { const r = rating? parseInt(rating,10): undefined; await createFeedback({ rating: r, feedback_type: 'nps', comments }); setRating(''); setComments(''); setFeedback(await listFeedback()); };

  const onEnqueue = async () => { await enqueueNotification({ channel:'email', recipient, payload:{subject:'Hello', body:'Welcome'} }); setQueue(await listNotifications()); };

  const onCreateCampaign = async () => { if (!campaignName.trim()) return; const c = await createCampaign(campaignName.trim()); setCampaignName(''); setCampaigns(await listCampaigns()); await runCampaign(c.id); };

  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      <h1 className="text-2xl font-bold mb-4">Wave 1 — Customer & Loyalty</h1>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* CRM Segments & Tags */}
        <div className="card">
          <h2 className="text-lg font-semibold mb-3">CRM — Segments</h2>
          <div className="flex gap-2 mb-3">
            <Input placeholder="Segment name" value={segName} onChange={(e:any)=>setSegName(e.target.value)} />
            <Input placeholder="Description (optional)" value={segDesc} onChange={(e:any)=>setSegDesc(e.target.value)} />
            {hasAnyRole(['manager','admin']) && <Button onClick={onCreateSegment}>Create</Button>}
          </div>
          <Table columns={[{key:'name', header:'Name'},{key:'created_at', header:'Created'}]} data={segments} />
          <div className="mt-4">
            <h3 className="font-medium mb-2">Customer Tags</h3>
            <div className="flex gap-2 mb-2">
              <Input placeholder="Search customers" value={custSearch} onChange={(e:any)=>setCustSearch(e.target.value)} />
              <Button variant="secondary" onClick={onSearchCustomers}>Search</Button>
            </div>
            <div className="flex gap-2 mb-2">
              <select className="input" value={selectedCustomer} onChange={(e)=>setSelectedCustomer(e.target.value)}>
                <option value="">Select customer</option>
                {customers.map((c:any)=>(<option key={c.id} value={c.id}>{c.name} {c.email?`(${c.email})`:''}</option>))}
              </select>
              <Input placeholder="Tags (comma separated)" value={tagInput} onChange={(e:any)=>setTagInput(e.target.value)} />
              {hasAnyRole(['manager','admin']) && <Button onClick={onAddTags}>Add Tags</Button>}
            </div>
          </div>
        </div>

        {/* Loyalty */}
        <div className="card">
          <h2 className="text-lg font-semibold mb-3">Loyalty — Summary & Redeem</h2>
          <div className="flex gap-2 mb-3">
            <Input placeholder="Customer ID" value={loyaltyCustomerId} onChange={(e:any)=>setLoyaltyCustomerId(e.target.value)} />
            <Button variant="secondary" onClick={onLoadLoyalty}>Load</Button>
          </div>
          {loyalty && (
            <div className="mb-3 text-sm">
              <div>Name: {loyalty.customer?.name}</div>
              <div>Tier: {loyalty.customer?.loyalty_tier}</div>
              <div>Points: {loyalty.customer?.loyalty_points}</div>
            </div>
          )}
          <div className="flex gap-2">
            <Input placeholder="Points to redeem" value={redeem} onChange={(e:any)=>setRedeem(e.target.value)} />
            {hasAnyRole(['cashier','manager','admin']) && <Button onClick={onRedeem}>Redeem</Button>}
          </div>
        </div>

        {/* Feedback */}
        <div className="card">
          <h2 className="text-lg font-semibold mb-3">Feedback — NPS</h2>
          <div className="flex gap-2 mb-2">
            <Input placeholder="Rating (0-10)" value={rating} onChange={(e:any)=>setRating(e.target.value)} />
            <Input placeholder="Comments" value={comments} onChange={(e:any)=>setComments(e.target.value)} />
            <Button onClick={onSubmitFeedback}>Submit</Button>
          </div>
          <div className="max-h-56 overflow-auto">
            <Table columns={[{key:'rating', header:'Rating'},{key:'created_at', header:'At'},{key:'comments', header:'Comments'}]} data={feedback} />
          </div>
        </div>

        {/* Notifications */}
        <div className="card">
          <h2 className="text-lg font-semibold mb-3">Notifications — Outbox</h2>
          <div className="flex gap-2 mb-2">
            <Input placeholder="Recipient" value={recipient} onChange={(e:any)=>setRecipient(e.target.value)} />
            <Button onClick={onEnqueue}>Queue Email</Button>
          </div>
          <div className="max-h-56 overflow-auto">
            <Table columns={[{key:'channel', header:'Channel'},{key:'recipient', header:'Recipient'},{key:'status', header:'Status'},{key:'created_at', header:'At'}]} data={queue} />
          </div>
        </div>

        {/* Marketing */}
        <div className="card">
          <h2 className="text-lg font-semibold mb-3">Marketing — Campaigns</h2>
          <div className="flex gap-2 mb-2">
            <Input placeholder="Campaign name" value={campaignName} onChange={(e:any)=>setCampaignName(e.target.value)} />
            {hasAnyRole(['marketing','manager','admin','ops']) && <Button onClick={onCreateCampaign}>Create & Run</Button>}
          </div>
          <div className="max-h-56 overflow-auto">
            <Table columns={[{key:'name', header:'Name'},{key:'status', header:'Status'},{key:'created_at', header:'Created'}]} data={campaigns} />
          </div>
        </div>
      </div>
    </div>
  );
};
