import { useState, lazy, Suspense } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Users, LayoutDashboard, Briefcase, Activity, Bot, Shield, FileText } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger, Skeleton } from '@shared/components/ui';
import { spacing } from '@shared/styles/spacing';

// Lazy load tabs for better performance
const DashboardTab = lazy(() => import('./pages/DashboardTab'));
const Customer360Page = lazy(() => import('./pages/Customer360Page'));
const SalesPipelineTab = lazy(() => import('./pages/SalesPipelineTab'));
const ActivitiesTab = lazy(() => import('./pages/ActivitiesTab'));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
      staleTime: 30000,
    },
  },
});

function TabLoader() {
  return (
    <div className="space-y-4 p-4">
      <Skeleton className="h-8 w-48" />
      <div className="grid grid-cols-4 gap-4">
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
      </div>
      <Skeleton className="h-64" />
    </div>
  );
}

export default function App() {
  const [activeTab, setActiveTab] = useState('dashboard');

  return (
    <QueryClientProvider client={queryClient}>
      <div className="min-h-screen bg-background">
        {/* Header */}
        <header className={`border-b bg-card ${spacing.header}`}>
          <div className="flex items-center justify-between max-w-7xl mx-auto">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-rose-100 rounded-lg">
                <Users className="h-6 w-6 text-rose-600" />
              </div>
              <div>
                <h1 className="text-xl font-bold tracking-tight">CRM 360</h1>
                <p className="text-sm text-muted-foreground">Unified Customer & Sales Management</p>
              </div>
            </div>
          </div>
        </header>

        {/* Main Content */}
        <main className={`max-w-7xl mx-auto ${spacing.page} ${spacing.section}`}>
          <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
            <TabsList className="grid grid-cols-4 md:grid-cols-7 w-full max-w-4xl">
              <TabsTrigger value="dashboard" className="gap-2">
                <LayoutDashboard className="h-4 w-4" />
                <span className="hidden md:inline">Dashboard</span>
              </TabsTrigger>
              <TabsTrigger value="customers" className="gap-2">
                <Users className="h-4 w-4" />
                <span className="hidden md:inline">Customers</span>
              </TabsTrigger>
              <TabsTrigger value="sales" className="gap-2">
                <Briefcase className="h-4 w-4" />
                <span className="hidden md:inline">Sales Pipeline</span>
              </TabsTrigger>
              <TabsTrigger value="activities" className="gap-2">
                <Activity className="h-4 w-4" />
                <span className="hidden md:inline">Activities</span>
              </TabsTrigger>
              <TabsTrigger value="ai_actions" className="gap-2">
                <Bot className="h-4 w-4" />
                <span className="hidden md:inline">AI Actions</span>
              </TabsTrigger>
              <TabsTrigger value="privacy" className="gap-2">
                <Shield className="h-4 w-4" />
                <span className="hidden md:inline">Privacy</span>
              </TabsTrigger>
              <TabsTrigger value="audit" className="gap-2">
                <FileText className="h-4 w-4" />
                <span className="hidden md:inline">Audit</span>
              </TabsTrigger>
            </TabsList>

            <Suspense fallback={<TabLoader />}>
              <TabsContent value="dashboard" className="mt-6">
                <DashboardTab />
              </TabsContent>

              <TabsContent value="customers" className="mt-6">
                <Customer360Page embedded />
              </TabsContent>

              <TabsContent value="sales" className="mt-6">
                <SalesPipelineTab />
              </TabsContent>

              <TabsContent value="activities" className="mt-6">
                <ActivitiesTab />
              </TabsContent>

              <TabsContent value="ai_actions" className="mt-6">
                <Customer360Page embedded activeSection="ai_actions" />
              </TabsContent>

              <TabsContent value="privacy" className="mt-6">
                <Customer360Page embedded activeSection="privacy" />
              </TabsContent>

              <TabsContent value="audit" className="mt-6">
                <Customer360Page embedded activeSection="audit" />
              </TabsContent>
            </Suspense>
          </Tabs>
        </main>
      </div>
    </QueryClientProvider>
  );
}
