import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui";
import { PageHeader, StatsCard, DataTable, EmptyState, ThemeToggle } from "@/components/blocks";
import { api } from "@/lib/api";

function App() {
  const [activeTab, setActiveTab] = useState("overview");

  const { data, isLoading, error } = useQuery({
    queryKey: ["smart_inventory_tracker"],
    queryFn: () => api.get("/api/smart_inventory_tracker"),
  });

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b px-6 py-4">
        <div className="mx-auto flex max-w-7xl items-center justify-between">
          <h1 className="text-xl font-bold">smart inventory tracker</h1>
          <ThemeToggle />
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-6 p-6">
        <PageHeader
          title="smart inventory tracker"
          description="Manage your smart inventory tracker"
        />

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatsCard title="Total Items" value={0} format="number" />
          <StatsCard title="Revenue" value={0} format="currency" />
          <StatsCard title="Growth" value={0} format="percentage" />
          <StatsCard title="Active" value={0} format="number" />
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="details">Details</TabsTrigger>
            <TabsTrigger value="settings">Settings</TabsTrigger>
          </TabsList>
          <TabsContent value="overview">
            {isLoading ? (
              <div className="flex h-32 items-center justify-center">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
              </div>
            ) : error ? (
              <EmptyState title="Error" description={error.message} />
            ) : (
              <div className="rounded-lg border p-4">
                <pre className="text-sm">{JSON.stringify(data, null, 2)}</pre>
              </div>
            )}
          </TabsContent>
          <TabsContent value="details">
            <div className="rounded-lg border p-4">
              <p className="text-muted-foreground">Details content goes here</p>
            </div>
          </TabsContent>
          <TabsContent value="settings">
            <div className="rounded-lg border p-4">
              <p className="text-muted-foreground">Settings content goes here</p>
            </div>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}

export default App;
