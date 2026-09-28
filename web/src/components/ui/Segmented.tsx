import clsx from 'clsx'
import type { ReactNode } from 'react'
import s from './ui.module.css'

export interface SegmentOption<T> {
  value: T
  label: ReactNode
  disabled?: boolean
  title?: string
}

interface Props<T> {
  options: SegmentOption<T>[]
  value: T
  onChange: (v: T) => void
  size?: 'sm' | 'md'
  full?: boolean
  className?: string
  'aria-label'?: string
}

/** Segmentový přepínač (Všichni / Vašek / Míša, Měsíc / Čtvrtletí / Rok …). */
export function Segmented<T extends string | number | boolean>({ options, value, onChange, size = 'md', full, className, ...rest }: Props<T>) {
  return (
    <div role="radiogroup" aria-label={rest['aria-label']} className={clsx(s.seg, full && s.segFull, size === 'sm' && s.segSm, className)}>
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          disabled={o.disabled}
          title={o.title}
          className={clsx(s.segItem, o.value === value && s.segItemOn)}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}
