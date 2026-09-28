import clsx from 'clsx'
import { useRef } from 'react'
import { useElementWidth } from './hooks'
import s from './charts.module.css'

export interface StackSegment {
  key: string | number
  value: number
  color: string
  label?: string
}

export interface StackColumn {
  key: string
  /** Popisek pod sloupcem („Zář“). */
  label: string
  segments: StackSegment[]
}

export interface MonthlyStackProps {
  columns: StackColumn[]
  height: number
  /** Krátký formát osy a součtů („12 tis.“). */
  formatShort: (v: number) => string
  selectedKey?: string | null
  isDimmed?: (column: StackColumn, segment: StackSegment) => boolean
  onSegmentClick?: (column: StackColumn, segment: StackSegment) => void
  onColumnClick?: (column: StackColumn) => void
}

/** Skládané sloupce po měsících s mřížkou a přerušovanou čarou průměru („⌀ 58 tis.“). */
export function MonthlyStack({ columns, height, formatShort, selectedKey, isDimmed, onSegmentClick, onColumnClick }: MonthlyStackProps) {
  const ref = useRef<HTMLDivElement>(null)
  const W = useElementWidth(ref, 640)
  const H = height
  const totals = columns.map((c) => c.segments.reduce((a, x) => a + Math.max(0, x.value), 0))
  const n = Math.max(1, columns.length)
  const G = W > 400 ? 58 : 54
  const max = Math.max(1, ...totals) * 1.12
  const slot = (W - G) / n
  const bw = Math.min(W > 400 ? 56 : 30, slot * 0.62)
  const Y = (v: number) => H - (v / max) * H
  const avg = totals.reduce((a, b) => a + b, 0) / n
  const step = max / 4
  const grid = [1, 2, 3].map((k) => Y(step * k)).filter((y) => Math.abs(y - Y(avg)) > 14)

  return (
    <div className={s.stack}>
      <div ref={ref} className={s.stackPlot}>
        <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} style={{ overflow: 'visible' }} role="img" aria-label="Výdaje po měsících">
          {grid.map((y) => <line key={y} x1={G} x2={W} y1={y} y2={y} stroke="var(--line)" strokeWidth={1} />)}
          {columns.map((c, i) => {
            let cum = 0
            const x = G + i * slot + (slot - bw) / 2
            return c.segments.map((seg) => {
              if (seg.value <= 0) return null
              const y0 = Y(cum)
              const y1 = Y(cum + seg.value)
              cum += seg.value
              const dim = (selectedKey != null && selectedKey !== c.key) || isDimmed?.(c, seg)
              return (
                <rect key={`${c.key}-${seg.key}`} x={x} y={y1} width={bw} height={Math.max(0, y0 - y1)} className={s.bar}
                  style={{ fill: seg.color, opacity: dim ? 0.35 : 1, cursor: onSegmentClick ? 'pointer' : 'default' }}
                  onClick={() => onSegmentClick?.(c, seg)}>
                  <title>{`${seg.label ? `${seg.label} · ` : ''}${formatShort(seg.value)}`}</title>
                </rect>
              )
            })
          })}
          <line x1={G} x2={W} y1={Y(avg)} y2={Y(avg)} strokeDasharray="5 4" stroke="var(--ink)" strokeWidth={1.5} />
        </svg>
        {grid.map((y) => <span key={y} className={s.axisLabel} style={{ top: `${(y / H) * 100}%` }}>{formatShort(((H - y) / H) * max)}</span>)}
        <span className={clsx(s.axisLabel, s.avgLabel)} style={{ top: `${(Y(avg) / H) * 100}%` }}>⌀ {formatShort(avg)}</span>
      </div>
      <div className={s.stackMonths} style={{ paddingLeft: `${(G / W) * 100}%` }}>
        {columns.map((c, i) => {
          const on = selectedKey === c.key
          return (
            <button key={c.key} type="button" className={clsx(s.stackMonth, on && s.stackMonthOn)} onClick={() => onColumnClick?.(c)}>
              <span className={s.stackMonthName}>{c.label}</span>
              <span className={s.stackMonthTotal}>{formatShort(totals[i])}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
