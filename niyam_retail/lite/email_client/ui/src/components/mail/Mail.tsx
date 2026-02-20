import * as React from "react"
import {
  Archive,
  File,
  Inbox,
  Plus,
  RefreshCw,
  Send,
  Settings,
  Trash2,
  Search,
  PanelLeftClose,
  PanelLeft,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { Input } from "@shared/components/ui/input"
import { Button } from "@shared/components/ui/button"
import { Separator } from "@shared/components/ui/separator"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@shared/components/ui/tabs"
import { TooltipProvider } from "@shared/components/ui/tooltip"
import { AccountSwitcher } from "./AccountSwitcher"
import { MailDisplay } from "./MailDisplay"
import { MailList, MailMessage } from "./MailList"
import { MailNav } from "./MailNav"
import { useMail } from "@/hooks/use-mail"

interface Account {
  email: string
  display_name?: string
  provider: string
}

interface MailProps {
  accounts: Account[]
  messages: MailMessage[]
  selectedAccount: string | null
  onAccountChange: (email: string) => void
  onSync: () => void
  onCompose: () => void
  onAddAccount: () => void
  onReply?: (mail: MailMessage) => void
  onDelete?: (mail: MailMessage) => void
  isLoading?: boolean
  stats?: {
    unreadMessages?: number
    totalMessages?: number
  }
}

export function Mail({
  accounts,
  messages,
  selectedAccount,
  onAccountChange,
  onSync,
  onCompose,
  onAddAccount,
  onReply,
  onDelete,
  isLoading,
  stats,
}: MailProps) {
  const [isCollapsed, setIsCollapsed] = React.useState(false)
  const { selected } = useMail()
  const [searchTerm, setSearchTerm] = React.useState("")

  const filteredMessages = React.useMemo(() => {
    if (!searchTerm) return messages
    const term = searchTerm.toLowerCase()
    return messages.filter(
      (m) =>
        m.subject?.toLowerCase().includes(term) ||
        m.from?.toLowerCase().includes(term) ||
        m.body?.toLowerCase().includes(term)
    )
  }, [messages, searchTerm])

  const selectedMail = messages.find((m) => m.id === selected) || null

  const navLinks = [
    {
      title: "Inbox",
      label: stats?.unreadMessages?.toString() || "",
      icon: Inbox,
      variant: "default" as const,
    },
    {
      title: "Drafts",
      label: "",
      icon: File,
      variant: "ghost" as const,
    },
    {
      title: "Sent",
      label: "",
      icon: Send,
      variant: "ghost" as const,
    },
    {
      title: "Archive",
      label: "",
      icon: Archive,
      variant: "ghost" as const,
    },
    {
      title: "Trash",
      label: "",
      icon: Trash2,
      variant: "ghost" as const,
    },
  ]

  return (
    <TooltipProvider delayDuration={0}>
      <div className="flex h-screen w-full">
        {/* Sidebar */}
        <div
          className={cn(
            "flex flex-col border-r bg-muted/40 transition-all duration-300",
            isCollapsed ? "w-[60px]" : "w-[220px]"
          )}
        >
          {/* Collapse Toggle */}
          <div className="flex h-[52px] items-center justify-between px-2">
            {!isCollapsed && (
              <AccountSwitcher
                isCollapsed={isCollapsed}
                accounts={accounts}
                selectedAccount={selectedAccount}
                onSelect={onAccountChange}
              />
            )}
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setIsCollapsed(!isCollapsed)}
              className={cn(isCollapsed && "mx-auto")}
            >
              {isCollapsed ? <PanelLeft className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
            </Button>
          </div>
          <Separator />
          
          {/* Action Buttons */}
          <div className={cn("flex gap-2 p-2", isCollapsed && "flex-col items-center")}>
            <Button
              size={isCollapsed ? "icon" : "sm"}
              className={cn(!isCollapsed && "flex-1")}
              onClick={onCompose}
              disabled={accounts.length === 0}
            >
              <Plus className="h-4 w-4" />
              {!isCollapsed && <span className="ml-2">Compose</span>}
            </Button>
            {!isCollapsed && (
              <Button variant="outline" size="icon" onClick={onSync}>
                <RefreshCw className={cn("h-4 w-4", isLoading && "animate-spin")} />
              </Button>
            )}
          </div>
          
          <Separator />
          <MailNav isCollapsed={isCollapsed} links={navLinks} />
          <Separator />
          
          {/* Settings at bottom */}
          <div className="mt-auto p-2">
            <Button
              variant="ghost"
              size={isCollapsed ? "icon" : "sm"}
              className={cn("w-full", !isCollapsed && "justify-start")}
              onClick={onAddAccount}
            >
              <Settings className="h-4 w-4" />
              {!isCollapsed && <span className="ml-2">Add Account</span>}
            </Button>
          </div>
        </div>

        {/* Mail List */}
        <div className="flex flex-col w-[350px] min-w-[300px] border-r">
          <Tabs defaultValue="all" className="flex flex-col h-full">
            <div className="flex items-center px-4 py-2">
              <h1 className="text-xl font-bold">Inbox</h1>
              <TabsList className="ml-auto">
                <TabsTrigger value="all" className="text-zinc-600 dark:text-zinc-200">
                  All mail
                </TabsTrigger>
                <TabsTrigger value="unread" className="text-zinc-600 dark:text-zinc-200">
                  Unread
                </TabsTrigger>
              </TabsList>
            </div>
            <Separator />
            <div className="bg-background/95 p-4 backdrop-blur supports-[backdrop-filter]:bg-background/60">
              <form onSubmit={(e) => e.preventDefault()}>
                <div className="relative">
                  <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search"
                    className="pl-8"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                </div>
              </form>
            </div>
            <TabsContent value="all" className="m-0 flex-1 overflow-auto">
              <MailList items={filteredMessages} />
            </TabsContent>
            <TabsContent value="unread" className="m-0 flex-1 overflow-auto">
              <MailList items={filteredMessages.filter((item) => !(item.read ?? item.is_read))} />
            </TabsContent>
          </Tabs>
        </div>

        {/* Mail Display */}
        <div className="flex-1 min-w-0">
          <MailDisplay 
            mail={selectedMail} 
            onReply={onReply}
            onDelete={onDelete}
          />
        </div>
      </div>
    </TooltipProvider>
  )
}
