import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Button,
  Input,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  Label,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../../../shared/components/ui";
import { StatsCard, StatusBadge, DialogButtons } from "../../../../shared/components/blocks";
import {
  Store,
  MapPin,
  Users,
  DollarSign,
  Clock,
  Plus,
  Edit2,
  Settings,
  Loader2,
  Phone,
  Mail,
  UserPlus,
  Play,
  Square,
  FileText,
  AlertCircle,
} from "lucide-react";
import { storeApi, type Store as StoreType, type Shift } from "../api/storeApi";

export default function StoreManagementPage() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("stores");
  const [showAddStore, setShowAddStore] = useState(false);
  const [showAddEmployee, setShowAddEmployee] = useState(false);
  const [showStartShift, setShowStartShift] = useState(false);
  const [showEndShift, setShowEndShift] = useState<Shift | null>(null);
  const [showEODReport, setShowEODReport] = useState(false);
  const [selectedStore, setSelectedStore] = useState<StoreType | null>(null);
  const [eodReport, setEodReport] = useState<any>(null);

  // Form states
  const [newStore, setNewStore] = useState({ name: "", code: "", address: "", city: "", state: "", phone: "", email: "", opening_hours: "" });
  const [newEmployee, setNewEmployee] = useState({ name: "", email: "", phone: "", role: "cashier", store_id: "", employee_code: "" });
  const [newShift, setNewShift] = useState({ employee_id: "", register_id: "", store_id: "", opening_cash: 0 });
  const [closingCash, setClosingCash] = useState(0);

  // Queries
  const { data: stats } = useQuery({
    queryKey: ["store-stats"],
    queryFn: storeApi.getStats,
  });

  const { data: stores = [], isLoading: storesLoading } = useQuery({
    queryKey: ["stores"],
    queryFn: storeApi.getStores,
  });

  const { data: employees = [], isLoading: employeesLoading } = useQuery({
    queryKey: ["employees"],
    queryFn: () => storeApi.getEmployees(),
  });

  const { data: activeShifts = [], isLoading: shiftsLoading } = useQuery({
    queryKey: ["active-shifts"],
    queryFn: () => storeApi.getActiveShifts(),
  });

  // Mutations
  const createStoreMutation = useMutation({
    mutationFn: storeApi.createStore,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["stores"] });
      queryClient.invalidateQueries({ queryKey: ["store-stats"] });
      setShowAddStore(false);
      setNewStore({ name: "", code: "", address: "", city: "", state: "", phone: "", email: "", opening_hours: "" });
    },
  });

  const createEmployeeMutation = useMutation({
    mutationFn: storeApi.createEmployee,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["employees"] });
      queryClient.invalidateQueries({ queryKey: ["store-stats"] });
      setShowAddEmployee(false);
      setNewEmployee({ name: "", email: "", phone: "", role: "cashier", store_id: "", employee_code: "" });
    },
  });

  const startShiftMutation = useMutation({
    mutationFn: storeApi.startShift,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["active-shifts"] });
      setShowStartShift(false);
      setNewShift({ employee_id: "", register_id: "", store_id: "", opening_cash: 0 });
    },
  });

  const endShiftMutation = useMutation({
    mutationFn: ({ shiftId, closingCash }: { shiftId: string; closingCash: number }) => 
      storeApi.endShift(shiftId, closingCash),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["active-shifts"] });
      setShowEndShift(null);
      setClosingCash(0);
    },
  });

  const generateReportMutation = useMutation({
    mutationFn: () => storeApi.generateEODReport(),
    onSuccess: (data) => {
      setEodReport(data);
    },
  });

  const getStatusStyle = (status: string) => {
    switch (status) {
      case "active": case "open": return "active";
      case "closed": return "error";
      case "maintenance": return "warning";
      default: return "neutral";
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card px-6 py-4">
        <div className="flex items-center justify-between max-w-7xl mx-auto">
          <div className="flex items-center gap-3">
            <Store className="h-7 w-7 text-teal-600" />
            <div>
              <h1 className="text-xl font-bold">Store Management</h1>
              <p className="text-sm text-muted-foreground">Manage stores, employees, shifts & operations</p>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-6 space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <StatsCard title="Total Stores" value={stats?.total_stores || stores.length} icon={Store} iconColor="text-teal-600" iconBg="bg-teal-100" />
          <StatsCard title="Open Stores" value={stats?.open_stores || 0} icon={Clock} iconColor="text-green-600" iconBg="bg-green-100" />
          <StatsCard title="Total Staff" value={stats?.total_employees || employees.length} icon={Users} iconColor="text-blue-600" iconBg="bg-blue-100" />
          <StatsCard title="Today's Revenue" value={`$${(stats?.daily_revenue || 0).toLocaleString()}`} icon={DollarSign} iconColor="text-emerald-600" iconBg="bg-emerald-100" />
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="stores">Stores</TabsTrigger>
            <TabsTrigger value="employees">Employees</TabsTrigger>
            <TabsTrigger value="shifts">Active Shifts</TabsTrigger>
            <TabsTrigger value="reports">Reports</TabsTrigger>
          </TabsList>

          <TabsContent value="stores">
            <Card>
              <CardHeader className="pb-3 flex flex-row items-center justify-between">
                <CardTitle className="text-lg">Store Locations</CardTitle>
                <Button onClick={() => setShowAddStore(true)} size="sm">
                  <Plus className="h-4 w-4 mr-2" />Add Store
                </Button>
              </CardHeader>
              <CardContent>
                {storesLoading ? (
                  <div className="flex items-center justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>
                ) : stores.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">No stores found. Add your first store.</div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Store</TableHead>
                        <TableHead>Location</TableHead>
                        <TableHead className="text-right">Staff</TableHead>
                        <TableHead className="text-right">Today's Revenue</TableHead>
                        <TableHead>Hours</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {stores.map((store) => (
                        <TableRow key={store.id}>
                          <TableCell>
                            <div>
                              <p className="font-medium">{store.name}</p>
                              <p className="text-xs text-muted-foreground">{store.code}</p>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1">
                              <MapPin className="h-3 w-3 text-muted-foreground" />
                              <span className="text-sm">{store.city}, {store.state}</span>
                            </div>
                          </TableCell>
                          <TableCell className="text-right">{store.employee_count || 0}</TableCell>
                          <TableCell className="text-right font-semibold">${(store.daily_revenue || 0).toLocaleString()}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">{store.opening_hours || "N/A"}</TableCell>
                          <TableCell><StatusBadge status={getStatusStyle(store.status)} label={store.status} size="sm" /></TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1">
                              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setSelectedStore(store)}><Edit2 className="h-4 w-4" /></Button>
                              <Button variant="ghost" size="icon" className="h-8 w-8"><Settings className="h-4 w-4" /></Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="employees">
            <Card>
              <CardHeader className="pb-3 flex flex-row items-center justify-between">
                <CardTitle className="text-lg">Employees</CardTitle>
                <Button onClick={() => setShowAddEmployee(true)} size="sm">
                  <UserPlus className="h-4 w-4 mr-2" />Add Employee
                </Button>
              </CardHeader>
              <CardContent>
                {employeesLoading ? (
                  <div className="flex items-center justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>
                ) : employees.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">No employees found.</div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Employee</TableHead>
                        <TableHead>Code</TableHead>
                        <TableHead>Role</TableHead>
                        <TableHead>Store</TableHead>
                        <TableHead>Contact</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {employees.map((emp) => (
                        <TableRow key={emp.id}>
                          <TableCell className="font-medium">{emp.name}</TableCell>
                          <TableCell className="text-muted-foreground">{emp.employee_code}</TableCell>
                          <TableCell className="capitalize">{emp.role}</TableCell>
                          <TableCell>{emp.store_name || "Unassigned"}</TableCell>
                          <TableCell>
                            <div className="text-sm">
                              <div className="flex items-center gap-1"><Mail className="h-3 w-3" />{emp.email}</div>
                              <div className="flex items-center gap-1"><Phone className="h-3 w-3" />{emp.phone}</div>
                            </div>
                          </TableCell>
                          <TableCell><StatusBadge status={emp.status === "active" ? "active" : "neutral"} label={emp.status} size="sm" /></TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="shifts">
            <Card>
              <CardHeader className="pb-3 flex flex-row items-center justify-between">
                <CardTitle className="text-lg">Active Shifts</CardTitle>
                <Button onClick={() => setShowStartShift(true)} size="sm">
                  <Play className="h-4 w-4 mr-2" />Start Shift
                </Button>
              </CardHeader>
              <CardContent>
                {shiftsLoading ? (
                  <div className="flex items-center justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>
                ) : activeShifts.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">No active shifts.</div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Employee</TableHead>
                        <TableHead>Store</TableHead>
                        <TableHead>Started At</TableHead>
                        <TableHead className="text-right">Opening Cash</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {activeShifts.map((shift) => (
                        <TableRow key={shift.id}>
                          <TableCell className="font-medium">{shift.employee_name}</TableCell>
                          <TableCell>{shift.store_name}</TableCell>
                          <TableCell>{new Date(shift.started_at).toLocaleString()}</TableCell>
                          <TableCell className="text-right">${shift.opening_cash?.toLocaleString()}</TableCell>
                          <TableCell className="text-right">
                            <Button variant="outline" size="sm" onClick={() => setShowEndShift(shift)}>
                              <Square className="h-4 w-4 mr-2" />End Shift
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="reports">
            <Card>
              <CardHeader className="pb-3 flex flex-row items-center justify-between">
                <CardTitle className="text-lg">End of Day Report</CardTitle>
                <Button onClick={() => { setShowEODReport(true); generateReportMutation.mutate(); }} size="sm">
                  <FileText className="h-4 w-4 mr-2" />Generate Report
                </Button>
              </CardHeader>
              <CardContent>
                <div className="text-center py-8 text-muted-foreground">
                  <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>Generate end-of-day reports to see sales summary, cash reconciliation, and performance metrics.</p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>

      {/* Add Store Dialog */}
      <Dialog open={showAddStore} onOpenChange={setShowAddStore}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Add Store</DialogTitle>
            <DialogDescription>Add a new store location</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label>Store Name *</Label><Input value={newStore.name} onChange={(e) => setNewStore({ ...newStore, name: e.target.value })} placeholder="e.g., Downtown Main" /></div>
              <div className="space-y-2"><Label>Store Code *</Label><Input value={newStore.code} onChange={(e) => setNewStore({ ...newStore, code: e.target.value })} placeholder="e.g., DT-001" /></div>
            </div>
            <div className="space-y-2"><Label>Address</Label><Input value={newStore.address} onChange={(e) => setNewStore({ ...newStore, address: e.target.value })} placeholder="Street address" /></div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label>City</Label><Input value={newStore.city} onChange={(e) => setNewStore({ ...newStore, city: e.target.value })} placeholder="City" /></div>
              <div className="space-y-2"><Label>State</Label><Input value={newStore.state} onChange={(e) => setNewStore({ ...newStore, state: e.target.value })} placeholder="State" /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label>Phone</Label><Input value={newStore.phone} onChange={(e) => setNewStore({ ...newStore, phone: e.target.value })} placeholder="+1 (555) 000-0000" /></div>
              <div className="space-y-2"><Label>Email</Label><Input value={newStore.email} onChange={(e) => setNewStore({ ...newStore, email: e.target.value })} type="email" placeholder="store@example.com" /></div>
            </div>
            <div className="space-y-2"><Label>Opening Hours</Label><Input value={newStore.opening_hours} onChange={(e) => setNewStore({ ...newStore, opening_hours: e.target.value })} placeholder="e.g., 9:00 AM - 9:00 PM" /></div>
          </div>
          <DialogButtons 
            onCancel={() => setShowAddStore(false)} 
            onConfirm={() => createStoreMutation.mutate(newStore)} 
            confirmText={createStoreMutation.isPending ? "Adding..." : "Add Store"} 
            confirmDisabled={!newStore.name || !newStore.code || createStoreMutation.isPending}
          />
        </DialogContent>
      </Dialog>

      {/* Add Employee Dialog */}
      <Dialog open={showAddEmployee} onOpenChange={setShowAddEmployee}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Add Employee</DialogTitle>
            <DialogDescription>Add a new team member</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label>Name *</Label><Input value={newEmployee.name} onChange={(e) => setNewEmployee({ ...newEmployee, name: e.target.value })} placeholder="Full name" /></div>
              <div className="space-y-2"><Label>Employee Code</Label><Input value={newEmployee.employee_code} onChange={(e) => setNewEmployee({ ...newEmployee, employee_code: e.target.value })} placeholder="EMP-001" /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label>Email</Label><Input value={newEmployee.email} onChange={(e) => setNewEmployee({ ...newEmployee, email: e.target.value })} type="email" placeholder="email@example.com" /></div>
              <div className="space-y-2"><Label>Phone</Label><Input value={newEmployee.phone} onChange={(e) => setNewEmployee({ ...newEmployee, phone: e.target.value })} placeholder="+1 (555) 000-0000" /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Role *</Label>
                <Select value={newEmployee.role} onValueChange={(v) => setNewEmployee({ ...newEmployee, role: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cashier">Cashier</SelectItem>
                    <SelectItem value="manager">Manager</SelectItem>
                    <SelectItem value="supervisor">Supervisor</SelectItem>
                    <SelectItem value="stock_clerk">Stock Clerk</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Store</Label>
                <Select value={newEmployee.store_id} onValueChange={(v) => setNewEmployee({ ...newEmployee, store_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Select store" /></SelectTrigger>
                  <SelectContent>
                    {stores.map((s) => (
                      <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogButtons 
            onCancel={() => setShowAddEmployee(false)} 
            onConfirm={() => createEmployeeMutation.mutate(newEmployee)} 
            confirmText={createEmployeeMutation.isPending ? "Adding..." : "Add Employee"} 
            confirmDisabled={!newEmployee.name || !newEmployee.role || createEmployeeMutation.isPending}
          />
        </DialogContent>
      </Dialog>

      {/* Start Shift Dialog */}
      <Dialog open={showStartShift} onOpenChange={setShowStartShift}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Start Shift</DialogTitle>
            <DialogDescription>Begin a new shift for an employee</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Employee *</Label>
              <Select value={newShift.employee_id} onValueChange={(v) => setNewShift({ ...newShift, employee_id: v })}>
                <SelectTrigger><SelectValue placeholder="Select employee" /></SelectTrigger>
                <SelectContent>
                  {employees.filter(e => e.status === "active").map((e) => (
                    <SelectItem key={e.id} value={e.id}>{e.name} ({e.role})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Store *</Label>
              <Select value={newShift.store_id} onValueChange={(v) => setNewShift({ ...newShift, store_id: v })}>
                <SelectTrigger><SelectValue placeholder="Select store" /></SelectTrigger>
                <SelectContent>
                  {stores.filter(s => s.status === "active").map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Opening Cash ($)</Label>
              <Input type="number" value={newShift.opening_cash} onChange={(e) => setNewShift({ ...newShift, opening_cash: parseFloat(e.target.value) || 0 })} placeholder="0.00" />
            </div>
          </div>
          <DialogButtons 
            onCancel={() => setShowStartShift(false)} 
            onConfirm={() => startShiftMutation.mutate(newShift)} 
            confirmText={startShiftMutation.isPending ? "Starting..." : "Start Shift"} 
            confirmDisabled={!newShift.employee_id || !newShift.store_id || startShiftMutation.isPending}
          />
        </DialogContent>
      </Dialog>

      {/* End Shift Dialog */}
      <Dialog open={!!showEndShift} onOpenChange={() => setShowEndShift(null)}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>End Shift</DialogTitle>
            <DialogDescription>Close shift for {showEndShift?.employee_name}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="p-3 bg-muted rounded-lg">
              <div className="flex justify-between text-sm">
                <span>Opening Cash:</span>
                <span className="font-medium">${showEndShift?.opening_cash?.toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-sm mt-1">
                <span>Started:</span>
                <span>{showEndShift?.started_at && new Date(showEndShift.started_at).toLocaleString()}</span>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Closing Cash ($) *</Label>
              <Input type="number" value={closingCash} onChange={(e) => setClosingCash(parseFloat(e.target.value) || 0)} placeholder="Enter actual cash amount" />
            </div>
          </div>
          <DialogButtons 
            onCancel={() => setShowEndShift(null)} 
            onConfirm={() => showEndShift && endShiftMutation.mutate({ shiftId: showEndShift.id, closingCash })} 
            confirmText={endShiftMutation.isPending ? "Closing..." : "End Shift"} 
            confirmDisabled={endShiftMutation.isPending}
          />
        </DialogContent>
      </Dialog>

      {/* EOD Report Dialog */}
      <Dialog open={showEODReport} onOpenChange={setShowEODReport}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>End of Day Report</DialogTitle>
            <DialogDescription>{eodReport?.date || new Date().toLocaleDateString()}</DialogDescription>
          </DialogHeader>
          <div className="py-4">
            {generateReportMutation.isPending ? (
              <div className="flex items-center justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>
            ) : eodReport ? (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-4 bg-green-50 rounded-lg">
                    <p className="text-sm text-green-600">Gross Sales</p>
                    <p className="text-2xl font-bold text-green-700">${eodReport.summary?.gross_sales?.toLocaleString() || 0}</p>
                  </div>
                  <div className="p-4 bg-red-50 rounded-lg">
                    <p className="text-sm text-red-600">Returns</p>
                    <p className="text-2xl font-bold text-red-700">${eodReport.summary?.returns?.toLocaleString() || 0}</p>
                  </div>
                </div>
                <div className="p-4 bg-blue-50 rounded-lg">
                  <p className="text-sm text-blue-600">Net Sales</p>
                  <p className="text-3xl font-bold text-blue-700">${eodReport.summary?.net_sales?.toLocaleString() || 0}</p>
                </div>
                <div className="grid grid-cols-2 gap-4 text-center">
                  <div className="p-3 bg-muted rounded-lg">
                    <p className="text-xs text-muted-foreground">Transactions</p>
                    <p className="text-lg font-semibold">{eodReport.summary?.transaction_count || 0}</p>
                  </div>
                  <div className="p-3 bg-muted rounded-lg">
                    <p className="text-xs text-muted-foreground">Avg Transaction</p>
                    <p className="text-lg font-semibold">${eodReport.summary?.average_transaction?.toFixed(2) || 0}</p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <AlertCircle className="h-8 w-8 mx-auto mb-2" />
                Failed to generate report
              </div>
            )}
          </div>
          <DialogButtons onCancel={() => setShowEODReport(false)} onConfirm={() => setShowEODReport(false)} confirmText="Close" />
        </DialogContent>
      </Dialog>

      {/* Store Details Dialog */}
      <Dialog open={!!selectedStore} onOpenChange={() => setSelectedStore(null)}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>{selectedStore?.name}</DialogTitle>
            <DialogDescription>{selectedStore?.code}</DialogDescription>
          </DialogHeader>
          {selectedStore && (
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm"><MapPin className="h-4 w-4" />{selectedStore.address}, {selectedStore.city}, {selectedStore.state}</div>
                <div className="flex items-center gap-2 text-sm"><Phone className="h-4 w-4" />{selectedStore.phone || "N/A"}</div>
                <div className="flex items-center gap-2 text-sm"><Mail className="h-4 w-4" />{selectedStore.email || "N/A"}</div>
                <div className="flex items-center gap-2 text-sm"><Clock className="h-4 w-4" />{selectedStore.opening_hours || "N/A"}</div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="p-3 bg-muted rounded-lg text-center"><p className="text-xs text-muted-foreground">Status</p><p className="font-medium capitalize">{selectedStore.status}</p></div>
                <div className="p-3 bg-muted rounded-lg text-center"><p className="text-xs text-muted-foreground">Staff</p><p className="font-medium">{selectedStore.employee_count || 0}</p></div>
                <div className="p-3 bg-muted rounded-lg text-center"><p className="text-xs text-muted-foreground">Revenue</p><p className="font-medium">${(selectedStore.daily_revenue || 0).toLocaleString()}</p></div>
              </div>
            </div>
          )}
          <DialogButtons onCancel={() => setSelectedStore(null)} onConfirm={() => setSelectedStore(null)} confirmText="Close" />
        </DialogContent>
      </Dialog>
    </div>
  );
}
