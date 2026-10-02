import { createContext, useContext } from 'react'

export interface Toast {
  id: number
  title: string
  body?: string
  /** Optional in-app link the toast opens when clicked. */
  href?: string
}

export interface ToastApi {
  show: (toast: Omit<Toast, 'id'>) => void
}

export const ToastContext = createContext<ToastApi | null>(null)

export function useToast(): ToastApi {
  const context = useContext(ToastContext)
  if (!context) throw new Error('useToast must be used inside <ToastProvider>')
  return context
}
