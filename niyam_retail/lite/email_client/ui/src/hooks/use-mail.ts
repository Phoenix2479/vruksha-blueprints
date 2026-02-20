import { create } from 'zustand'

interface MailState {
  selected: string | null
  setSelected: (id: string | null) => void
}

export const useMail = create<MailState>((set) => ({
  selected: null,
  setSelected: (id) => set({ selected: id }),
}))
