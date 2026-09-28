import type { ReactNode } from 'react'
import { arcPath } from './arc'
import s from './charts.module.css'
import type { ChartNode } from './types'

export interface SunburstProps {
  /** Vnitřní prstenec = items, vnější = jejich children (úhel podle hodnoty z celku). */
  items: ChartNode[]
  size: number
  /** Obsah středu (název, částka…). */
  center?: ReactNode
  onCenterClick?: () => void
  onItemClick?: (item: ChartNode) => void
  onChildClick?: (child: ChartNode, parent: ChartNode) => void
  onHover?: (node: ChartNode | null, parent?: ChartNode) => void
  /** Ztlumit segment (výběr jiné podkategorie). */
  isDimmed?: (node: ChartNode, parent?: ChartNode) => boolean
  'aria-label'?: string
}

/** Dvouúrovňový prstenec (sunburst) jako v prototypu: hlavní kategorie uvnitř, podkategorie venku. */
export function Sunburst({ items, size, center, onCenterClick, onItemClick, onChildClick, onHover, isDimmed, ...rest }: SunburstProps) {
  const c = size / 2
  const r0 = size * 0.235
  const r1 = size * 0.36
  const r2 = size * 0.372
  const r3 = size * 0.495
  const visible = items.filter((i) => i.value > 0)
  const total = visible.reduce((a, i) => a + i.value, 0) || 1
  const segs: ReactNode[] = []
  let a = 0
  for (const it of visible) {
    const a1 = a + (it.value / total) * Math.PI * 2
    segs.push(
      <path key={`i${it.id}`} d={arcPath(c, r0, r1, a, a1)} className={s.seg}
        style={{ fill: it.color, opacity: isDimmed?.(it) ? 0.35 : 1, cursor: onItemClick && !it.disabled ? 'pointer' : 'default' }}
        onClick={() => !it.disabled && onItemClick?.(it)} onMouseEnter={() => onHover?.(it)}>
        <title>{it.title ?? it.label}</title>
      </path>,
    )
    let b = a
    for (const ch of it.children ?? []) {
      if (ch.value <= 0) continue
      const b1 = b + (ch.value / total) * Math.PI * 2
      segs.push(
        <path key={`c${it.id}-${ch.id}`} d={arcPath(c, r2, r3, b, b1)} className={s.seg}
          style={{ fill: ch.color, opacity: isDimmed?.(ch, it) ? 0.35 : 1, cursor: onChildClick || onItemClick ? 'pointer' : 'default' }}
          onClick={() => (onChildClick ? onChildClick(ch, it) : !it.disabled && onItemClick?.(it))} onMouseEnter={() => onHover?.(ch, it)}>
          <title>{ch.title ?? `${it.label} › ${ch.label}`}</title>
        </path>,
      )
      b = b1
    }
    a = a1
  }
  const inner = Math.round(r0 * 2 - 6)
  return (
    <div className={s.sunburst} style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={rest['aria-label']} onMouseLeave={() => onHover?.(null)}>
        {visible.length === 0 ? <circle cx={c} cy={c} r={(r0 + r3) / 2} fill="none" stroke="var(--surface-2)" strokeWidth={r3 - r0} /> : segs}
      </svg>
      <div className={s.sunCenter} role={onCenterClick ? 'button' : undefined} tabIndex={onCenterClick ? 0 : undefined}
        onKeyDown={(e) => onCenterClick && (e.key === 'Enter' || e.key === ' ') && onCenterClick()}
        style={{ width: inner, height: inner, left: c - inner / 2, top: c - inner / 2, cursor: onCenterClick ? 'pointer' : 'default' }}
        onClick={onCenterClick}>
        {center}
      </div>
    </div>
  )
}
