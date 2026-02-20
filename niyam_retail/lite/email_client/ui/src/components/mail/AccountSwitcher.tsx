import { cn } from "@/lib/utils"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@shared/components/ui/select"
import { Mail } from "lucide-react"

interface Account {
  email: string
  display_name?: string
  provider: string
}

interface AccountSwitcherProps {
  isCollapsed: boolean
  accounts: Account[]
  selectedAccount: string | null
  onSelect: (email: string) => void
}

export function AccountSwitcher({
  isCollapsed,
  accounts,
  selectedAccount,
  onSelect,
}: AccountSwitcherProps) {
  const selected = accounts.find((a) => a.email === selectedAccount) || accounts[0]

  return (
    <Select value={selectedAccount || ''} onValueChange={onSelect}>
      <SelectTrigger
        className={cn(
          "flex items-center gap-2 [&>span]:line-clamp-1 [&>span]:flex [&>span]:w-full [&>span]:items-center [&>span]:gap-1 [&>span]:truncate [&_svg]:h-4 [&_svg]:w-4 [&_svg]:shrink-0",
          isCollapsed &&
            "flex h-9 w-9 shrink-0 items-center justify-center p-0 [&>span]:w-auto [&>svg]:hidden"
        )}
        aria-label="Select account"
      >
        <SelectValue placeholder="Select an account">
          <Mail className="h-4 w-4" />
          <span className={cn("ml-2", isCollapsed && "hidden")}>
            {selected?.display_name || selected?.email?.split('@')[0] || 'Select account'}
          </span>
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {accounts.length === 0 ? (
          <SelectItem value="none" disabled>
            No accounts connected
          </SelectItem>
        ) : (
          accounts.map((account) => (
            <SelectItem key={account.email} value={account.email}>
              <div className="flex items-center gap-3">
                <Mail className="h-4 w-4" />
                <div className="flex flex-col">
                  <span className="font-medium">{account.display_name || account.email.split('@')[0]}</span>
                  <span className="text-xs text-muted-foreground">{account.email}</span>
                </div>
              </div>
            </SelectItem>
          ))
        )}
      </SelectContent>
    </Select>
  )
}
