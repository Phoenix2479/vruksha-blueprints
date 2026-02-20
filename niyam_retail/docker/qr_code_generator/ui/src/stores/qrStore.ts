import { create } from 'zustand';
import type { QRCode, QRType, QRBranding, QRCodeMetadata, AppSettings, Product, DEFAULT_BRANDING } from '../types';
import * as api from '../api/qrApi';

interface QRStore {
  // State
  qrCodes: QRCode[];
  selectedQR: QRCode | null;
  settings: AppSettings | null;
  products: Product[];
  isLoading: boolean;
  error: string | null;

  // Draft state for generator
  draftType: QRType | null;
  draftLabel: string;
  draftMetadata: QRCodeMetadata;
  draftBranding: Partial<QRBranding>;

  // Actions
  fetchQRCodes: (params?: { type?: QRType; search?: string }) => Promise<void>;
  fetchQRCode: (id: string) => Promise<void>;
  createQR: () => Promise<string | null>;
  updateQR: (id: string, updates: Partial<QRCode>) => Promise<boolean>;
  deleteQR: (id: string) => Promise<boolean>;
  fetchSettings: () => Promise<void>;
  updateSettings: (settings: Partial<AppSettings>) => Promise<boolean>;
  fetchProducts: () => Promise<void>;

  // Draft actions
  setDraftType: (type: QRType | null) => void;
  setDraftLabel: (label: string) => void;
  setDraftMetadata: (metadata: Partial<QRCodeMetadata>) => void;
  setDraftBranding: (branding: Partial<QRBranding>) => void;
  resetDraft: () => void;
  loadQRIntoDraft: (qr: QRCode) => void;

  // Selection
  selectQR: (qr: QRCode | null) => void;
  clearError: () => void;
}

const initialDraftBranding: Partial<QRBranding> = {
  foreground_color: '#000000',
  background_color: '#FFFFFF',
  error_correction: 'M',
  size: 300,
  logo_path: null,
  logo_size_percent: 20,
};

export const useQRStore = create<QRStore>((set, get) => ({
  // Initial state
  qrCodes: [],
  selectedQR: null,
  settings: null,
  products: [],
  isLoading: false,
  error: null,

  draftType: null,
  draftLabel: '',
  draftMetadata: {},
  draftBranding: { ...initialDraftBranding },

  // Actions
  fetchQRCodes: async (params) => {
    set({ isLoading: true, error: null });
    try {
      const qrCodes = await api.getQRCodes(params);
      set({ qrCodes, isLoading: false });
    } catch (err: any) {
      set({ error: err.message, isLoading: false });
    }
  },

  fetchQRCode: async (id) => {
    set({ isLoading: true, error: null });
    try {
      const qr = await api.getQRCode(id);
      set({ selectedQR: qr, isLoading: false });
    } catch (err: any) {
      set({ error: err.message, isLoading: false });
    }
  },

  createQR: async () => {
    const { draftType, draftLabel, draftMetadata, draftBranding } = get();
    if (!draftType || !draftLabel) {
      set({ error: 'Type and label are required' });
      return null;
    }

    set({ isLoading: true, error: null });
    try {
      const result = await api.createQRCode({
        type: draftType,
        label: draftLabel,
        metadata: draftMetadata,
        branding: draftBranding,
      });
      
      // Refresh list
      await get().fetchQRCodes();
      get().resetDraft();
      
      set({ isLoading: false });
      return result.id;
    } catch (err: any) {
      set({ error: err.message, isLoading: false });
      return null;
    }
  },

  updateQR: async (id, updates) => {
    set({ isLoading: true, error: null });
    try {
      const success = await api.updateQRCode(id, updates);
      if (success) {
        await get().fetchQRCodes();
      }
      set({ isLoading: false });
      return success;
    } catch (err: any) {
      set({ error: err.message, isLoading: false });
      return false;
    }
  },

  deleteQR: async (id) => {
    set({ isLoading: true, error: null });
    try {
      const success = await api.deleteQRCode(id);
      if (success) {
        set({ qrCodes: get().qrCodes.filter(q => q.id !== id), selectedQR: null });
      }
      set({ isLoading: false });
      return success;
    } catch (err: any) {
      set({ error: err.message, isLoading: false });
      return false;
    }
  },

  fetchSettings: async () => {
    try {
      const settings = await api.getSettings();
      set({ settings });
    } catch (err: any) {
      set({ error: err.message });
    }
  },

  updateSettings: async (settings) => {
    set({ isLoading: true, error: null });
    try {
      const success = await api.updateSettings(settings);
      if (success) {
        await get().fetchSettings();
      }
      set({ isLoading: false });
      return success;
    } catch (err: any) {
      set({ error: err.message, isLoading: false });
      return false;
    }
  },

  fetchProducts: async () => {
    try {
      const products = await api.getProducts();
      set({ products });
    } catch (err: any) {
      set({ products: [] });
    }
  },

  // Draft actions
  setDraftType: (type) => set({ draftType: type }),
  setDraftLabel: (label) => set({ draftLabel: label }),
  setDraftMetadata: (metadata) => set({ draftMetadata: { ...get().draftMetadata, ...metadata } }),
  setDraftBranding: (branding) => set({ draftBranding: { ...get().draftBranding, ...branding } }),
  
  resetDraft: () => set({
    draftType: null,
    draftLabel: '',
    draftMetadata: {},
    draftBranding: { ...initialDraftBranding },
  }),

  loadQRIntoDraft: (qr) => set({
    draftType: qr.type,
    draftLabel: qr.label,
    draftMetadata: qr.metadata,
    draftBranding: qr.branding,
    selectedQR: qr,
  }),

  selectQR: (qr) => set({ selectedQR: qr }),
  clearError: () => set({ error: null }),
}));
