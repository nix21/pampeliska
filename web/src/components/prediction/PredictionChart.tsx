import clsx from 'clsx'
import { num } from '../../lib/format'
import { balanceAt, kts, monthDiff, monthInfo, type PlanMonth, type Prediction } from '../../lib/prediction'
import s from './prediction.module.css'

export interface ChartModel {
  data: Prediction
  /** Počet zobrazených měsíců skutečnosti (0 nebo 6) */
  P: number
  /** Vybraný měsíc: −P…−1 skutečnost, 0…H−1 predikce */
  sel: number
  reserve: number
  compare: boolean
  hidden: boolean
  plan?: { start: number; savedMonth: string; months: PlanMonth[] } | null
  onPick: (i: number) => void
}

/**
 * Graf zůstatku: šedé pozadí = skutečnost, plná čára = scénář s pásmem nejistoty, čárkovaně výchozí predikce, tečkovaně uložená
 * predikce, červeně rezerva. Kliknutím na sloupec se vybere měsíc.
 */
export function PredictionChart({ m, height = 240, mobile }: { m: ChartModel; height?: number; mobile?: boolean }) {
  const { data, P, sel, reserve: R, compare, hidden, plan } = m
  const S = data.months
  const H = S.length
  const N = P + H
  const M0 = S[0].month
  const W = 700
  const top = 14
  const ph = height - 40
  const startBal = data.start

  const pastVals = P ? Array.from({ length: P + 1 }, (_, k) => balanceAt(data, -P - 1 + k)) : []
  const planIdx = plan ? plan.months.map((pm) => ({ i: monthDiff(M0, pm.month), b: pm.balance })).filter((x) => x.i >= -P && x.i < H) : []
  const all = [
    ...S.map((p) => p.balance + p.sigma), ...S.map((p) => p.balance - p.sigma), ...(compare ? S.map((p) => p.baseBalance) : []),
    startBal, R, ...pastVals, ...planIdx.map((x) => x.b),
  ]
  let mn = Math.min(...all)
  let mx = Math.max(...all)
  const pad = (mx - mn) * 0.08 || 10000
  mn -= pad
  mx += pad
  const X = (i: number) => ((i + P + 0.5) / N) * W
  const tX = (P / N) * W
  const Y = (v: number) => top + ((mx - v) / (mx - mn)) * ph
  const f = (n: number) => n.toFixed(1)
  const path = (vals: number[]) => `M${f(tX)} ${f(Y(startBal))}${vals.map((v, i) => `L${f(X(i))} ${f(Y(v))}`).join('')}`
  const up = S.map((p, i) => `${f(X(i))} ${f(Y(p.balance + p.sigma))}`)
  const dn = S.map((p, i) => `${f(X(i))} ${f(Y(p.balance - p.sigma))}`).reverse()
  const band = `M${f(tX)} ${f(Y(startBal))} L${up.join(' L')} L${dn.join(' L')}Z`
  let real = ''
  if (P) {
    real = `M0 ${f(Y(balanceAt(data, -P - 1)))}`
    for (let i = -P; i < 0; i++) real += `L${f(X(i))} ${f(Y(balanceAt(data, i)))}`
    real += `L${f(tX)} ${f(Y(startBal))}`
  }
  let snapLine = ''
  if (plan && planIdx.length) {
    const si = monthDiff(M0, plan.savedMonth)
    snapLine = si >= -P ? `M${f(((si + P) / N) * W)} ${f(Y(plan.start))}` : ''
    snapLine += planIdx.map((x, k) => `${k || snapLine ? 'L' : 'M'}${f(X(x.i))} ${f(Y(x.b))}`).join('')
  }
  const rng = mx - mn
  const step = [10000, 20000, 25000, 50000, 100000, 200000, 250000, 500000, 1000000].find((st) => rng / st <= 5) ?? 2000000
  const grid: { y: number; label: string }[] = []
  for (let v = Math.ceil(mn / step) * step; v < mx; v += step) {
    const y = Y(v)
    if (y > 8 && y < height - 8) grid.push({ y, label: hidden ? '•••' : `${num(v / 1000)} tis.` })
  }
  const resY = Math.max(0, Math.min(height, Y(R)))
  const ones = (i: number) => (i < 0 ? data.history[data.history.length + i]?.ones ?? [] : data.oneOffs.filter((o) => o.month === S[i].month && !o.skipped))
  const marks: { left: string; accent: boolean; title: string }[] = []
  for (let i = -P; i < H; i++) {
    const os = ones(i)
    if (os.length) marks.push({ left: `${(X(i) / W) * 100}%`, accent: i >= 0 && os.some((o) => 'kind' in o && o.kind === 'scenario'), title: os.map((o) => o.name).join(', ') })
  }
  const cols = Array.from({ length: N }, (_, j) => j - P)

  return (
    <>
      <div className={s.chart} style={{ height }}>
        <svg width="100%" height={height} viewBox={`0 0 ${W} ${height}`} preserveAspectRatio="none" className={s.chartSvg} aria-hidden>
          {P > 0 && <rect x="0" y="0" width={tX} height={height} fill="var(--surface-2)" />}
          {!mobile && grid.map((g) => <line key={g.y} x1="0" x2={W} y1={g.y} y2={g.y} stroke="var(--line)" strokeWidth="1" vectorEffect="non-scaling-stroke" />)}
          <rect x={((sel + P) / N) * W} y="0" width={W / N} height={height} fill="color-mix(in oklch, var(--accent) 14%, transparent)" />
          <rect x="0" y={resY} width={W} height={height - resY} fill="color-mix(in oklch, var(--neg) 7%, transparent)" />
          <line x1="0" x2={W} y1={resY} y2={resY} strokeDasharray="5 4" stroke="var(--neg)" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
          <path d={band} fill="color-mix(in oklch, var(--chart-line) 7%, transparent)" />
          {compare && <path d={path(S.map((p) => p.baseBalance))} fill="none" strokeDasharray="6 5" stroke="var(--ink-3)" strokeWidth="2" vectorEffect="non-scaling-stroke" />}
          <path d={path(S.map((p) => p.balance))} fill="none" stroke="var(--chart-line)" strokeWidth={mobile ? 3 : 2.5} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
          {P > 0 && (
            <>
              <path d={real} fill="none" stroke="var(--chart-line)" strokeWidth={mobile ? 3 : 2.5} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
              <line x1={tX} x2={tX} y1="0" y2={height} stroke="var(--ink-3)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
            </>
          )}
          {snapLine && <path d={snapLine} fill="none" strokeDasharray="0.5 6" strokeLinecap="round" stroke="var(--c1)" strokeWidth="3.5" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />}
        </svg>
        {!mobile && grid.map((g) => <span key={g.y} className={s.gridLabel} style={{ top: g.y - 15 }}>{g.label}</span>)}
        {!mobile && marks.map((k) => <span key={k.left} title={k.title} className={clsx(s.mark, k.accent && s.markAccent)} style={{ left: k.left }} />)}
        {!mobile && cols.map((i) => {
          const b = balanceAt(data, i)
          const on = i === sel
          const low = i >= 0 && b < R
          const size = on ? 14 : N > 12 ? 7 : 9
          return (
            <span key={i} className={s.dot} style={{
              left: `${(X(i) / W) * 100}%`, top: Y(b), width: size, height: size,
              background: low ? 'var(--neg)' : on ? 'var(--accent)' : 'var(--chart-line)',
            }} />
          )
        })}
        {P > 0 && !mobile && <span className={s.today} style={{ left: `${(tX / W) * 100}%` }}>dnes</span>}
        <div className={s.hitCols}>
          {cols.map((i) => {
            const mi = monthInfo(i < 0 ? data.history[data.history.length + i].month : S[i].month)
            return <button key={i} type="button" aria-label={mi.full} title={`${mi.full}${i < 0 ? ' · skutečnost' : ''}`} onClick={() => m.onPick(i)} />
          })}
        </div>
      </div>

      {mobile ? (
        <div className={s.chips}>
          {cols.map((i) => {
            const mi = monthInfo(i < 0 ? data.history[data.history.length + i].month : S[i].month)
            const b = balanceAt(data, i)
            const on = i === sel
            return (
              <button key={i} type="button" className={clsx(s.chip, on && s.chipOn, i < 0 && s.chipPast)} onClick={() => m.onPick(i)}>
                <span style={{ fontWeight: on ? 800 : 600 }}>{mi.short}</span>
                <span className={s.chipVal} style={{ color: i >= 0 && b < R ? 'var(--neg)' : undefined }}>{kts(b, hidden)}</span>
              </button>
            )
          })}
        </div>
      ) : (
        <div className={s.cols}>
          {cols.map((i, j) => {
            const mi = monthInfo(i < 0 ? data.history[data.history.length + i].month : S[i].month)
            const b = balanceAt(data, i)
            const on = i === sel
            const low = i >= 0 && b < R
            return (
              <button key={i} type="button" className={clsx(s.col, on && s.colOn)} onClick={() => m.onPick(i)}>
                <span className={s.colLabel}>{N > 24 && j % 3 !== 0 ? '·' : mi.short}</span>
                {N <= 12 && (
                  <span className={s.colVal} style={{ color: low ? 'var(--neg)' : i < 0 ? 'var(--ink-3)' : on ? 'var(--ink)' : 'var(--ink-2)' }}>{kts(b, hidden)}</span>
                )}
                {N <= 12 && (j === 0 || mi.jan) && <span className={s.colYear}>{mi.y}</span>}
              </button>
            )
          })}
        </div>
      )}
    </>
  )
}
