import { useCallback, useRef, useState } from 'react'

export type Toast = { id: number; msg: string; kind: 'ok' | 'err' | 'info' }

// First genuinely shared toast in the app - previously the only precedent
// was the companion app's own local, non-shared useToast/ToastStack
// (apps/companion/hooks/useToast.ts). Same shape, lifted here so other
// surfaces (compaction notices in Conversation.tsx, and any future caller)
// don't have to re-invent it.
export function useToast() {
  const [toasts, setToasts] = useState<Toast[]>([])
  const counter = useRef(0)

  const show = useCallback((msg: string, kind: Toast['kind'] = 'ok') => {
    const id = counter.current + 1
    counter.current = id
    setToasts((current) => [...current, { id, msg, kind }])
    window.setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id))
    }, 3500)
  }, [])

  return { toasts, show }
}

export function ToastStack({ toasts }: { toasts: Toast[] }) {
  return (
    <div className="fixed bottom-6 right-6 z-[2000] flex flex-col gap-2">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={[
            'animate-[toast-slide-in_0.2s_ease] rounded-lg bg-app-surface px-4 py-2.5 text-[13px] font-medium shadow-[var(--shadow-medium)]',
            toast.kind === 'ok' ? 'border border-[rgba(var(--color-success-rgb),0.4)] text-app-success' : '',
            toast.kind === 'err' ? 'border border-[rgba(var(--color-error-rgb),0.4)] text-app-error' : '',
            toast.kind === 'info' ? 'border border-app-border-subtle text-app-text-secondary' : '',
          ].filter(Boolean).join(' ')}
        >
          {toast.msg}
        </div>
      ))}
    </div>
  )
}
