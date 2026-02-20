import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { storeApi, type Store, type Employee, type Shift } from '../api/storeApi';

// Shared UI components
import {
  Button,
  Badge,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  Label,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  ScrollArea,
  Skeleton,
  Separator,
} from '@/components/ui';

import {
  Sidebar,
  PageHeader,
  StatsCard,
  StatusBadge,
  DialogButtons,
  EmptyState,
  ThemeToggle,
  type SidebarGroup,
} from '@/components/blocks';

// Icons
import {
  Store as StoreIcon,
  Users,
  Calendar,
  Clock,
  DollarSign,
  Settings,
  MapPin,
  Plus,
  Edit2,
  Phone,
  Mail,
  UserPlus,
  Play,
  Square,
  FileText,
  Loader2,
  Building2,
  CalendarDays,
  BarChart3,
  Cog,
  ChevronRight,
} from 'lucide-react';

// Tab types
type TabId = 'overview' | 'stores' | 'employees' | 'scheduling' | 'reports' | 'settings';

// Sidebar configuration
const sidebarGroups: SidebarGroup[] = [
  {
    label: 'Management',
    items: [
      { id: 'overview', label: 'Overview', icon: BarChart3 },
      { id: 'stores', label: 'Stores', icon: Building2 },
      { id: 'employees', label: 'Employees', icon: Users },
    ],
  },
  {
    label: 'Operations',
    items: [
      { id: 'scheduling', label: 'Scheduling', icon: CalendarDays },
      { id: 'reports', label: 'Reports', icon: FileText },
    ],
  },
  {
    label: 'System',
    items: [
      { id: 'settings', label: 'Settings', icon: Cog },
    ],
  },
];

export default function StoreMainPage() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<TabId>('overview');
  const [showAddStore, setShowAddStore] = useState(false);
  const [showAddEmployee, setShowAddEmployee] = useState(false);
  const [showStartShift, setShowStartShift] = useState(false);
  const [showEndShift, setShowEndShift] = useState<Shift | null>(null);
  const [showStoreDetails, setShowStoreDetails] = useState<Store | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // Form states
  const [newStore, setNewStore] = useState({
    name: '', code: '', address: '', city: '', state: '', phone: '', email: '', opening_hours: ''
  });
  const [newEmployee, setNewEmployee] = useState({
    name: '', email: '', phone: '', role: 'cashier', store_id: '', employee_code: ''
  });
  const [newShift, setNewShift] = useState({
    employee_id: '', register_id: '', store_id: '', opening_cash: 0
  });
  const [closingCash, setClosingCash] = useState(0);

  // Queries
  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ['store-stats'],
    queryFn: storeApi.getStats,
  });

  const { data: stores = [], isLoading: storesLoading } = useQuery({
    queryKey: ['stores'],
    queryFn: storeApi.getStores,
  });

  const { data: employees = [], isLoading: employeesLoading } = useQuery({
    queryKey: ['employees'],
    queryFn: () => storeApi.getEmployees(),
  });

  const { data: activeShifts = [], isLoading: shiftsLoading } = useQuery({
    queryKey: ['active-shifts'],
    queryFn: () => storeApi.getActiveShifts(),
  });

  // Mutations
  const createStoreMutation = useMutation({
    mutationFn: storeApi.createStore,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stores'] });
      queryClient.invalidateQueries({ queryKey: ['store-stats'] });
      setShowAddStore(false);
      resetStoreForm();
    },
  });

  const createEmployeeMutation = useMutation({
    mutationFn: storeApi.createEmployee,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['employees'] });
      queryClient.invalidateQueries({ queryKey: ['store-stats'] });
      setShowAddEmployee(false);
      resetEmployeeForm();
    },
  });

  const startShiftMutation = useMutation({
    mutationFn: storeApi.startShift,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['active-shifts'] });
      setShowStartShift(false);
      resetShiftForm();
    },
  });

  const endShiftMutation = useMutation({
    mutationFn: ({ shiftId, closingCash }: { shiftId: string; closingCash: number }) =>
      storeApi.endShift(shiftId, closingCash),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['active-shifts'] });
      setShowEndShift(null);
      setClosingCash(0);
    },
  });

  const resetStoreForm = () => setNewStore({
    name: '', code: '', address: '', city: '', state: '', phone: '', email: '', opening_hours: ''
  });
  const resetEmployeeForm = () => setNewEmployee({
    name: '', email: '', phone: '', role: 'cashier', store_id: '', employee_code: ''
  });
  const resetShiftForm = () => setNewShift({
    employee_id: '', register_id: '', store_id: '', opening_cash: 0
  });

  const getStatusStyle = (status: string) => {
    switch (status) {
      case 'active': case 'open': return 'active';
      case 'closed': return 'error';
      case 'maintenance': return 'warning';
      default: return 'neutral';
    }
  };

  // Render content based on active tab
  const renderContent = () => {
    switch (activeTab) {
      case 'overview':
        return <OverviewContent stats={stats} stores={stores} activeShifts={activeShifts} statsLoading={statsLoading} />;
      case 'stores':
        return (
          <StoresContent
            stores={stores}
            loading={storesLoading}
            onAddStore={() => setShowAddStore(true)}
            onViewStore={setShowStoreDetails}
            getStatusStyle={getStatusStyle}
          />
        );
      case 'employees':
        return (
          <EmployeesContent
            employees={employees}
            loading={employeesLoading}
            onAddEmployee={() => setShowAddEmployee(true)}
          />
        );
      case 'scheduling':
        return (
          <SchedulingContent
            activeShifts={activeShifts}
            loading={shiftsLoading}
            onStartShift={() => setShowStartShift(true)}
            onEndShift={setShowEndShift}
          />
        );
      case 'reports':
        return <ReportsContent />;
      case 'settings':
        return <SettingsContent />;
      default:
        return null;
    }
  };

  return (
    <div className="flex h-screen bg-background">
      {/* Sidebar */}
      <Sidebar
        groups={sidebarGroups}
        activeItem={activeTab}
        onItemClick={(id) => setActiveTab(id as TabId)}
        collapsed={sidebarCollapsed}
        onCollapsedChange={setSidebarCollapsed}
        header={
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-teal-100">
              <StoreIcon className="h-5 w-5 text-teal-600" />
            </div>
            <div>
              <h1 className="font-semibold text-sm">Store Management</h1>
              <p className="text-xs text-muted-foreground">Operations Hub</p>
            </div>
          </div>
        }
        footer={
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Active Shifts</span>
              <Badge variant="secondary">{activeShifts.length}</Badge>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Open Stores</span>
              <Badge variant="default" className="bg-green-500">{stats?.open_stores || 0}</Badge>
            </div>
          </div>
        }
      />

      {/* Main Content */}
      <main className="flex-1 flex flex-col overflow-hidden">
        <PageHeader
          title={sidebarGroups.flatMap(g => g.items).find(i => i.id === activeTab)?.label || 'Store Management'}
          description={getTabDescription(activeTab)}
          icon={sidebarGroups.flatMap(g => g.items).find(i => i.id === activeTab)?.icon}
          iconColor="text-teal-600"
          iconBg="bg-teal-100"
          sticky
          actions={<ThemeToggle />}
          primaryAction={
            activeTab === 'stores' ? { label: 'Add Store', onClick: () => setShowAddStore(true), icon: Plus } :
            activeTab === 'employees' ? { label: 'Add Employee', onClick: () => setShowAddEmployee(true), icon: UserPlus } :
            activeTab === 'scheduling' ? { label: 'Start Shift', onClick: () => setShowStartShift(true), icon: Play } :
            undefined
          }
        />

        <ScrollArea className="flex-1">
          <div className="p-6">
            {renderContent()}
          </div>
        </ScrollArea>
      </main>

      {/* Dialogs */}
      <AddStoreDialog
        open={showAddStore}
        onOpenChange={setShowAddStore}
        store={newStore}
        setStore={setNewStore}
        onSubmit={() => createStoreMutation.mutate(newStore)}
        isLoading={createStoreMutation.isPending}
      />

      <AddEmployeeDialog
        open={showAddEmployee}
        onOpenChange={setShowAddEmployee}
        employee={newEmployee}
        setEmployee={setNewEmployee}
        stores={stores}
        onSubmit={() => createEmployeeMutation.mutate(newEmployee)}
        isLoading={createEmployeeMutation.isPending}
      />

      <StartShiftDialog
        open={showStartShift}
        onOpenChange={setShowStartShift}
        shift={newShift}
        setShift={setNewShift}
        employees={employees}
        stores={stores}
        onSubmit={() => startShiftMutation.mutate(newShift)}
        isLoading={startShiftMutation.isPending}
      />

      <EndShiftDialog
        open={!!showEndShift}
        onOpenChange={() => setShowEndShift(null)}
        shift={showEndShift}
        closingCash={closingCash}
        setClosingCash={setClosingCash}
        onSubmit={() => showEndShift && endShiftMutation.mutate({ shiftId: showEndShift.id, closingCash })}
        isLoading={endShiftMutation.isPending}
      />

      <StoreDetailsDialog
        open={!!showStoreDetails}
        onOpenChange={() => setShowStoreDetails(null)}
        store={showStoreDetails}
      />
    </div>
  );
}

function getTabDescription(tab: TabId): string {
  switch (tab) {
    case 'overview': return 'Dashboard and key metrics';
    case 'stores': return 'Manage store locations';
    case 'employees': return 'Staff management';
    case 'scheduling': return 'Shifts and schedules';
    case 'reports': return 'Performance reports';
    case 'settings': return 'System configuration';
    default: return '';
  }
}

// Overview Content
function OverviewContent({ stats, stores, activeShifts, statsLoading }: {
  stats: any;
  stores: Store[];
  activeShifts: Shift[];
  statsLoading: boolean;
}) {
  if (statsLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map(i => (
          <Card key={i}>
            <CardContent className="p-6">
              <Skeleton className="h-4 w-24 mb-2" />
              <Skeleton className="h-8 w-16" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatsCard
          title="Total Stores"
          value={stats?.total_stores || stores.length}
          icon={StoreIcon}
          iconColor="text-teal-600"
          iconBg="bg-teal-100"
        />
        <StatsCard
          title="Open Stores"
          value={stats?.open_stores || 0}
          icon={Clock}
          iconColor="text-green-600"
          iconBg="bg-green-100"
        />
        <StatsCard
          title="Total Staff"
          value={stats?.total_employees || 0}
          icon={Users}
          iconColor="text-blue-600"
          iconBg="bg-blue-100"
        />
        <StatsCard
          title="Today's Revenue"
          value={`$${(stats?.daily_revenue || 0).toLocaleString()}`}
          icon={DollarSign}
          iconColor="text-emerald-600"
          iconBg="bg-emerald-100"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Play className="h-5 w-5" />
              Active Shifts
            </CardTitle>
          </CardHeader>
          <CardContent>
            {activeShifts.length === 0 ? (
              <p className="text-center text-muted-foreground py-4">No active shifts</p>
            ) : (
              <div className="space-y-3">
                {activeShifts.slice(0, 5).map((shift) => (
                  <div key={shift.id} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                    <div>
                      <p className="font-medium">{shift.employee_name}</p>
                      <p className="text-sm text-muted-foreground">{shift.store_name}</p>
                    </div>
                    <Badge variant="default" className="bg-green-500">Active</Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Building2 className="h-5 w-5" />
              Store Status
            </CardTitle>
          </CardHeader>
          <CardContent>
            {stores.length === 0 ? (
              <p className="text-center text-muted-foreground py-4">No stores configured</p>
            ) : (
              <div className="space-y-3">
                {stores.slice(0, 5).map((store) => (
                  <div key={store.id} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                    <div>
                      <p className="font-medium">{store.name}</p>
                      <p className="text-sm text-muted-foreground">{store.city}, {store.state}</p>
                    </div>
                    <StatusBadge
                      status={store.status === 'active' ? 'active' : 'neutral'}
                      label={store.status}
                      size="sm"
                    />
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// Stores Content
function StoresContent({ stores, loading, onAddStore, onViewStore, getStatusStyle }: {
  stores: Store[];
  loading: boolean;
  onAddStore: () => void;
  onViewStore: (store: Store) => void;
  getStatusStyle: (status: string) => 'active' | 'error' | 'warning' | 'neutral';
}) {
  if (loading) {
    return (
      <Card>
        <CardContent className="py-8">
          <div className="flex items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (stores.length === 0) {
    return (
      <EmptyState
        icon={Building2}
        title="No stores yet"
        description="Add your first store location to get started"
        action={{ label: 'Add Store', onClick: onAddStore }}
      />
    );
  }

  return (
    <Card>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Store</TableHead>
              <TableHead>Location</TableHead>
              <TableHead className="text-right">Staff</TableHead>
              <TableHead className="text-right">Revenue</TableHead>
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
                <TableCell className="text-sm text-muted-foreground">{store.opening_hours || 'N/A'}</TableCell>
                <TableCell>
                  <StatusBadge status={getStatusStyle(store.status)} label={store.status} size="sm" />
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-1">
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onViewStore(store)}>
                      <Edit2 className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8">
                      <Settings className="h-4 w-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

// Employees Content
function EmployeesContent({ employees, loading, onAddEmployee }: {
  employees: Employee[];
  loading: boolean;
  onAddEmployee: () => void;
}) {
  if (loading) {
    return (
      <Card>
        <CardContent className="py-8">
          <div className="flex items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (employees.length === 0) {
    return (
      <EmptyState
        icon={Users}
        title="No employees yet"
        description="Add your first team member to get started"
        action={{ label: 'Add Employee', onClick: onAddEmployee }}
      />
    );
  }

  return (
    <Card>
      <CardContent className="p-0">
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
                <TableCell>{emp.store_name || 'Unassigned'}</TableCell>
                <TableCell>
                  <div className="text-sm space-y-1">
                    <div className="flex items-center gap-1"><Mail className="h-3 w-3" />{emp.email}</div>
                    <div className="flex items-center gap-1"><Phone className="h-3 w-3" />{emp.phone}</div>
                  </div>
                </TableCell>
                <TableCell>
                  <StatusBadge status={emp.status === 'active' ? 'active' : 'neutral'} label={emp.status} size="sm" />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

// Scheduling Content
function SchedulingContent({ activeShifts, loading, onStartShift, onEndShift }: {
  activeShifts: Shift[];
  loading: boolean;
  onStartShift: () => void;
  onEndShift: (shift: Shift) => void;
}) {
  if (loading) {
    return (
      <Card>
        <CardContent className="py-8">
          <div className="flex items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (activeShifts.length === 0) {
    return (
      <EmptyState
        icon={Calendar}
        title="No active shifts"
        description="Start a shift for an employee"
        action={{ label: 'Start Shift', onClick: onStartShift }}
      />
    );
  }

  return (
    <Card>
      <CardContent className="p-0">
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
                  <Button variant="outline" size="sm" onClick={() => onEndShift(shift)}>
                    <Square className="h-4 w-4 mr-2" />End Shift
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

// Reports Content
function ReportsContent() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Available Reports</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[
            'End of Day Summary',
            'Employee Performance',
            'Store Comparison',
            'Revenue Analysis',
            'Attendance Report',
            'Cash Reconciliation'
          ].map((report) => (
            <div key={report} className="p-4 border rounded-lg hover:bg-muted/50 cursor-pointer transition-colors">
              <div className="flex items-center justify-between">
                <span className="font-medium">{report}</span>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// Settings Content
function SettingsContent() {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Store Settings</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">Configure global store settings and preferences.</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Register Configuration</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">Manage POS registers and terminals.</p>
        </CardContent>
      </Card>
    </div>
  );
}

// Dialog Components
interface NewStore {
  name: string;
  code: string;
  address: string;
  city: string;
  state: string;
  phone: string;
  email: string;
  opening_hours: string;
}

function AddStoreDialog({ open, onOpenChange, store, setStore, onSubmit, isLoading }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  store: NewStore;
  setStore: (store: NewStore) => void;
  onSubmit: () => void;
  isLoading: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Add Store</DialogTitle>
          <DialogDescription>Add a new store location</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Store Name *</Label>
              <Input
                value={store.name}
                onChange={(e) => setStore({ ...store, name: e.target.value })}
                placeholder="e.g., Downtown Main"
              />
            </div>
            <div className="space-y-2">
              <Label>Store Code *</Label>
              <Input
                value={store.code}
                onChange={(e) => setStore({ ...store, code: e.target.value })}
                placeholder="e.g., DT-001"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Address</Label>
            <Input
              value={store.address}
              onChange={(e) => setStore({ ...store, address: e.target.value })}
              placeholder="Street address"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>City</Label>
              <Input
                value={store.city}
                onChange={(e) => setStore({ ...store, city: e.target.value })}
                placeholder="City"
              />
            </div>
            <div className="space-y-2">
              <Label>State</Label>
              <Input
                value={store.state}
                onChange={(e) => setStore({ ...store, state: e.target.value })}
                placeholder="State"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Phone</Label>
              <Input
                value={store.phone}
                onChange={(e) => setStore({ ...store, phone: e.target.value })}
                placeholder="+1 (555) 000-0000"
              />
            </div>
            <div className="space-y-2">
              <Label>Email</Label>
              <Input
                value={store.email}
                onChange={(e) => setStore({ ...store, email: e.target.value })}
                type="email"
                placeholder="store@example.com"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Opening Hours</Label>
            <Input
              value={store.opening_hours}
              onChange={(e) => setStore({ ...store, opening_hours: e.target.value })}
              placeholder="e.g., 9:00 AM - 9:00 PM"
            />
          </div>
        </div>
        <DialogButtons
          onCancel={() => onOpenChange(false)}
          onConfirm={onSubmit}
          confirmText={isLoading ? 'Adding...' : 'Add Store'}
          confirmDisabled={!store.name || !store.code || isLoading}
        />
      </DialogContent>
    </Dialog>
  );
}

function AddEmployeeDialog({ open, onOpenChange, employee, setEmployee, stores, onSubmit, isLoading }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  employee: any;
  setEmployee: (emp: any) => void;
  stores: Store[];
  onSubmit: () => void;
  isLoading: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Add Employee</DialogTitle>
          <DialogDescription>Add a new team member</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Name *</Label>
              <Input
                value={employee.name}
                onChange={(e) => setEmployee({ ...employee, name: e.target.value })}
                placeholder="Full name"
              />
            </div>
            <div className="space-y-2">
              <Label>Employee Code</Label>
              <Input
                value={employee.employee_code}
                onChange={(e) => setEmployee({ ...employee, employee_code: e.target.value })}
                placeholder="EMP-001"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Email</Label>
              <Input
                value={employee.email}
                onChange={(e) => setEmployee({ ...employee, email: e.target.value })}
                type="email"
                placeholder="email@example.com"
              />
            </div>
            <div className="space-y-2">
              <Label>Phone</Label>
              <Input
                value={employee.phone}
                onChange={(e) => setEmployee({ ...employee, phone: e.target.value })}
                placeholder="+1 (555) 000-0000"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Role *</Label>
              <Select value={employee.role} onValueChange={(v) => setEmployee({ ...employee, role: v })}>
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
              <Select value={employee.store_id} onValueChange={(v) => setEmployee({ ...employee, store_id: v })}>
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
          onCancel={() => onOpenChange(false)}
          onConfirm={onSubmit}
          confirmText={isLoading ? 'Adding...' : 'Add Employee'}
          confirmDisabled={!employee.name || !employee.role || isLoading}
        />
      </DialogContent>
    </Dialog>
  );
}

function StartShiftDialog({ open, onOpenChange, shift, setShift, employees, stores, onSubmit, isLoading }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  shift: any;
  setShift: (s: any) => void;
  employees: Employee[];
  stores: Store[];
  onSubmit: () => void;
  isLoading: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle>Start Shift</DialogTitle>
          <DialogDescription>Begin a new shift for an employee</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>Employee *</Label>
            <Select value={shift.employee_id} onValueChange={(v) => setShift({ ...shift, employee_id: v })}>
              <SelectTrigger><SelectValue placeholder="Select employee" /></SelectTrigger>
              <SelectContent>
                {employees.filter(e => e.status === 'active').map((e) => (
                  <SelectItem key={e.id} value={e.id}>{e.name} ({e.role})</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Store *</Label>
            <Select value={shift.store_id} onValueChange={(v) => setShift({ ...shift, store_id: v })}>
              <SelectTrigger><SelectValue placeholder="Select store" /></SelectTrigger>
              <SelectContent>
                {stores.filter(s => s.status === 'active').map((s) => (
                  <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Opening Cash ($)</Label>
            <Input
              type="number"
              value={shift.opening_cash}
              onChange={(e) => setShift({ ...shift, opening_cash: parseFloat(e.target.value) || 0 })}
              placeholder="0.00"
            />
          </div>
        </div>
        <DialogButtons
          onCancel={() => onOpenChange(false)}
          onConfirm={onSubmit}
          confirmText={isLoading ? 'Starting...' : 'Start Shift'}
          confirmDisabled={!shift.employee_id || !shift.store_id || isLoading}
        />
      </DialogContent>
    </Dialog>
  );
}

function EndShiftDialog({ open, onOpenChange, shift, closingCash, setClosingCash, onSubmit, isLoading }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  shift: Shift | null;
  closingCash: number;
  setClosingCash: (v: number) => void;
  onSubmit: () => void;
  isLoading: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle>End Shift</DialogTitle>
          <DialogDescription>Close shift for {shift?.employee_name}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="p-3 bg-muted rounded-lg">
            <div className="flex justify-between text-sm">
              <span>Opening Cash:</span>
              <span className="font-medium">${shift?.opening_cash?.toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-sm mt-1">
              <span>Started:</span>
              <span>{shift?.started_at && new Date(shift.started_at).toLocaleString()}</span>
            </div>
          </div>
          <div className="space-y-2">
            <Label>Closing Cash ($) *</Label>
            <Input
              type="number"
              value={closingCash}
              onChange={(e) => setClosingCash(parseFloat(e.target.value) || 0)}
              placeholder="Enter actual cash amount"
            />
          </div>
        </div>
        <DialogButtons
          onCancel={() => onOpenChange(false)}
          onConfirm={onSubmit}
          confirmText={isLoading ? 'Closing...' : 'End Shift'}
          confirmDisabled={isLoading}
        />
      </DialogContent>
    </Dialog>
  );
}

function StoreDetailsDialog({ open, onOpenChange, store }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  store: Store | null;
}) {
  if (!store) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>{store.name}</DialogTitle>
          <DialogDescription>{store.code}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm">
              <MapPin className="h-4 w-4" />
              {store.address}, {store.city}, {store.state}
            </div>
            <div className="flex items-center gap-2 text-sm">
              <Phone className="h-4 w-4" />
              {store.phone || 'N/A'}
            </div>
            <div className="flex items-center gap-2 text-sm">
              <Mail className="h-4 w-4" />
              {store.email || 'N/A'}
            </div>
            <div className="flex items-center gap-2 text-sm">
              <Clock className="h-4 w-4" />
              {store.opening_hours || 'N/A'}
            </div>
          </div>
          <Separator />
          <div className="grid grid-cols-3 gap-3">
            <div className="p-3 bg-muted rounded-lg text-center">
              <p className="text-xs text-muted-foreground">Status</p>
              <p className="font-medium capitalize">{store.status}</p>
            </div>
            <div className="p-3 bg-muted rounded-lg text-center">
              <p className="text-xs text-muted-foreground">Staff</p>
              <p className="font-medium">{store.employee_count || 0}</p>
            </div>
            <div className="p-3 bg-muted rounded-lg text-center">
              <p className="text-xs text-muted-foreground">Revenue</p>
              <p className="font-medium">${(store.daily_revenue || 0).toLocaleString()}</p>
            </div>
          </div>
        </div>
        <DialogButtons
          onCancel={() => onOpenChange(false)}
          onConfirm={() => onOpenChange(false)}
          confirmText="Close"
        />
      </DialogContent>
    </Dialog>
  );
}
