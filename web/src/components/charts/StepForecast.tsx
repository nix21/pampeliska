import { dateShort } from '../../lib/format'

export interface StepPoint {
  /** ISO datum */
  date: string
  balance: number
}

/**
 * Schodový graf výhledu zůstatku: čára po skocích, pásmo pod limitem, značka minima, značky plateb na ose.
 * Souřadnice ve viewBoxu 460×170, škáluje se na šířku kontejneru.
 */
export function StepForecast({ start, points, limit, from, days, height = 170, compact }: {
  start: number
  points: StepPoint[]
  limit?: number | null
  from: string
  days: number
  height?: number
  compact?: boolean
}) {
  const W = 460
  const H = 170
  const vals = [start, ...points.map((p) => p.balance), ...(limit != null ? [limit] : [])]
  const mn = Math.min(0, ...vals)
  const mx = Math.max(...vals) * 1.08 || 1
  const t0 = Date.parse(from)
  const X = (iso: string) => Math.max(0, Math.min(W, ((Date.parse(iso) - t0) / 86_400_000 / days) * W))
  const Y = (v: number) => 160 - ((v - mn) / (mx - mn || 1)) * 150
  let line = `M0 ${Y(start).toFixed(1)}`
  let min = { x: 0, y: Y(start), v: start }
  for (const p of points) {
    const x = X(p.date).toFixed(1)
    line += `H${x}V${Y(p.balance).toFixed(1)}`
    if (p.balance < min.v) min = { x: X(p.date), y: Y(p.balance), v: p.balance }
  }
  line += `H${W}`
  const low = limit != null && min.v < limit
  const thY = limit != null ? Y(limit) : null
  return (
    <svg width="100%" height={height} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ display: 'block', overflow: 'visible' }} role="img"
      aria-label="Výhled zůstatku">
      {thY != null && !compact && <rect x={0} y={thY} width={W} height={Math.max(0, H - thY)} style={{ fill: 'color-mix(in oklch, var(--neg) 10%, transparent)' }} />}
      {thY != null && <line x1={0} x2={W} y1={thY} y2={thY} strokeDasharray="4 4" style={{ stroke: 'var(--neg)', strokeWidth: compact ? 1.5 : 1 }} vectorEffect="non-scaling-stroke" />}
      {!compact && <path d={`${line}V${H}H0Z`} style={{ fill: 'color-mix(in oklch, var(--chart-line) 10%, transparent)' }} />}
      <path d={line} fill="none" style={{ stroke: 'var(--chart-line)', strokeWidth: compact ? 3 : 2 }} vectorEffect="non-scaling-stroke" />
      {!compact && points.map((p, i) => (
        <line key={i} x1={X(p.date)} x2={X(p.date)} y1={164} y2={170} style={{ stroke: 'var(--ink-3)', strokeWidth: 2 }} vectorEffect="non-scaling-stroke" />
      ))}
      {low && <circle cx={min.x} cy={min.y} r={compact ? 6 : 4.5} style={{ fill: 'var(--neg)', stroke: 'var(--surface)', strokeWidth: 2 }} vectorEffect="non-scaling-stroke" />}
    </svg>
  )
}

/** Popisky osy výhledu: dnes, 1/3, 2/3, konec. */
export function forecastLabels(from: string, days: number) {
  return [0, Math.round(days / 3), Math.round((days * 2) / 3), days].map((o) => {
    if (o === 0) return 'dnes'
    const d = new Date(Date.parse(from) + o * 86_400_000)
    return dateShort(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`)
  })
}
