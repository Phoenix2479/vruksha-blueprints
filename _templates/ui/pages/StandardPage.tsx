import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui"
import { PageHeader, StatsCard, DataTable, EmptyState, ThemeToggle } from "@/components/blocks"
import { api } from "@/lib/api"

// Template for a standard app page
// Copy this and customize for each app

interface StatsItem {
  title: string
  value: number | string
  description?: string
  format?: "number" | "currency" | "percentage" | "raw"
}

interface StandardPageProps {
  title: string
  description?: string
  stats?: StatsItem[]
  tabs?: {
    id: string
    label: string
    content: React.ReactNode
  }[]
  data?: unknown[]
  isLoading?: boolean
  error?: Error | null
}

export default function StandardPage({
  title,
  description,
  stats,
  tabs,
  data,
  isLoading,
  error,
}: StandardPageProps) {
  const [activeTab, setActiveTab] = useState(tabs?.[0]?.id || "overview")

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <header className="border-b px-6 py-4">
        <div className="mx-auto flex max-w-7xl items-center justify-between">
          <h1 className="text-xl font-bold">{title}</h1>
          <ThemeToggle />
        </div>
      </header>

      {/* Main Content */}
      <main className="mx-auto max-w-7xl space-y-6 p-6">
        <PageHeader title={title} description={description} />

        {/* Stats Grid */}
        {stats && stats.length > 0 && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {stats.map((stat, index) => (
              <StatsCard
                key={index}
                title={stat.title}
                value={stat.value}
                description={stat.description}
                format={stat.format}
              />
            ))}
          </div>
        )}

        {/* Tabs */}
        {tabs && tabs.length > 0 && (
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList>
              {tabs.map((tab) => (
                <TabsTrigger key={tab.id} value={tab.id}>
                  {tab.label}
                </TabsTrigger>
              ))}
            </TabsList>
            {tabs.map((tab) => (
              <TabsContent key={tab.id} value={tab.id}>
                {tab.content}
              </TabsContent>
            ))}
          </Tabs>
        )}

        {/* Error State */}
        {error && (
          <EmptyState
            title="Error loading data"
            description={error.message}
          />
        )}
      </main>
    </div>
  )
}
