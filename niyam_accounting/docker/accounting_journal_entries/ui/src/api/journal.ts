import axios from 'axios';
import type { JournalEntry, CreateJournalEntryInput, ApiResponse, PaginatedResponse } from '@/types';

const api = axios.create({
  baseURL: '/api',
  headers: {
    'Content-Type': 'application/json',
    'x-tenant-id': 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  },
});

export const journalApi = {
  // Get all journal entries
  getEntries: async (params?: {
    status?: string;
    entry_type?: string;
    start_date?: string;
    end_date?: string;
    search?: string;
    page?: number;
    limit?: number;
  }): Promise<PaginatedResponse<JournalEntry>> => {
    const { data } = await api.get('/journal-entries', { params });
    return data;
  },

  // Get single journal entry with lines
  getEntry: async (id: string): Promise<ApiResponse<JournalEntry>> => {
    const { data } = await api.get(`/journal-entries/${id}`);
    return data;
  },

  // Create journal entry
  createEntry: async (input: CreateJournalEntryInput): Promise<ApiResponse<JournalEntry>> => {
    const { data } = await api.post('/journal-entries', input);
    return data;
  },

  // Update journal entry (only draft)
  updateEntry: async (id: string, input: Partial<CreateJournalEntryInput>): Promise<ApiResponse<JournalEntry>> => {
    const { data } = await api.put(`/journal-entries/${id}`, input);
    return data;
  },

  // Delete journal entry (only draft)
  deleteEntry: async (id: string): Promise<ApiResponse<null>> => {
    const { data } = await api.delete(`/journal-entries/${id}`);
    return data;
  },

  // Post journal entry
  postEntry: async (id: string): Promise<ApiResponse<JournalEntry>> => {
    const { data } = await api.post(`/journal-entries/${id}/post`);
    return data;
  },

  // Reverse journal entry
  reverseEntry: async (id: string, reversalDate?: string): Promise<ApiResponse<JournalEntry>> => {
    const { data } = await api.post(`/journal-entries/${id}/reverse`, {
      reversal_date: reversalDate,
    });
    return data;
  },

  // Get accounts for selection
  getAccounts: async (): Promise<ApiResponse<Array<{
    id: string;
    account_code: string;
    account_name: string;
    account_type: string;
  }>>> => {
    const { data } = await axios.get('http://localhost:8831/accounts', {
      headers: {
        'Content-Type': 'application/json',
        'x-tenant-id': 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      },
      params: { limit: 1000 },
    });
    return data;
  },
};
