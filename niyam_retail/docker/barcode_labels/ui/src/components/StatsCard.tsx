interface StatsCardProps {
  label: string
  value: string | number
  icon?: React.ReactNode
}

export function StatsCard({ label, value, icon }: StatsCardProps) {
  return (
    <div className="bg-white rounded-xl border shadow-sm p-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-gray-500">{label}</p>
          <p className="text-2xl font-semibold mt-1">{value}</p>
        </div>
        {icon && <div className="text-gray-400">{icon}</div>}
      </div>
    </div>
  )
}
