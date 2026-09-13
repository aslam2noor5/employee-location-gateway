import { create } from 'zustand'

interface ToastState {
  message: string | null
  type: 'success' | 'error'
  show: (message: string, type?: 'success' | 'error') => void
  hide: () => void
}

export const useToastStore = create<ToastState>((set) => ({
  message: null,
  type: 'success',
  show: (message, type = 'success') => set({ message, type }),
  hide: () => set({ message: null }),
}))

export function useToast() {
  const show = useToastStore((s) => s.show)
  const hide = useToastStore((s) => s.hide)
  return { show, hide }
}