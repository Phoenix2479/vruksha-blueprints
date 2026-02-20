import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { returnsApi, type Return, type ReturnStats } from "../api/returnsApi";
import { Card, CardContent, CardHeader, CardTitle, Button, Input, Table, TableBody, TableCell, TableHead, TableHeader, TableRow, Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, Label } from "../../../../shared/components/ui";
import { StatsCard, StatusBadge, DialogButtons } from "../../../../shared/components/blocks";
import { RotateCcw, Search, Plus, Package, DollarSign, CheckCircle, Loader2, Eye, Clock } from "lucide-react";

export default function ReturnsManagementPage() {
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState("");
  const [showNewReturn, setShowNewReturn] = useState(false);
  const [selectedReturn, setSelectedReturn] = useState<Return | null>(null);

  const { data: stats } = useQuery<ReturnStats>({
    queryKey: ["returns-stats"],
    queryFn: returnsApi.getStats,
  });

  const { data: returns = [], isLoading } = useQuery({
    queryKey: ["returns"],
    queryFn: () => returnsApi.list(),
  });

  const updateStatusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: Return["status"] }) => returnsApi.updateStatus(id, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["returns"] });
      queryClient.invalidateQueries({ queryKey: ["returns-stats"] });
      setSelectedReturn(null);
    },
  });

  const pendingCount = stats?.pendingReturns || 0;
  const totalRefunds = stats?.refundedValue || 0;
  const approvalRate = (stats?.totalReturns || 0) > 0 
    ? ((stats?.completedReturns || 0) + (stats?.approvedReturns || 0)) / (stats?.totalReturns || 1) * 100 
    : 0;

  const filteredReturns = returns.filter((r) =>
    r.returnNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
    r.reason?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    r.id.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const getStatusStyle = (status: string) => {
    switch (status) {
      case "completed": return "active";
      case "approved": return "info";
      case "pending": return "warning";
      case "rejected": return "error";
      default: return "neutral";
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card px-6 py-4">
        <div className="flex items-center justify-between max-w-7xl mx-auto">
          <div className="flex items-center gap-3">
            <RotateCcw className="h-7 w-7 text-orange-600" />
            <div>
              <h1 className="text-xl font-bold">Returns Management</h1>
              <p className="text-sm text-muted-foreground">Process and track product returns</p>
            </div>
          </div>
          <Button onClick={() => setShowNewReturn(true)}>
            <Plus className="h-4 w-4 mr-2" />
            New Return
          </Button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-6 space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <StatsCard title="Total Returns" value={stats?.totalReturns || 0} icon={<Package className="h-5 w-5" />} iconColor="text-orange-600" iconBg="bg-orange-100" />
          <StatsCard title="Pending Review" value={pendingCount} icon={<Clock className="h-5 w-5" />} iconColor="text-yellow-600" iconBg="bg-yellow-100" />
          <StatsCard title="Total Refunds" value={`$${totalRefunds.toFixed(2)}`} icon={<DollarSign className="h-5 w-5" />} iconColor="text-red-600" iconBg="bg-red-100" />
          <StatsCard title="Approval Rate" value={`${approvalRate.toFixed(0)}%`} icon={<CheckCircle className="h-5 w-5" />} iconColor="text-green-600" iconBg="bg-green-100" />
        </div>

        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg">Return Requests</CardTitle>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Search returns..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-10 w-64" />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Return #</TableHead>
                    <TableHead>Order #</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Product</TableHead>
                    <TableHead>Reason</TableHead>
                    <TableHead className="text-right">Refund</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredReturns.length === 0 ? (
                    <TableRow><TableCell colSpan={8} className="h-32 text-center text-muted-foreground">No returns found</TableCell></TableRow>
                  ) : filteredReturns.map((ret) => (
                    <TableRow key={ret.id}>
                      <TableCell className="font-medium">{ret.returnNumber}</TableCell>
                      <TableCell className="text-muted-foreground">{ret.transactionId || '-'}</TableCell>
                      <TableCell>{ret.customerId || 'Walk-in'}</TableCell>
                      <TableCell>{ret.items.length} item(s)</TableCell>
                      <TableCell className="text-muted-foreground">{ret.reason || '-'}</TableCell>
                      <TableCell className="text-right font-semibold">${ret.total.toFixed(2)}</TableCell>
                      <TableCell><StatusBadge status={getStatusStyle(ret.status)} label={ret.status.charAt(0).toUpperCase() + ret.status.slice(1)} size="sm" /></TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setSelectedReturn(ret)}><Eye className="h-4 w-4" /></Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </main>

      <Dialog open={showNewReturn} onOpenChange={setShowNewReturn}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>New Return Request</DialogTitle>
            <DialogDescription>Create a new product return</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2"><Label>Order Number</Label><Input placeholder="ORD-XXXX" /></div>
            <div className="space-y-2"><Label>Return Reason</Label><Input placeholder="Reason for return" /></div>
          </div>
          <DialogButtons onCancel={() => setShowNewReturn(false)} onConfirm={() => setShowNewReturn(false)} confirmText="Create Return" />
        </DialogContent>
      </Dialog>

      <Dialog open={!!selectedReturn} onOpenChange={() => setSelectedReturn(null)}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Return Details - {selectedReturn?.returnNumber}</DialogTitle>
          </DialogHeader>
          {selectedReturn && (
            <div className="space-y-3 py-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="p-2 bg-muted rounded"><p className="text-xs text-muted-foreground">Items</p><p className="font-medium">{selectedReturn.items.length} item(s)</p></div>
                <div className="p-2 bg-muted rounded"><p className="text-xs text-muted-foreground">Status</p><p className="font-medium capitalize">{selectedReturn.status}</p></div>
                <div className="p-2 bg-muted rounded"><p className="text-xs text-muted-foreground">Reason</p><p className="font-medium">{selectedReturn.reason || 'N/A'}</p></div>
                <div className="p-2 bg-muted rounded"><p className="text-xs text-muted-foreground">Refund</p><p className="font-medium">${selectedReturn.total.toFixed(2)}</p></div>
              </div>
              {selectedReturn.items.length > 0 && (
                <div className="p-2 bg-muted rounded">
                  <p className="text-xs text-muted-foreground mb-2">Items</p>
                  {selectedReturn.items.map((item, i) => (
                    <p key={i} className="text-sm">{item.sku} x {item.quantity} @ ${item.unitPrice}</p>
                  ))}
                </div>
              )}
              {selectedReturn.status === "pending" && (
                <div className="flex gap-2 pt-2">
                  <Button className="flex-1" variant="outline" onClick={() => updateStatusMutation.mutate({ id: selectedReturn.id, status: 'rejected' })} disabled={updateStatusMutation.isPending}>Reject</Button>
                  <Button className="flex-1" onClick={() => updateStatusMutation.mutate({ id: selectedReturn.id, status: 'approved' })} disabled={updateStatusMutation.isPending}>Approve</Button>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
