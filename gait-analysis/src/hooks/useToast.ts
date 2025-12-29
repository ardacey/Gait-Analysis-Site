import { useCallback, useState } from 'react'
import type { ToastMessage } from '../types'

const TOAST_TTL_MS = 4000

export function useToast() {
  const [toasts, setToasts] = useState<ToastMessage[]>([])

  const removeToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id))
  }, [])

  const showToast = useCallback(
    (message: string, type: ToastMessage['type'] = 'info') => {
      const id = Date.now()
      setToasts((prev) => [...prev, { id, message, type }])
      window.setTimeout(() => {
        setToasts((prev) => prev.filter((toast) => toast.id !== id))
      }, TOAST_TTL_MS)
    },
    []
  )

  return { toasts, showToast, removeToast }
}
