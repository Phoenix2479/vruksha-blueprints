import { cn } from "@/lib/utils"
import { Loader2 } from "lucide-react"

function Spinner({ className, ...props }: React.SVGAttributes<SVGSVGElement>) {
  return <Loader2 className={cn("h-4 w-4 animate-spin", className)} {...props} />
}

export { Spinner }
