import { useEffect, useId, useRef, useState } from 'react'
import s from './budgets.module.css'

export interface ChartTick {
  /** Pozice 0–1 na ose x. */
  at: number
  label: string
}

/**
 * Graf „Čerpání v čase“: kumulativní útrata, vodorovná čára limitu, čárkovaná diagonála rovnoměrného tempa,
 * čárkovaná projekce do konce období, šrafovaný obdélník rezervací a tečka „dnes“.
 * `points` = [pozice 0–1, kumulativní částka]; prázdné pole = bez průběhu (jen tečka a projekce).
 */
export function SpendChart({ points, now, spent, limit, projection, reserved, color, lineColor, height = 150, ticks, nowLabel, finished }: {
  points: [number, number][]
  now: number
  spent: number
  limit: number | null
  projection: number | null
  reserved: number
  color: string
  lineColor: string
  height?: number
  ticks: ChartTick[]
  nowLabel: string
  finished: boolean
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [w, setW] = useState(360)
  const hatchId = useId().replace(/:/g, '')
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setW(Math.max(120, Math.round(e.contentRect.width))))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const H = height
  const bottom = H - 4
  const maxCum = points.reduce((m, p) => Math.max(m, p[1]), 0)
  const mx = Math.max(limit ?? 0, projection ?? 0, spent + reserved, maxCum, 1) * 1.08
  const X = (f: number) => f * w
  const Y = (v: number) => bottom - (v / mx) * (H - 10)
  const f = (n: number) => n.toFixed(1)

  const line = points.length ? `M0 ${f(bottom)}` + points.map(([x, v]) => `L${f(X(x))} ${f(Y(v))}`).join('') : ''
  const lastX = points.length ? X(points[points.length - 1][0]) : X(now)
  const area = line ? `${line}L${f(lastX)} ${H}L0 ${H}Z` : ''
  const nowX = X(now)
  const nowY = Y(spent)
  const limY = limit != null ? Y(limit) : null
  const showProj = !finished && projection != null && now < 1

  // Popisky osy – vynechat ty, které by kolidovaly s „dnes“
  const shown = ticks.filter((t) => Math.abs(t.at - now) * w > 34 && (1 - t.at) * w > 20)

  return (
    <div className={s.chart} ref={ref}>
      <svg width={w} height={H} viewBox={`0 0 ${w} ${H}`} role="img" aria-label="Čerpání v čase">
        <defs>
          <pattern id={hatchId} width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="2" height="5" style={{ fill: 'var(--ink-3)' }} />
          </pattern>
        </defs>
        {limY != null && <line x1={0} x2={w} y1={limY} y2={limY} style={{ stroke: 'var(--ink-3)', strokeWidth: 1 }} />}
        {limY != null && <line x1={0} y1={bottom} x2={w} y2={limY} strokeDasharray="3 4" style={{ stroke: 'var(--ink-3)', strokeWidth: 1.5 }} />}
        {area && <path d={area} style={{ fill: `color-mix(in oklch, ${color} 18%, transparent)` }} />}
        {line && <path d={line} fill="none" strokeLinejoin="round" strokeLinecap="round" style={{ stroke: lineColor, strokeWidth: 2.5 }} />}
        {showProj && <path d={`M${f(nowX)} ${f(nowY)}L${w} ${f(Y(projection!))}`} fill="none" strokeDasharray="5 4" style={{ stroke: lineColor, strokeWidth: 2 }} />}
        {reserved > 0 && !finished && (
          <rect x={nowX} y={Y(spent + reserved)} width={Math.max(0, w - nowX)} height={Math.max(0, nowY - Y(spent + reserved))} fill={`url(#${hatchId})`} opacity={0.7} />
        )}
        <circle cx={nowX} cy={nowY} r={4} style={{ fill: lineColor, stroke: 'var(--surface)', strokeWidth: 2 }} />
      </svg>
      <div className={s.axis}>
        {shown.map((t) => <span key={t.label} style={{ left: `${t.at * 100}%` }}>{t.label}</span>)}
        <span className={now > 0.94 ? `${s.axisNow} ${s.axisEnd}` : s.axisNow} style={{ left: `${now * 100}%` }}>{nowLabel}</span>
      </div>
    </div>
  )
}
