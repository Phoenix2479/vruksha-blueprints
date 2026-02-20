import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { accountsApi } from '@/api/accounts';
import type { CreateAccountInput, UpdateAccountInput } from '@/types';

export const useAccounts = (params?: {
  type?: string;
  is_active?: boolean;
  search?: string;
  page?: number;
  limit?: number;
}) => {
  return useQuery({
    queryKey: ['accounts', params],
    queryFn: () => accountsApi.getAccounts(params),
  });
};

export const useAccountTree = () => {
  return useQuery({
    queryKey: ['accounts', 'tree'],
    queryFn: () => accountsApi.getAccountTree(),
  });
};

export const useAccount = (id: string) => {
  return useQuery({
    queryKey: ['accounts', id],
    queryFn: () => accountsApi.getAccount(id),
    enabled: !!id,
  });
};

export const useAccountBalance = (id: string, asOfDate?: string) => {
  return useQuery({
    queryKey: ['accounts', id, 'balance', asOfDate],
    queryFn: () => accountsApi.getAccountBalance(id, asOfDate),
    enabled: !!id,
  });
};

export const useCreateAccount = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateAccountInput) => accountsApi.createAccount(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
    },
  });
};

export const useUpdateAccount = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateAccountInput }) =>
      accountsApi.updateAccount(id, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
    },
  });
};

export const useDeleteAccount = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => accountsApi.deleteAccount(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
    },
  });
};

export const useInitializeDefaults = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => accountsApi.initializeDefaults(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
    },
  });
};
