import { cn } from '@/lib/utils'
import { formatNumber } from '@/lib/utils'

interface StatCardProps {
  label: string
  count: number | string
  icon: React.ReactNode
  color: 'yellow' | 'blue' | 'green' | 'gray'
  isValue?: boolean
}

const bgColors = {
  yellow: 'bg-yellow-50 border-yellow-100',
  blue: 'bg-blue-50 border-blue-100',
  green: 'bg-green-50 border-green-100',
  gray: 'bg-gray-50 border-gray-100',
}

export default function StatCard({ label, count, icon, color, isValue }: StatCardProps) {
  return (
    <div className={cn('rounded-lg border p-4', bgColors[color])}>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-gray-500">{label}</p>
          <p className="text-2xl font-bold">
            {isValue ? count : formatNumber(count as number)}
          </p>
        </div>
        {icon}
      </div>
    </div>
  )
}
