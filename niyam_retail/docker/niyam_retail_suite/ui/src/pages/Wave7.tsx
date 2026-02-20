import React, { useEffect, useState } from 'react';
import { Button, Table, Input } from '../../../../shared/components/index.ts';
import { listEmployees, createEmployee, listAssets, createAsset, assignAsset, listVendorFeedback, createVendorFeedback } from '../api/wave7';

export const Wave7: React.FC = () => {
  const [employees, setEmployees] = useState<any[]>([]);
  const [assets, setAssets] = useState<any[]>([]);
  const [feedback, setFeedback] = useState<any[]>([]);

  const [empName, setEmpName] = useState('');
  const [empEmail, setEmpEmail] = useState('');
  const [empRole, setEmpRole] = useState('cashier');

  const [assetTag, setAssetTag] = useState('');
  const [assetName, setAssetName] = useState('');
  const [assetCat, setAssetCat] = useState('');
  const [assignTo, setAssignTo] = useState('');

  const [vfSubject, setVfSubject] = useState('');
  const [vfMessage, setVfMessage] = useState('');
  const [vfRating, setVfRating] = useState('5');

  useEffect(()=>{ (async()=>{
    setEmployees(await listEmployees().catch(()=>[]));
    setAssets(await listAssets().catch(()=>[]));
    setFeedback(await listVendorFeedback().catch(()=>[]));
  })(); },[]);

  const onAddEmployee = async ()=>{
    if (!empName) return; await createEmployee({ name: empName, email: empEmail || undefined, role: empRole || undefined });
    setEmployees(await listEmployees()); setEmpName(''); setEmpEmail(''); setEmpRole('cashier');
  };
  const onAddAsset = async ()=>{
    if (!assetTag || !assetName) return; await createAsset({ asset_tag: assetTag, name: assetName, category: assetCat || undefined });
    setAssets(await listAssets()); setAssetTag(''); setAssetName(''); setAssetCat('');
  };
  const onAssign = async (id: string)=>{
    await assignAsset(id, assignTo || undefined); setAssets(await listAssets()); setAssignTo('');
  };
  const onAddFeedback = async ()=>{
    if (!vfSubject || !vfMessage) return; await createVendorFeedback({ subject: vfSubject, message: vfMessage, rating: parseInt(vfRating||'0',10) || undefined });
    setFeedback(await listVendorFeedback()); setVfSubject(''); setVfMessage(''); setVfRating('5');
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      <h1 className="text-2xl font-bold mb-4">Wave 7 — Supportive Modules</h1>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="card">
          <h2 className="text-lg font-semibold mb-3">Employees</h2>
          <div className="flex flex-wrap gap-2 mb-2">
            <Input placeholder="Name" value={empName} onChange={(e:any)=>setEmpName(e.target.value)} />
            <Input placeholder="Email" value={empEmail} onChange={(e:any)=>setEmpEmail(e.target.value)} />
            <Input placeholder="Role" value={empRole} onChange={(e:any)=>setEmpRole(e.target.value)} />
            <Button onClick={onAddEmployee}>Add</Button>
          </div>
          <div className="max-h-56 overflow-auto">
            <Table columns={[{key:'name', header:'Name'},{key:'email', header:'Email'},{key:'role', header:'Role'},{key:'status', header:'Status'}]} data={employees} />
          </div>
        </div>
        <div className="card">
          <h2 className="text-lg font-semibold mb-3">Assets</h2>
          <div className="flex flex-wrap gap-2 mb-2">
            <Input placeholder="Asset Tag" value={assetTag} onChange={(e:any)=>setAssetTag(e.target.value)} />
            <Input placeholder="Name" value={assetName} onChange={(e:any)=>setAssetName(e.target.value)} />
            <Input placeholder="Category" value={assetCat} onChange={(e:any)=>setAssetCat(e.target.value)} />
            <Button onClick={onAddAsset}>Add</Button>
          </div>
          <div className="flex gap-2 items-center mb-2">
            <Input placeholder="Employee ID to assign" value={assignTo} onChange={(e:any)=>setAssignTo(e.target.value)} />
          </div>
          <div className="max-h-56 overflow-auto">
            <Table columns={[{key:'asset_tag', header:'Tag'},{key:'name', header:'Name'},{key:'status', header:'Status'},{key:'assigned_to', header:'Assigned To'}]} data={assets} />
          </div>
          <div className="flex flex-wrap gap-2 mt-2">
            {assets.slice(0,5).map(a=> (
              <Button key={a.id} variant="secondary" onClick={()=>onAssign(a.id)}>
                {a.asset_tag}: assign ↦
              </Button>
            ))}
          </div>
        </div>
        <div className="card">
          <h2 className="text-lg font-semibold mb-3">Vendor Feedback</h2>
          <div className="flex flex-wrap gap-2 mb-2">
            <Input placeholder="Subject" value={vfSubject} onChange={(e:any)=>setVfSubject(e.target.value)} />
            <Input placeholder="Message" value={vfMessage} onChange={(e:any)=>setVfMessage(e.target.value)} />
            <Input placeholder="Rating 1-5" value={vfRating} onChange={(e:any)=>setVfRating(e.target.value)} />
            <Button variant="secondary" onClick={onAddFeedback}>Add</Button>
          </div>
          <div className="max-h-56 overflow-auto">
            <Table columns={[{key:'subject', header:'Subject'},{key:'rating', header:'Rating'},{key:'status', header:'Status'},{key:'created_at', header:'At'}]} data={feedback} />
          </div>
        </div>
      </div>
    </div>
  );
};
