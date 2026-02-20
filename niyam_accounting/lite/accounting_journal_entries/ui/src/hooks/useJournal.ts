import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { journalApi } from '@/api/journal'

export function useJournalEntries(params?: { status?: string; search?: string; limit?: number }) {
  return useQuery({ queryKey: ['journal-entries', params], queryFn: () => journalApi.getEntries(params) })
}

export function useJournalEntry(id: string | null) {
  return useQuery({ queryKey: ['journal-entry', id], queryFn: () => journalApi.getEntry(id!), enabled: !!id })
}

export function useCreateJournalEntry() {
  const qc = useQueryClient()
  return useMutation({ mutationFn: journalApi.createEntry, onSuccess: () => qc.invalidateQueries({ queryKey: ['journal-entries'] }) })
}

export function usePostJournalEntry() {
  const qc = useQueryClient()
  return useMutation({ mutationFn: journalApi.postEntry, onSuccess: () => qc.invalidateQueries({ queryKey: ['journal-entries'] }) })
}

export function useVoidJournalEntry() {
  const qc = useQueryClient()
  return useMutation({ mutationFn: journalApi.voidEntry, onSuccess: () => qc.invalidateQueries({ queryKey: ['journal-entries'] }) })
}
