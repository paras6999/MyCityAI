import { Bell, X } from 'lucide-react'
import { type ReactNode, useCallback, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'

import { type Toast, ToastContext } from './toastContext'

const VISIBLE_MS = 6000
const MAX_TOASTS = 4

/** Top-right notifications (docs/Design.md §5 "Toast"). */
export function ToastProvider({ children }: { children: ReactNode }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [toasts, setToasts] = useState<Toast[]>([])
  const nextId = useRef(1)

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id))
  }, [])

  const show = useCallback(
    (toast: Omit<Toast, 'id'>) => {
      const id = nextId.current++
      setToasts((current) => [...current.slice(-(MAX_TOASTS - 1)), { ...toast, id }])
      setTimeout(() => dismiss(id), VISIBLE_MS)
    },
    [dismiss],
  )

  const api = useMemo(() => ({ show }), [show])

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="fixed right-4 top-4 z-[1000] flex w-80 flex-col gap-2" aria-live="polite">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className="flex items-start gap-3 rounded-xl border border-border bg-surface p-3 shadow-lg"
          >
            <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary-light text-primary">
              <Bell size={14} aria-hidden />
            </span>
            <button
              type="button"
              disabled={!toast.href}
              onClick={() => {
                if (toast.href) navigate(toast.href)
                dismiss(toast.id)
              }}
              className="min-w-0 flex-1 text-left disabled:cursor-default"
            >
              <div className="text-sm font-semibold">{toast.title}</div>
              {toast.body && <div className="mt-0.5 truncate text-xs text-muted">{toast.body}</div>}
            </button>
            <button
              type="button"
              onClick={() => dismiss(toast.id)}
              className="text-faint hover:text-text"
              aria-label={t('common.dismiss')}
            >
              <X size={14} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}
