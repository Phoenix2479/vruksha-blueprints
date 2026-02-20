import { useState } from 'react';
import { businessToolsApi } from '../api/businessToolsApi';
import { formatCurrency } from '../../../../shared/config/currency';
import { Card, CardContent, CardHeader, CardTitle, Button, Input, Label } from '../../../../shared/components/ui';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Wrench, Calculator, Percent, RotateCcw, TrendingUp, Package } from 'lucide-react';

const CURRENCY = 'INR';

export default function BusinessToolsPage() {
  const [activeTab, setActiveTab] = useState('margin');

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card px-6 py-4">
        <div className="flex items-center justify-between max-w-7xl mx-auto">
          <div className="flex items-center gap-3">
            <Wrench className="h-7 w-7 text-slate-700" />
            <div><h1 className="text-xl font-bold">Business Tools</h1><p className="text-sm text-muted-foreground">Calculators & utilities</p></div>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto p-6 space-y-6">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid grid-cols-4 w-full">
            <TabsTrigger value="margin"><Percent className="h-4 w-4 mr-1" /> Margin</TabsTrigger>
            <TabsTrigger value="breakeven"><Calculator className="h-4 w-4 mr-1" /> Break-even</TabsTrigger>
            <TabsTrigger value="inventory"><Package className="h-4 w-4 mr-1" /> Inventory</TabsTrigger>
            <TabsTrigger value="roi"><TrendingUp className="h-4 w-4 mr-1" /> ROI</TabsTrigger>
          </TabsList>

          <TabsContent value="margin" className="mt-6"><MarginCalculator /></TabsContent>
          <TabsContent value="breakeven" className="mt-6"><BreakevenCalculator /></TabsContent>
          <TabsContent value="inventory" className="mt-6"><InventoryCalculator /></TabsContent>
          <TabsContent value="roi" className="mt-6"><ROICalculator /></TabsContent>
        </Tabs>
      </main>
    </div>
  );
}

function MarginCalculator() {
  const [cost, setCost] = useState('');
  const [price, setPrice] = useState('');
  const [result, setResult] = useState<ReturnType<typeof localCalculators.grossMargin> | null>(null);
  const calculate = () => { if (cost && price) setResult(localCalculators.grossMargin(parseFloat(cost), parseFloat(price))); };

  return (
    <Card>
      <CardHeader><CardTitle>Gross Margin Calculator</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2"><Label>Cost Price ({CURRENCY})</Label><Input type="number" value={cost} onChange={e => setCost(e.target.value)} placeholder="0.00" /></div>
          <div className="space-y-2"><Label>Selling Price ({CURRENCY})</Label><Input type="number" value={price} onChange={e => setPrice(e.target.value)} placeholder="0.00" /></div>
        </div>
        <Button onClick={calculate} className="w-full">Calculate</Button>
        {result && (
          <div className="grid grid-cols-3 gap-4 pt-4 border-t">
            <div className="text-center"><p className="text-sm text-muted-foreground">Gross Margin</p><p className="text-2xl font-bold text-green-600">{result.margin}%</p></div>
            <div className="text-center"><p className="text-sm text-muted-foreground">Profit</p><p className="text-2xl font-bold">{formatCurrency(parseFloat(result.profit), CURRENCY)}</p></div>
            <div className="text-center"><p className="text-sm text-muted-foreground">Markup</p><p className="text-2xl font-bold text-blue-600">{result.markup}%</p></div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function BreakevenCalculator() {
  const [fixedCosts, setFixedCosts] = useState('');
  const [price, setPrice] = useState('');
  const [variableCost, setVariableCost] = useState('');
  const [result, setResult] = useState<ReturnType<typeof localCalculators.breakeven> | null>(null);
  const calculate = () => { if (fixedCosts && price && variableCost) setResult(localCalculators.breakeven(parseFloat(fixedCosts), parseFloat(price), parseFloat(variableCost))); };

  return (
    <Card>
      <CardHeader><CardTitle>Break-even Calculator</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-3 gap-4">
          <div className="space-y-2"><Label>Fixed Costs ({CURRENCY})</Label><Input type="number" value={fixedCosts} onChange={e => setFixedCosts(e.target.value)} placeholder="0.00" /></div>
          <div className="space-y-2"><Label>Unit Price ({CURRENCY})</Label><Input type="number" value={price} onChange={e => setPrice(e.target.value)} placeholder="0.00" /></div>
          <div className="space-y-2"><Label>Variable Cost ({CURRENCY})</Label><Input type="number" value={variableCost} onChange={e => setVariableCost(e.target.value)} placeholder="0.00" /></div>
        </div>
        <Button onClick={calculate} className="w-full">Calculate</Button>
        {result && (
          <div className="grid grid-cols-2 gap-4 pt-4 border-t">
            <div className="text-center"><p className="text-sm text-muted-foreground">Break-even Units</p><p className="text-2xl font-bold">{result.units.toLocaleString()}</p></div>
            <div className="text-center"><p className="text-sm text-muted-foreground">Break-even Revenue</p><p className="text-2xl font-bold text-green-600">{formatCurrency(parseFloat(result.revenue), CURRENCY)}</p></div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function InventoryCalculator() {
  const [cogs, setCogs] = useState('');
  const [avgInventory, setAvgInventory] = useState('');
  const [result, setResult] = useState<ReturnType<typeof localCalculators.inventoryTurnover> | null>(null);
  const calculate = () => { if (cogs && avgInventory) setResult(localCalculators.inventoryTurnover(parseFloat(cogs), parseFloat(avgInventory))); };

  return (
    <Card>
      <CardHeader><CardTitle>Inventory Turnover Calculator</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2"><Label>Cost of Goods Sold ({CURRENCY})</Label><Input type="number" value={cogs} onChange={e => setCogs(e.target.value)} placeholder="0.00" /></div>
          <div className="space-y-2"><Label>Average Inventory ({CURRENCY})</Label><Input type="number" value={avgInventory} onChange={e => setAvgInventory(e.target.value)} placeholder="0.00" /></div>
        </div>
        <Button onClick={calculate} className="w-full">Calculate</Button>
        {result && (
          <div className="grid grid-cols-2 gap-4 pt-4 border-t">
            <div className="text-center"><p className="text-sm text-muted-foreground">Turnover Ratio</p><p className="text-2xl font-bold text-blue-600">{result.turnover}x</p></div>
            <div className="text-center"><p className="text-sm text-muted-foreground">Days to Sell</p><p className="text-2xl font-bold">{result.daysToSell} days</p></div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ROICalculator() {
  const [investment, setInvestment] = useState('');
  const [returns, setReturns] = useState('');
  const [result, setResult] = useState<ReturnType<typeof localCalculators.roi> | null>(null);
  const calculate = () => { if (investment && returns) setResult(localCalculators.roi(parseFloat(investment), parseFloat(returns))); };

  return (
    <Card>
      <CardHeader><CardTitle>ROI Calculator</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2"><Label>Investment ({CURRENCY})</Label><Input type="number" value={investment} onChange={e => setInvestment(e.target.value)} placeholder="0.00" /></div>
          <div className="space-y-2"><Label>Total Returns ({CURRENCY})</Label><Input type="number" value={returns} onChange={e => setReturns(e.target.value)} placeholder="0.00" /></div>
        </div>
        <Button onClick={calculate} className="w-full">Calculate</Button>
        {result && (
          <div className="grid grid-cols-2 gap-4 pt-4 border-t">
            <div className="text-center"><p className="text-sm text-muted-foreground">ROI</p><p className={`text-2xl font-bold ${parseFloat(result.roi) >= 0 ? 'text-green-600' : 'text-red-600'}`}>{result.roi}%</p></div>
            <div className="text-center"><p className="text-sm text-muted-foreground">Net Gain</p><p className={`text-2xl font-bold ${parseFloat(result.netGain) >= 0 ? 'text-green-600' : 'text-red-600'}`}>{formatCurrency(parseFloat(result.netGain), CURRENCY)}</p></div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
