import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { cn, formatNumber, formatCurrency } from "@/lib/utils"

interface StatsCardProps {
  title: string
  value: number | string
  description?: string
  trend?: {
    value: number
    label: string
    positive?: boolean
  }
  format?: "number" | "currency" | "percentage" | "raw"
  currency?: string
  className?: string
}

export function StatsCard({
  title,
  value,
  description,
  trend,
  format = "raw",
  currency = "USD",
  className,
}: StatsCardProps) {
  const formattedValue = () => {
    if (typeof value === "string") return value
    switch (format) {
      case "currency":
        return formatCurrency(value, currency)
      case "number":
        return formatNumber(value)
      case "percentage":
        return `${value}%`
      default:
        return String(value)
    }
  }

  return (
    <Card className={className}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{formattedValue()}</div>
        {description && (
          <p className="text-xs text-muted-foreground">{description}</p>
        )}
        {trend && (
          <div className="flex items-center gap-1 text-xs">
            <span
              className={cn(
                trend.positive ? "text-green-600" : "text-red-600"
              )}
            >
              {trend.positive ? "+" : "-"}
              {trend.value}%
            </span>
            <span className="text-muted-foreground">{trend.label}</span>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
