import clsx from 'clsx'
import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react'
import { useState, type CSSProperties } from 'react'
import { money, type MoneyOptions } from '../lib/format'
import type { Institution } from '../lib/types'
import { compareLabel, currentPeriod, periodLabel, shiftPeriod, useUi, type MemberFilter, type Period } from '../state/ui'
import { Button, DateInput, Popover, PopoverClose, Segmented, Switch, tokenColor } from './ui'
import s from './common.module.css'

/** Částka s ohledem na „Skrýt částky“. */
export function Money({ value, className, style, ...opts }: MoneyOptions & { value: number | null | undefined; className?: string; style?: CSSProperties }) {
  const { hidden } = useUi()
  return <span className={clsx('num', className)} style={style}>{money(value, { hidden, ...opts })}</span>
}

export function useMoney() {
  const { hidden } = useUi()
  return (v: number | null | undefined, opts: MoneyOptions = {}) => money(v, { hidden, ...opts })
}

/** Všichni / Vašek / Míša */
export function MemberSwitch({ full }: { full?: boolean }) {
  const { household, member, setMember } = useUi()
  if (household.members.length < 2) return null
  return (
    <Segmented<string>
      aria-label="Člen"
      full={full}
      value={String(member)}
      onChange={(v) => setMember(v === 'all' ? 'all' : (Number(v) as MemberFilter))}
      options={[
        { value: 'all', label: 'Všichni' },
        ...household.members.map((m) => ({
          value: String(m.id),
          label: (
            <>
              <span className={s.miniAvatar} style={{ background: tokenColor(m.colorToken) }}>{m.initials}</span>
              {m.name}
            </>
          ),
        })),
      ]}
    />
  )
}

const KINDS: { value: Period['kind']; label: string }[] = [
  { value: 'Month', label: 'Měsíc' },
  { value: 'Quarter', label: 'Čtvrtletí' },
  { value: 'Year', label: 'Rok' },
  { value: 'Custom', label: 'Vlastní' },
]

/** Výběr období: šipky ‹ › a popover s druhem období, seznamem a porovnáním. */
export function PeriodPicker({ allowCompare = true, compact }: { allowCompare?: boolean; compact?: boolean }) {
  const { period, setPeriod, compare, setCompare, household } = useUi()
  const [kind, setKind] = useState(period.kind)
  const nowKey = currentPeriod(period.kind === 'Custom' ? 'Month' : period.kind, household.today).value
  const atEnd = period.kind !== 'Custom' && period.value >= nowKey
  const choices = (() => {
    if (kind === 'Custom') return []
    let p = currentPeriod(kind, household.today)
    const n = kind === 'Month' ? 12 : kind === 'Quarter' ? 6 : 4
    const list: Period[] = []
    for (let i = 0; i < n; i++, p = shiftPeriod(p, -1)) list.push(p)
    return list
  })()
  const [from, setFrom] = useState<string | null>(period.kind === 'Custom' ? period.value.split('..')[0] : null)
  const [to, setTo] = useState<string | null>(period.kind === 'Custom' ? period.value.split('..')[1] : null)

  return (
    <div className={s.period}>
      <button type="button" className={s.periodArrow} aria-label="Předchozí období" onClick={() => setPeriod(shiftPeriod(period, -1))}>
        <ChevronLeft size={16} />
      </button>
      <Popover
        width={330}
        trigger={
          <button type="button" className={s.periodButton}>
            {!compact && <Calendar size={16} color="var(--ink-3)" />}
            <span style={{ display: 'flex', flexDirection: 'column', alignItems: compact ? 'center' : 'flex-start', flex: 1 }}>
              <span style={{ fontSize: 14, fontWeight: 700 }}>{periodLabel(period)}</span>
              <span style={{ fontSize: 11, color: 'var(--ink-3)' }}>{allowCompare && compare ? compareLabel(period) : 'bez porovnání'}</span>
            </span>
          </button>
        }
      >
        <div className="col" style={{ gap: 12 }}>
          <Segmented full size="sm" value={kind} onChange={setKind} options={KINDS} />
          {kind !== 'Custom' ? (
            <div className={s.periodChips}>
              {choices.map((p) => (
                <PopoverClose asChild key={p.value}>
                  <button type="button" className={clsx(s.chip, p.value === period.value && p.kind === period.kind && s.chipOn)} onClick={() => setPeriod(p)}>
                    {periodLabel(p)}
                  </button>
                </PopoverClose>
              ))}
            </div>
          ) : (
            <div className="row">
              <DateInput value={from} onChange={setFrom} aria-label="Od" />
              <span className="faint">–</span>
              <DateInput value={to} onChange={setTo} aria-label="Do" />
            </div>
          )}
          {allowCompare && (
            <label className="row" style={{ justifyContent: 'space-between', fontSize: 13, fontWeight: 600 }}>
              Porovnat s předchozím obdobím
              <Switch checked={compare} onChange={setCompare} />
            </label>
          )}
          {kind === 'Custom' && (
            <PopoverClose asChild>
              <Button variant="dark" disabled={!from || !to || from > to} onClick={() => from && to && setPeriod({ kind: 'Custom', value: `${from}..${to}` })}>
                Hotovo
              </Button>
            </PopoverClose>
          )}
        </div>
      </Popover>
      <button type="button" className={s.periodArrow} aria-label="Další období" disabled={atEnd} onClick={() => setPeriod(shiftPeriod(period, 1))}>
        <ChevronRight size={16} />
      </button>
    </div>
  )
}

/** Přepínač „Jen potvrzené“. */
export function ConfirmedToggle() {
  const { confirmedOnly, setConfirmedOnly } = useUi()
  return (
    <button type="button" className={clsx(s.chip, confirmedOnly && s.chipOn)} onClick={() => setConfirmedOnly(!confirmedOnly)} aria-pressed={confirmedOnly}>
      Jen potvrzené
    </button>
  )
}

/** Značka banky: zkratka na barvě instituce. */
export function InstitutionBadge({ institution, size = 36 }: { institution: Pick<Institution, 'abbrev' | 'color'>; size?: number }) {
  return (
    <span className={s.bank} style={{ width: size, height: size, background: institution.color, fontSize: institution.abbrev.length > 3 ? 9 : size > 32 ? 11 : 10 }}>
      {institution.abbrev}
    </span>
  )
}

/** Tečka barvy (kategorie, člen). */
export function Dot({ color, size = 10 }: { color: string; size?: number }) {
  return <span style={{ width: size, height: size, borderRadius: size, background: tokenColor(color), flexShrink: 0, display: 'inline-block' }} />
}

/** Malý spojnicový graf zůstatku. */
export function Sparkline({ values, width = 90, height = 28, color }: { values: number[]; width?: number; height?: number; color?: string }) {
  if (values.length < 2) return <span style={{ width }} />
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min || 1
  const pts = values.map((v, i) => `${((i / (values.length - 1)) * width).toFixed(1)},${(height - 2 - ((v - min) / span) * (height - 4)).toFixed(1)}`)
  const up = values[values.length - 1] >= values[0]
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden>
      <polyline points={pts.join(' ')} fill="none" stroke={color ?? (up ? 'var(--pos)' : 'var(--ink-3)')} strokeWidth={1.75} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  )
}
export { s as commonStyles }
