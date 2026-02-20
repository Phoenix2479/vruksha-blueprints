import { useState } from 'react'
import { Loader2 } from 'lucide-react'

interface Field {
  name: string
  label: string
  type: string
  required?: boolean
  options?: string[]
}

interface EntityFormProps {
  fields: Field[]
  onSubmit: (data: any) => void
  onCancel: () => void
  isLoading?: boolean
  initialData?: any
}

export function EntityForm({ fields, onSubmit, onCancel, isLoading, initialData }: EntityFormProps) {
  const [formData, setFormData] = useState<any>(initialData || {})

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onSubmit(formData)
  }

  const handleChange = (name: string, value: any) => {
    setFormData((prev: any) => ({ ...prev, [name]: value }))
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {fields.map(field => (
        <div key={field.name}>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            {field.label} {field.required && <span className="text-red-500">*</span>}
          </label>
          {field.type === 'select' ? (
            <select
              value={formData[field.name] || ''}
              onChange={e => handleChange(field.name, e.target.value)}
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
              required={field.required}
            >
              <option value="">Select...</option>
              {field.options?.map(opt => <option key={opt} value={opt}>{opt}</option>)}
            </select>
          ) : field.type === 'textarea' ? (
            <textarea
              value={formData[field.name] || ''}
              onChange={e => handleChange(field.name, e.target.value)}
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
              rows={3}
              required={field.required}
            />
          ) : field.type === 'checkbox' ? (
            <input
              type="checkbox"
              checked={formData[field.name] || false}
              onChange={e => handleChange(field.name, e.target.checked)}
              className="h-4 w-4"
            />
          ) : (
            <input
              type={field.type === 'number' ? 'number' : field.type === 'date' ? 'date' : 
                    field.type === 'datetime' ? 'datetime-local' : field.type === 'email' ? 'email' : 'text'}
              value={formData[field.name] || ''}
              onChange={e => handleChange(field.name, field.type === 'number' ? Number(e.target.value) : e.target.value)}
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
              required={field.required}
            />
          )}
        </div>
      ))}
      <div className="flex gap-3 pt-4">
        <button type="submit" disabled={isLoading}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2">
          {isLoading && <Loader2 className="h-4 w-4 animate-spin" />}
          Save
        </button>
        <button type="button" onClick={onCancel}
          className="px-4 py-2 border rounded-lg hover:bg-gray-50">
          Cancel
        </button>
      </div>
    </form>
  )
}
