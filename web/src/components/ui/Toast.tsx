import * as ToastPrimitive from '@radix-ui/react-toast'
import clsx from 'clsx'
import { AlertTriangle, Check } from 'lucide-react'
import { useEffect, useState } from 'react'
import s from './ui.module.css'

export interface ToastMessage {
  id?: number
  tone?: 'success' | 'danger' | 'info'
  title?: string
  message: string
}

type Listener = (t: ToastMessage) => void
const listeners = new Set<Listener>()
let seq = 0

/** Zobrazí oznámení (lze volat i mimo React, např. z api.ts). */
export function toast(t: ToastMessage) {
  const msg = { ...t, id: ++seq }
  listeners.forEach((l) => l(msg))
}

export function Toaster() {
  const [items, setItems] = useState<ToastMessage[]>([])
  useEffect(() => {
    const l: Listener = (t) => setItems((x) => [...x.slice(-3), t])
    listeners.add(l)
    return () => {
      listeners.delete(l)
    }
  }, [])
  return (
    <ToastPrimitive.Provider duration={4500} swipeDirection="right">
      {items.map((t) => (
        <ToastPrimitive.Root
          key={t.id}
          className={clsx(s.toast, t.tone === 'danger' && s.toastDanger, t.tone === 'success' && s.toastSuccess)}
          onOpenChange={(open) => !open && setItems((x) => x.filter((y) => y.id !== t.id))}
        >
          <span style={{ display: 'flex', paddingTop: 1 }}>{t.tone === 'danger' ? <AlertTriangle size={16} /> : <Check size={16} />}</span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {t.title && <ToastPrimitive.Title className={s.toastTitle}>{t.title}</ToastPrimitive.Title>}
            <ToastPrimitive.Description>{t.message}</ToastPrimitive.Description>
          </div>
        </ToastPrimitive.Root>
      ))}
      <ToastPrimitive.Viewport className={s.toastViewport} />
    </ToastPrimitive.Provider>
  )
}
