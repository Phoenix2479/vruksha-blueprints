interface StatsCardProps {
  label: string
  value: string | number
  change?: string
}

export function StatsCard({ label, value, change }: StatsCardProps) {
  return (
    <div className="bg-white rounded-xl shadow-sm border p-6">
      <p className="text-sm text-gray-500">{label}</p>
      <p className="text-2xl font-semibold mt-1">{value}</p>
      {change && <p className="text-sm text-green-600 mt-1">{change}</p>}
    </div>
  )
}
