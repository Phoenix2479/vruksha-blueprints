import axios from 'axios'
import type { JournalEntry, ApiResponse } from '@/types'

const api = axios.create({ baseURL: '/api' })

export const journalApi = {
  getEntries: async (params?: { status?: string; search?: string; limit?: number }) => {
    const { data } = await api.get<ApiResponse<JournalEntry[]>>('/journal-entries', { params })
    return data
  },
  getEntry: async (id: string) => {
    const { data } = await api.get<ApiResponse<JournalEntry>>(`/journal-entries/${id}`)
    return data
  },
  createEntry: async (input: any) => {
    const { data } = await api.post<ApiResponse<JournalEntry>>('/journal-entries', input)
    return data
  },
  postEntry: async (id: string) => {
    const { data } = await api.post<ApiResponse<JournalEntry>>(`/journal-entries/${id}/post`)
    return data
  },
  voidEntry: async (id: string) => {
    const { data } = await api.post<ApiResponse<JournalEntry>>(`/journal-entries/${id}/void`)
    return data
  },
}
