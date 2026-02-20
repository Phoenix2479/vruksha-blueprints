import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { journalApi } from '@/api/journal';
import type { CreateJournalEntryInput } from '@/types';

export const useJournalEntries = (params?: {
  status?: string;
  entry_type?: string;
  start_date?: string;
  end_date?: string;
  search?: string;
  page?: number;
  limit?: number;
}) => {
  return useQuery({
    queryKey: ['journal-entries', params],
    queryFn: () => journalApi.getEntries(params),
  });
};

export const useJournalEntry = (id: string) => {
  return useQuery({
    queryKey: ['journal-entries', id],
    queryFn: () => journalApi.getEntry(id),
    enabled: !!id,
  });
};

export const useAccounts = () => {
  return useQuery({
    queryKey: ['accounts'],
    queryFn: () => journalApi.getAccounts(),
  });
};

export const useCreateJournalEntry = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateJournalEntryInput) => journalApi.createEntry(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['journal-entries'] });
    },
  });
};

export const useUpdateJournalEntry = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: Partial<CreateJournalEntryInput> }) =>
      journalApi.updateEntry(id, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['journal-entries'] });
    },
  });
};

export const useDeleteJournalEntry = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => journalApi.deleteEntry(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['journal-entries'] });
    },
  });
};

export const usePostJournalEntry = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => journalApi.postEntry(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['journal-entries'] });
    },
  });
};

export const useReverseJournalEntry = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, reversalDate }: { id: string; reversalDate?: string }) =>
      journalApi.reverseEntry(id, reversalDate),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['journal-entries'] });
    },
  });
};
