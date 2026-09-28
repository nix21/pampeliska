import type { CSSProperties } from 'react'
import s from './charts.module.css'

export interface BarPart {
  key: string | number
  value: number
  color: string
  label?: string
}

/** Vodorovný pruh složený z dílů (disponibilní zůstatek, nezbytné vs. radost, rozdělená platba). */
export function SegmentBar({ parts, height = 10, gap = 2, bordered, style }: { parts: BarPart[]; height?: number; gap?: number; bordered?: boolean; style?: CSSProperties }) {
  const visible = parts.filter((p) => p.value > 0)
  return (
    <div className={s.segBar} style={{ height, gap, border: bordered ? 'var(--btn-border, 0)' : undefined, ...style }}>
      {visible.length === 0 ? <span style={{ flex: 1, background: 'var(--surface-2)' }} />
        : visible.map((p) => <span key={p.key} title={p.label} style={{ flex: p.value, background: p.color }} />)}
    </div>
  )
}
