import { LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@shared/components/ui/button"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@shared/components/ui/tooltip"

interface NavLink {
  title: string
  label?: string
  icon: LucideIcon
  variant: "default" | "ghost"
  onClick?: () => void
}

interface MailNavProps {
  isCollapsed: boolean
  links: NavLink[]
}

export function MailNav({ links, isCollapsed }: MailNavProps) {
  return (
    <div
      data-collapsed={isCollapsed}
      className="group flex flex-col gap-4 py-2 data-[collapsed=true]:py-2"
    >
      <nav className="grid gap-1 px-2 group-[[data-collapsed=true]]:justify-center group-[[data-collapsed=true]]:px-2">
        {links.map((link, index) =>
          isCollapsed ? (
            <Tooltip key={index} delayDuration={0}>
              <TooltipTrigger asChild>
                <Button
                  variant={link.variant}
                  size="icon"
                  className={cn(
                    "h-9 w-9",
                    link.variant === "default" &&
                      "dark:bg-muted dark:text-muted-foreground dark:hover:bg-muted dark:hover:text-white"
                  )}
                  onClick={link.onClick}
                >
                  <link.icon className="h-4 w-4" />
                  <span className="sr-only">{link.title}</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right" className="flex items-center gap-4">
                {link.title}
                {link.label && (
                  <span className="ml-auto text-muted-foreground">
                    {link.label}
                  </span>
                )}
              </TooltipContent>
            </Tooltip>
          ) : (
            <Button
              key={index}
              variant={link.variant}
              size="sm"
              className={cn(
                "justify-start",
                link.variant === "default" &&
                  "dark:bg-muted dark:text-white dark:hover:bg-muted dark:hover:text-white"
              )}
              onClick={link.onClick}
            >
              <link.icon className="mr-2 h-4 w-4" />
              {link.title}
              {link.label && (
                <span
                  className={cn(
                    "ml-auto",
                    link.variant === "default" && "text-background dark:text-white"
                  )}
                >
                  {link.label}
                </span>
              )}
            </Button>
          )
        )}
      </nav>
    </div>
  )
}
