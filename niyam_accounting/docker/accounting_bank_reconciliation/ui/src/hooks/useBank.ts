import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { bankApi } from '@/api/bank';
import type { BankAccount, BankTransaction } from '@/types';

export const useBankAccounts = () => useQuery({ queryKey: ['bank-accounts'], queryFn: () => bankApi.getBankAccounts() });
export const useBankAccount = (id: string) => useQuery({ queryKey: ['bank-accounts', id], queryFn: () => bankApi.getBankAccount(id), enabled: !!id });
export const useBankTransactions = (bankAccountId: string, params?: { status?: string; start_date?: string; end_date?: string }) =>
  useQuery({ queryKey: ['bank-transactions', bankAccountId, params], queryFn: () => bankApi.getTransactions(bankAccountId, params), enabled: !!bankAccountId });
export const useReconciliations = (bankAccountId: string) =>
  useQuery({ queryKey: ['reconciliations', bankAccountId], queryFn: () => bankApi.getReconciliations(bankAccountId), enabled: !!bankAccountId });

export const useCreateBankAccount = () => {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (input: Partial<BankAccount>) => bankApi.createBankAccount(input), onSuccess: () => qc.invalidateQueries({ queryKey: ['bank-accounts'] }) });
};
export const useImportTransactions = () => {
  const qc = useQueryClient();
  return useMutation({ mutationFn: ({ bankAccountId, transactions }: { bankAccountId: string; transactions: Partial<BankTransaction>[] }) => bankApi.importTransactions(bankAccountId, transactions), onSuccess: () => qc.invalidateQueries({ queryKey: ['bank-transactions'] }) });
};
export const useMatchTransaction = () => {
  const qc = useQueryClient();
  return useMutation({ mutationFn: ({ transactionId, ledgerEntryId }: { transactionId: string; ledgerEntryId: string }) => bankApi.matchTransaction(transactionId, ledgerEntryId), onSuccess: () => qc.invalidateQueries({ queryKey: ['bank-transactions'] }) });
};
export const useStartReconciliation = () => {
  const qc = useQueryClient();
  return useMutation({ mutationFn: ({ bankAccountId, statementDate, statementBalance }: { bankAccountId: string; statementDate: string; statementBalance: number }) => bankApi.startReconciliation(bankAccountId, statementDate, statementBalance), onSuccess: () => qc.invalidateQueries({ queryKey: ['reconciliations'] }) });
};
export const useCompleteReconciliation = () => {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (reconciliationId: string) => bankApi.completeReconciliation(reconciliationId), onSuccess: () => qc.invalidateQueries({ queryKey: ['reconciliations'] }) });
};
