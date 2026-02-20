import { cn } from "@/lib/utils"

interface SpinnerProps {
  className?: string
  size?: "sm" | "md" | "lg"
}

const sizeClasses = {
  sm: "h-4 w-4 border-2",
  md: "h-6 w-6 border-2",
  lg: "h-8 w-8 border-[3px]",
}

export function Spinner({ className, size = "md" }: SpinnerProps) {
  return (
    <div
      className={cn(
        "animate-spin rounded-full border-solid border-current border-t-transparent",
        sizeClasses[size],
        className
      )}
    />
  )
}

export function LoadingSpinner({ className, size = "md" }: SpinnerProps) {
  return (
    <div className="flex items-center justify-center">
      <Spinner className={className} size={size} />
    </div>
  )
}
