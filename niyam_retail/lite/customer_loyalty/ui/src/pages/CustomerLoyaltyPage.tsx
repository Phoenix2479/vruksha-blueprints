import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Card, CardContent, CardHeader, CardTitle, Button, Input, Table, TableBody, TableCell, TableHead, TableHeader, TableRow, Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui";
import { StatsCard, StatusBadge, DialogButtons } from "@/components/blocks";
import { Users, Search, Plus, Gift, Star, TrendingUp, Award, Loader2, Edit2 } from "lucide-react";

interface LoyaltyCustomer {
  id: string;
  name: string;
  email: string;
  phone: string;
  points: number;
  tier: "bronze" | "silver" | "gold" | "platinum";
  total_spent: number;
  visits: number;
  joined_at: string;
}

const mockCustomers: LoyaltyCustomer[] = [
  { id: "1", name: "John Smith", email: "john@example.com", phone: "+1234567890", points: 2500, tier: "gold", total_spent: 1250, visits: 45, joined_at: "2024-01-15" },
  { id: "2", name: "Sarah Johnson", email: "sarah@example.com", phone: "+1234567891", points: 850, tier: "silver", total_spent: 425, visits: 18, joined_at: "2024-03-20" },
  { id: "3", name: "Mike Davis", email: "mike@example.com", phone: "+1234567892", points: 5200, tier: "platinum", total_spent: 2600, visits: 78, joined_at: "2023-06-10" },
  { id: "4", name: "Emily Brown", email: "emily@example.com", phone: "+1234567893", points: 320, tier: "bronze", total_spent: 160, visits: 8, joined_at: "2024-08-01" },
];

const tierColors = { bronze: "warning", silver: "info", gold: "active", platinum: "success" } as const;

export default function CustomerLoyaltyPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [showAddModal, setShowAddModal] = useState(false);

  const { data: customers = mockCustomers, isLoading } = useQuery({
    queryKey: ["loyalty-customers"],
    queryFn: async () => mockCustomers,
  });

  const totalMembers = customers.length;
  const totalPoints = customers.reduce((sum, c) => sum + c.points, 0);
  const avgSpent = customers.length > 0 ? customers.reduce((sum, c) => sum + c.total_spent, 0) / customers.length : 0;

  const filteredCustomers = customers.filter((c) =>
    c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.email.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card px-6 py-4">
        <div className="flex items-center justify-between max-w-7xl mx-auto">
          <div className="flex items-center gap-3">
            <Gift className="h-7 w-7 text-pink-600" />
            <div>
              <h1 className="text-xl font-bold">Customer Loyalty</h1>
              <p className="text-sm text-muted-foreground">Manage loyalty program members</p>
            </div>
          </div>
          <Button onClick={() => setShowAddModal(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Add Member
          </Button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-6 space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <StatsCard title="Total Members" value={totalMembers} icon={<Users className="h-5 w-5" />} iconColor="text-pink-600" iconBg="bg-pink-100" />
          <StatsCard title="Total Points" value={totalPoints.toLocaleString()} icon={<Star className="h-5 w-5" />} iconColor="text-yellow-600" iconBg="bg-yellow-100" />
          <StatsCard title="Avg. Spend" value={`$${avgSpent.toFixed(2)}`} icon={<TrendingUp className="h-5 w-5" />} iconColor="text-green-600" iconBg="bg-green-100" />
          <StatsCard title="Platinum Members" value={customers.filter((c) => c.tier === "platinum").length} icon={<Award className="h-5 w-5" />} iconColor="text-purple-600" iconBg="bg-purple-100" />
        </div>

        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg">Members</CardTitle>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Search members..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-10 w-64" />
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
                    <TableHead>Member</TableHead>
                    <TableHead>Contact</TableHead>
                    <TableHead className="text-right">Points</TableHead>
                    <TableHead>Tier</TableHead>
                    <TableHead className="text-right">Total Spent</TableHead>
                    <TableHead className="text-right">Visits</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredCustomers.map((customer) => (
                    <TableRow key={customer.id}>
                      <TableCell className="font-medium">{customer.name}</TableCell>
                      <TableCell>
                        <div className="text-sm">{customer.email}</div>
                        <div className="text-xs text-muted-foreground">{customer.phone}</div>
                      </TableCell>
                      <TableCell className="text-right font-semibold">{customer.points.toLocaleString()}</TableCell>
                      <TableCell>
                        <StatusBadge status={tierColors[customer.tier]} label={customer.tier.charAt(0).toUpperCase() + customer.tier.slice(1)} size="sm" />
                      </TableCell>
                      <TableCell className="text-right">${customer.total_spent.toFixed(2)}</TableCell>
                      <TableCell className="text-right">{customer.visits}</TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="icon" className="h-8 w-8"><Edit2 className="h-4 w-4" /></Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </main>

      <Dialog open={showAddModal} onOpenChange={setShowAddModal}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Add Member</DialogTitle>
            <DialogDescription>Add a new loyalty program member</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <Input placeholder="Full Name" />
            <Input placeholder="Email" type="email" />
            <Input placeholder="Phone" />
          </div>
          <DialogButtons onCancel={() => setShowAddModal(false)} onConfirm={() => setShowAddModal(false)} confirmText="Add Member" />
        </DialogContent>
      </Dialog>
    </div>
  );
}
