import { Loader2 } from 'lucide-react'

interface DataTableProps {
  columns: string[]
  data: any[]
  isLoading?: boolean
}

export function DataTable({ columns, data, isLoading }: DataTableProps) {
  if (isLoading) {
    return (
      <div className="bg-white rounded-xl shadow-sm border p-8 flex justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    )
  }

  if (!data || data.length === 0) {
    return (
      <div className="bg-white rounded-xl shadow-sm border p-8 text-center text-gray-500">
        No data available
      </div>
    )
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            {columns.map(col => (
              <th key={col} className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                {col.replace(/_/g, ' ')}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {data.map((row, i) => (
            <tr key={row.id || i} className="hover:bg-gray-50">
              {columns.map(col => (
                <td key={col} className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  {typeof row[col] === 'boolean' ? (row[col] ? 'Yes' : 'No') :
                   typeof row[col] === 'object' ? JSON.stringify(row[col]) :
                   row[col] ?? '-'}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
