import { formatDistanceToNow } from "date-fns"
import { cn } from "@/lib/utils"
import { Badge } from "@shared/components/ui/badge"
import { ScrollArea } from "@shared/components/ui/scroll-area"
import { useMail } from "@/hooks/use-mail"

export interface MailMessage {
  id: string
  subject: string
  from: string
  from_address?: string
  to?: string
  date: string
  body?: string
  body_text?: string
  read?: boolean
  is_read?: boolean
  labels?: string[]
  ai_category?: string
  ai_priority?: string
}

interface MailListProps {
  items: MailMessage[]
}

export function MailList({ items }: MailListProps) {
  const { selected, setSelected } = useMail()

  return (
    <ScrollArea className="h-[calc(100vh-180px)]">
      <div className="flex flex-col gap-2 p-4 pt-0">
        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
            <p>No messages</p>
            <p className="text-sm">Connect an account and sync to see emails</p>
          </div>
        ) : (
          items.map((item) => {
            const isRead = item.read ?? item.is_read ?? true
            return (
              <button
                key={item.id}
                className={cn(
                  "flex flex-col items-start gap-2 rounded-lg border p-3 text-left text-sm transition-all hover:bg-accent",
                  selected === item.id && "bg-muted"
                )}
                onClick={() => setSelected(item.id)}
              >
                <div className="flex w-full flex-col gap-1">
                  <div className="flex items-center">
                    <div className="flex items-center gap-2">
                      <div className="font-semibold">{item.from || item.from_address}</div>
                      {!isRead && (
                        <span className="flex h-2 w-2 rounded-full bg-blue-600" />
                      )}
                    </div>
                    <div
                      className={cn(
                        "ml-auto text-xs",
                        selected === item.id ? "text-foreground" : "text-muted-foreground"
                      )}
                    >
                      {formatDistanceToNow(new Date(item.date), { addSuffix: true })}
                    </div>
                  </div>
                  <div className="text-xs font-medium">{item.subject || '(No Subject)'}</div>
                </div>
                <div className="line-clamp-2 text-xs text-muted-foreground">
                  {(item.body || item.body_text || '').substring(0, 300)}
                </div>
                <div className="flex items-center gap-2">
                  {item.ai_category && (
                    <Badge variant="secondary">{item.ai_category}</Badge>
                  )}
                  {item.ai_priority === 'high' && (
                    <Badge variant="destructive">urgent</Badge>
                  )}
                  {item.labels?.map((label) => (
                    <Badge key={label} variant="outline">{label}</Badge>
                  ))}
                </div>
              </button>
            )
          })
        )}
      </div>
    </ScrollArea>
  )
}
