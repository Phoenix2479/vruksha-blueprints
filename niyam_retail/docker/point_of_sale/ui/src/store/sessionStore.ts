import { create } from 'zustand';
import type { POSSession } from '@shared/types/models.ts';

interface SessionState {
  session: POSSession | null;
  isSessionOpen: boolean;
  setSession: (session: POSSession | null) => void;
  clearSession: () => void;
}

export const useSessionStore = create<SessionState>((set) => ({
  session: null,
  isSessionOpen: false,
  setSession: (session) => set({ session, isSessionOpen: !!session }),
  clearSession: () => set({ session: null, isSessionOpen: false }),
}));
