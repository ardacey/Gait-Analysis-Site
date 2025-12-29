import { X, CheckCircle2, AlertCircle, Activity } from 'lucide-react'
import type { ToastMessage } from '../../types'

interface ToastStackProps {
  toasts: ToastMessage[]
  onDismiss: (id: number) => void
}

export function ToastStack({ toasts, onDismiss }: ToastStackProps) {
  return (
    <div className="fixed top-4 right-4 z-[100] flex w-full max-w-sm flex-col gap-2 px-4 pointer-events-none sm:px-0">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`pointer-events-auto flex items-center gap-3 rounded-lg border bg-white p-4 shadow-lg animate-in slide-in-from-right-full duration-300 ${
            toast.type === 'success'
              ? 'border-emerald-200 text-emerald-800'
              : toast.type === 'error'
              ? 'border-red-200 text-red-800'
              : 'border-blue-200 text-blue-800'
          }`}
        >
          {toast.type === 'success' ? (
            <CheckCircle2 className="h-5 w-5 text-emerald-500" />
          ) : toast.type === 'error' ? (
            <AlertCircle className="h-5 w-5 text-red-500" />
          ) : (
            <Activity className="h-5 w-5 text-blue-500" />
          )}
          <p className="flex-1 text-sm font-medium">{toast.message}</p>
          <button
            onClick={() => onDismiss(toast.id)}
            className="text-slate-400 hover:text-slate-600"
            aria-label="Toast kapat"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}
    </div>
  )
}
