import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ledgerApi } from '@/api/ledger';

export const useLedgerEntries = (params?: {
  account_id?: string;
  start_date?: string;
  end_date?: string;
  page?: number;
  limit?: number;
}) => {
  return useQuery({
    queryKey: ['ledger', 'entries', params],
    queryFn: () => ledgerApi.getEntries(params),
  });
};

export const useAccountLedger = (
  accountId: string,
  params?: {
    start_date?: string;
    end_date?: string;
  }
) => {
  return useQuery({
    queryKey: ['ledger', 'account', accountId, params],
    queryFn: () => ledgerApi.getAccountLedger(accountId, params),
    enabled: !!accountId,
  });
};

export const useTrialBalance = (asOfDate?: string) => {
  return useQuery({
    queryKey: ['ledger', 'trial-balance', asOfDate],
    queryFn: () => ledgerApi.getTrialBalance(asOfDate),
  });
};

export const useAccountBalances = (params?: {
  account_type?: string;
  as_of_date?: string;
}) => {
  return useQuery({
    queryKey: ['ledger', 'balances', params],
    queryFn: () => ledgerApi.getAccountBalances(params),
  });
};

export const usePostEntries = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (journalEntryId: string) => ledgerApi.postEntries(journalEntryId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ledger'] });
    },
  });
};

export const useReverseEntries = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (journalEntryId: string) => ledgerApi.reverseEntries(journalEntryId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ledger'] });
    },
  });
};
