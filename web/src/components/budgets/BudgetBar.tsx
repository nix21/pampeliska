import clsx from 'clsx'
import { ChevronLeft, ChevronRight, Calendar } from 'lucide-react'
import { statusMeta, monthTitle, shiftMonth, type BarModel, type BudgetStatus } from '../../lib/budgets'
import { commonStyles as chip } from '../common'
import { Popover, PopoverClose } from '../ui'
import s from './budgets.module.css'

/** Pruh čerpání: segmenty (utraceno, ostatní, rezervováno), značka limitu a tempa. */
export function BudgetBar({ model, height = 10, showLimit = true }: { model: BarModel; height?: number; showLimit?: boolean }) {
  const pct = (v: number) => `${Math.max(0, Math.min(100, (v / model.track) * 100))}%`
  return (
    <div className={clsx(s.bar, height >= 14 && s.barLg)} style={{ height, borderRadius: height >= 14 ? 999 : 9 }}>
      <div className={s.barFill}>
        {model.segs.map((g, i) => <span key={i} title={g.title} style={{ width: pct(g.value), background: g.color }} />)}
      </div>
      {showLimit && model.limit != null && model.limit < model.track && <span className={s.limitMark} style={{ left: pct(model.limit) }} />}
      {model.pace != null && <span className={s.paceMark} style={{ left: pct(model.pace) }} />}
    </div>
  )
}

export function StatusPill({ status, large }: { status: BudgetStatus; large?: boolean }) {
  const m = statusMeta[status]
  return <span className={clsx(s.status, large && s.statusLg)} style={{ color: m.fg, background: m.bg }}>{m.label}</span>
}

export function Legend() {
  return (
    <div className={s.legend} aria-hidden>
      <span><i className={s.legendHatch} />rezervováno</span>
      <span><i className={s.legendPace} />tempo měsíce</span>
    </div>
  )
}

/** Přepínač měsíce: aktuální a předchozí (budoucí ne). */
export function MonthSwitcher({ month, current, sub, onChange }: { month: string; current: string; sub: string; onChange: (m: string) => void }) {
  const choices = Array.from({ length: 12 }, (_, i) => shiftMonth(current, -i))
  return (
    <div className={s.month}>
      <button type="button" className={s.monthArrow} aria-label="Předchozí měsíc" onClick={() => onChange(shiftMonth(month, -1))}>
        <ChevronLeft size={16} />
      </button>
      <Popover width={300} trigger={
        <button type="button" className={s.monthButton}>
          <Calendar size={16} color="var(--ink-3)" />
          <span className={s.monthText}>
            <b>{monthTitle(month)}</b>
            <small>{sub}</small>
          </span>
        </button>
      }>
        <div className={s.monthChips}>
          {choices.map((m) => (
            <PopoverClose asChild key={m}>
              <button type="button" className={clsx(chip.chip, m === month && chip.chipOn)} onClick={() => onChange(m)}>{monthTitle(m)}</button>
            </PopoverClose>
          ))}
        </div>
      </Popover>
      <button type="button" className={s.monthArrow} aria-label="Další měsíc" disabled={month >= current} onClick={() => onChange(shiftMonth(month, 1))}>
        <ChevronRight size={16} />
      </button>
    </div>
  )
}
