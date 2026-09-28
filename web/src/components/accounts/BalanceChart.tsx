import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { addDays, dateShort, parseIso, toIso } from '../../lib/format'
import type { AccountForecast } from '../../lib/household'
import { useMoney } from '../common'
import s from './accounts.module.css'

interface Props {
  /** Týdenní zůstatky (13 bodů, poslední = dnes). */
  past: number[]
  today: string
  forecast?: AccountForecast
  /** Korekce zůstatku v zobrazeném období. */
  corrections: { date: string; amount: number }[]
  limit?: number
  currency: string
  height?: number
}

const dayDiff = (a: string, b: string) => Math.round((parseIso(a).getTime() - parseIso(b).getTime()) / 86_400_000)

/** Vývoj zůstatku (plná čára) a výhled pravidelných plateb (čárkovaně, schodovitě) s limitem a korekcemi. */
export function BalanceChart({ past, today, forecast, corrections, limit, currency, height = 200 }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const [w, setW] = useState(0)
  const fmt = useMoney()
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    setW(el.clientWidth)
    const ro = new ResizeObserver(([e]) => setW(e.contentRect.width))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const g = useMemo(() => {
    const H = height
    const pastDays = Math.max(7, 7 * (past.length - 1))
    const futDays = forecast ? forecast.horizonDays : 0
    const total = pastDays + futDays
    const x = (d: number) => ((d + pastDays) / total) * w
    const now = past.length ? past[past.length - 1] : forecast?.now ?? 0
    const events = forecast?.events ?? []
    const values = [...past, now, ...events.map((e) => e.balanceAfter)]
    if (limit != null) values.push(limit)
    let lo = Math.min(...values)
    let hi = Math.max(...values)
    const span = hi - lo || Math.max(1, Math.abs(hi) * 0.2)
    lo -= span * 0.12
    hi += span * 0.08
    const top = 6
    const bottom = 4
    const y = (v: number) => top + ((hi - v) / (hi - lo)) * (H - top - bottom)

    const pts = past.map((v, i) => [x(-pastDays + 7 * i), y(v)] as const)
    const pastPath = pts.map(([px, py], i) => `${i ? 'L' : 'M'}${px.toFixed(1)} ${py.toFixed(1)}`).join('')
    const area = pts.length ? `${pastPath}L${x(0).toFixed(1)} ${H}L${pts[0][0].toFixed(1)} ${H}Z` : ''
    let fut = ''
    if (forecast) {
      fut = `M${x(0).toFixed(1)} ${y(now).toFixed(1)}`
      for (const e of events) fut += `H${x(dayDiff(e.date, today)).toFixed(1)}V${y(e.balanceAfter).toFixed(1)}`
      fut += `H${x(futDays).toFixed(1)}`
    }
    // Hodnota v minulosti lineárně mezi týdenními body
    const pastAt = (d: number) => {
      const i = (d + pastDays) / 7
      const a = Math.max(0, Math.min(past.length - 1, Math.floor(i)))
      const b = Math.min(past.length - 1, a + 1)
      const t = Math.max(0, Math.min(1, i - a))
      return past[a] + (past[b] - past[a]) * t
    }
    const kors = corrections
      .map((c) => ({ ...c, d: dayDiff(c.date, today) }))
      .filter((c) => c.d >= -pastDays && c.d <= 0)
      .map((c) => ({ ...c, cx: x(c.d), cy: y(pastAt(c.d)) }))
    const minPt = forecast?.low ? { cx: x(dayDiff(forecast.minDate, today)), cy: y(forecast.min) } : null

    // Popisky osy: začátek, první dny měsíců, dnes, konec
    const start = addDays(today, -pastDays)
    const labels: { pct: number; text: string; strong?: boolean; align: 'start' | 'center' | 'end' }[] = [{ pct: 0, text: dateShort(start), align: 'start' }]
    const todayPct = pastDays / total
    const sd = parseIso(start)
    for (let k = 1; k <= 4; k++) {
      const m = new Date(sd.getFullYear(), sd.getMonth() + k, 1)
      const iso = toIso(m)
      const pct = dayDiff(iso, start) / total
      // Jen první dny měsíců, které se nepřekrývají se začátkem ani s „dnes“
      if (pct > 0.1 && todayPct - pct > 0.1) labels.push({ pct, text: dateShort(iso), align: 'center' })
    }
    if (futDays > 0) {
      labels.push({ pct: todayPct, text: 'dnes', strong: true, align: 'center' })
      labels.push({ pct: 1, text: dateShort(addDays(today, futDays)), align: 'end' })
    } else labels.push({ pct: 1, text: 'dnes', strong: true, align: 'end' })
    const shown = labels

    return {
      H, x0: x(0), pastPath, area, fut, kors, minPt, shown,
      limitY: limit != null ? y(limit) : null,
    }
  }, [past, today, forecast, corrections, limit, height, w])

  return (
    <div className={s.chart}>
      <div ref={ref} style={{ position: 'relative', height }}>
        {w > 0 && (
          <svg width={w} height={g.H} viewBox={`0 0 ${w} ${g.H}`} style={{ overflow: 'visible' }} role="img"
            aria-label={`Vývoj zůstatku za 12 týdnů${forecast ? ' a výhled na 30 dní' : ''}`}>
            {forecast && <rect x={g.x0} y={0} width={Math.max(0, w - g.x0)} height={g.H} fill="var(--surface-2)" />}
            {g.limitY != null && (
              <>
                <rect x={0} y={g.limitY} width={w} height={Math.max(0, g.H - g.limitY)} fill="color-mix(in oklch, var(--neg) 10%, transparent)" />
                <line x1={0} x2={w} y1={g.limitY} y2={g.limitY} stroke="var(--neg)" strokeWidth={1} strokeDasharray="4 4" />
              </>
            )}
            <path d={g.area} fill="color-mix(in oklch, var(--ink) 7%, transparent)" />
            <path d={g.pastPath} fill="none" stroke="var(--ink)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
            {g.fut && <path d={g.fut} fill="none" stroke="var(--ink-3)" strokeWidth={2} strokeDasharray="5 4" />}
            {forecast && <line x1={g.x0} x2={g.x0} y1={0} y2={g.H} stroke="var(--ink-3)" strokeWidth={1} />}
            {g.kors.map((k, i) => (
              <g key={i}>
                <title>{`Korekce ${dateShort(k.date)}: ${fmt(k.amount, { currency, sign: true })}`}</title>
                <line x1={k.cx} x2={k.cx} y1={0} y2={g.H} stroke="var(--ink-2)" strokeWidth={1} strokeDasharray="3 3" />
                <rect x={k.cx - 4.5} y={k.cy - 4.5} width={9} height={9} transform={`rotate(45 ${k.cx} ${k.cy})`}
                  fill="var(--surface)" stroke="var(--ink)" strokeWidth={1.5} strokeDasharray="2 2" />
              </g>
            ))}
            {g.minPt && (
              <circle cx={g.minPt.cx} cy={g.minPt.cy} r={4.5} fill="var(--neg)" stroke="var(--surface)" strokeWidth={2}>
                <title>{`Nejnižší zůstatek ${fmt(forecast!.min, { currency })} · ${dateShort(forecast!.minDate)}`}</title>
              </circle>
            )}
          </svg>
        )}
      </div>
      <div className={s.chartAxis}>
        {g.shown.map((l) => (
          <span key={`${l.text}-${l.pct}`} style={{
            left: `${l.pct * 100}%`,
            transform: l.align === 'center' ? 'translateX(-50%)' : l.align === 'end' ? 'translateX(-100%)' : undefined,
            fontWeight: l.strong ? 700 : undefined, color: l.strong ? 'var(--ink-2)' : undefined,
          }}>{l.text}</span>
        ))}
      </div>
    </div>
  )
}
