import clsx from 'clsx'
import { ChevronRight, Plus } from 'lucide-react'
import { useState, type KeyboardEvent } from 'react'
import { barModel, fromMonth, shareOf, shiftMonth, useLineTree, type BudgetLine, type ColorBy } from '../../lib/budgets'
import { useCategories } from '../../lib/categories'
import { dateShort, num } from '../../lib/format'
import type { Member } from '../../lib/types'
import { useMoney } from '../common'
import { Button } from '../ui'
import { BudgetBar, StatusPill } from './BudgetBar'
import s from './budgets.module.css'

export interface TableProps {
  lines: BudgetLine[]
  selected: string | null
  onSelect: (key: string) => void
  colorBy: ColorBy
  member: Member | null
  pace: number
  month: string
  closed: boolean
}

function useLineText(member: Member | null) {
  const kc = useMoney()
  return {
    kc,
    amounts: (l: BudgetLine, suffix = '') => {
      const { own } = shareOf(l, member != null)
      const lim = l.limit != null && l.limit > 0 ? ` / ${kc(l.limit)}` : ''
      return (own !== l.spent ? `${kc(own)} z ${kc(l.spent)}` : kc(l.spent)) + lim + (lim ? suffix : '')
    },
    free: (l: BudgetLine) => (l.limit != null && l.limit > 0 ? l.free : null),
  }
}

const onKey = (fn: () => void) => (e: KeyboardEvent) => {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault()
    fn()
  }
}

const freeColor = (v: number | null) => (v == null ? 'var(--ink-3)' : v < 0 ? 'var(--neg)' : 'var(--ink)')

/** Tabulka měsíčních rozpočtů se stromem kategorií (desktop). */
export function MonthlyTable({ lines, selected, onSelect, colorBy, member, pace, month, closed, onAdd }: TableProps & { onAdd: () => void }) {
  const { colorOf } = useCategories()
  const { kc, amounts, free } = useLineText(member)
  const { tops, kids } = useLineTree(lines)
  const [collapsed, setCollapsed] = useState<Set<number>>(() => new Set())
  const toggle = (id: number) => setCollapsed((c) => {
    const n = new Set(c)
    if (n.has(id)) n.delete(id)
    else n.add(id)
    return n
  })

  const rows: { l: BudgetLine; depth: number }[] = []
  const visit = (list: BudgetLine[], depth: number) => list.forEach((l) => {
    rows.push({ l, depth })
    if (kids.has(l.categoryId) && !collapsed.has(l.categoryId)) visit(kids.get(l.categoryId)!, depth + 1)
  })
  visit(tops, 0)

  return (
    <section className={s.table} aria-label="Měsíční rozpočty">
      <div className={clsx(s.grid, s.thead)}>
        <span>Měsíční rozpočty</span><span>Čerpání</span><span className={s.right}>Zbývá volně</span><span>Stav</span>
      </div>
      {rows.map(({ l, depth }) => {
        const key = `m${l.categoryId}`
        const hasKids = kids.has(l.categoryId)
        const open = hasKids && !collapsed.has(l.categoryId)
        const color = colorOf(l.categoryId)
        const notes: string[] = []
        if (hasKids) {
          notes.push(l.ownLimit != null
            ? l.childSum > 0 && l.childSum !== l.ownLimit ? `vlastní limit · zbytek ${kc(l.ownLimit - l.childSum)}` : 'vlastní limit'
            : 'součet podkategorií')
        }
        if (l.personal && member) notes.push(`osobní limit · ${member.name}`)
        if (l.carriedIn > 0 && !closed) notes.push(`+${kc(l.carriedIn)} přeneseno ${fromMonth(shiftMonth(month, -1))}`)
        if (l.reserved > 0) notes.push(`rezervace ${kc(l.reserved)}`)
        const fr = free(l)
        return (
          <div key={key} role="button" tabIndex={0} aria-pressed={selected === key}
            className={clsx(s.grid, s.row, depth ? s.rowSub : s.rowTop, selected === key && s.rowOn)}
            onClick={() => onSelect(key)} onKeyDown={onKey(() => onSelect(key))}>
            <div className={s.nameCell} style={{ paddingLeft: depth * 22 }}>
              <button type="button" className={clsx(s.chev, open && s.chevOpen, !hasKids && s.chevHidden)} tabIndex={hasKids ? 0 : -1}
                aria-label={open ? 'Sbalit' : 'Rozbalit'} aria-expanded={hasKids ? open : undefined}
                onClick={(e) => { e.stopPropagation(); toggle(l.categoryId) }} onKeyDown={(e) => e.stopPropagation()}>
                <ChevronRight size={16} />
              </button>
              <span className={s.dot} style={{ width: depth ? 8 : 11, height: depth ? 8 : 11, background: color }} />
              <div className={s.names}>
                <span className={s.name} style={{ fontSize: depth ? 13 : 14, fontWeight: depth ? 500 : 700 }}>{l.name}</span>
                {notes.length > 0 && <span className={s.note}>{notes.join(' · ')}</span>}
              </div>
            </div>
            <div className={s.barCell}>
              <BudgetBar height={depth ? 8 : 10} model={barModel(l, { color, colorBy, memberSelected: member != null, pace, othersLabel: 'ostatní členové' })} />
              <span className={s.amounts}>{amounts(l)}</span>
            </div>
            <span className={s.free} style={{ color: freeColor(fr) }}>{fr == null ? '—' : kc(fr)}</span>
            <StatusPill status={l.status} />
          </div>
        )
      })}
      <div className={s.addRow}>
        <Button variant="ghost" size="sm" icon={<Plus size={15} />} onClick={onAdd}>Přidat rozpočet</Button>
      </div>
    </section>
  )
}

/** Roční rozpočty (desktop). */
export function YearlyTable({ lines, selected, onSelect, colorBy, member, pace }: TableProps) {
  const { colorOf, byId } = useCategories()
  const { kc, amounts, free } = useLineText(member)
  return (
    <section className={s.table} aria-label="Roční rozpočty">
      <div className={s.yearHead}><b>Roční rozpočty</b><span>pro nepravidelné výdaje · tempo roku {num(pace)} %</span></div>
      {lines.map((l) => {
        const key = `y${l.categoryId}`
        const color = colorOf(l.categoryId)
        const parent = l.parentId != null ? byId.get(l.parentId)?.name : undefined
        const next = [...l.reservations].sort((a, b) => a.date.localeCompare(b.date))[0]
        const notes = [parent, l.personal && member ? `osobní limit · ${member.name}` : '', next ? `${next.name} ${dateShort(next.date)}` : '',
          l.reserved > 0 ? `rezervace ${kc(l.reserved)}` : ''].filter(Boolean)
        const fr = free(l)
        return (
          <div key={key} role="button" tabIndex={0} aria-pressed={selected === key}
            className={clsx(s.grid, s.row, s.rowYear, selected === key && s.rowOn)}
            onClick={() => onSelect(key)} onKeyDown={onKey(() => onSelect(key))}>
            <div className={s.nameCell} style={{ gap: 10 }}>
              <span className={s.dot} style={{ width: 10, height: 10, background: color }} />
              <div className={s.names}>
                <span className={s.name} style={{ fontSize: 14, fontWeight: 700 }}>{l.name}</span>
                {notes.length > 0 && <span className={s.note}>{notes.join(' · ')}</span>}
              </div>
            </div>
            <div className={s.barCell}>
              <BudgetBar model={barModel(l, { color, colorBy, memberSelected: member != null, pace, othersLabel: 'ostatní členové' })} showLimit={false} />
              <span className={s.amounts}>{amounts(l, ' za rok')}</span>
            </div>
            <span className={s.free} style={{ color: freeColor(fr) }}>{fr == null ? '—' : kc(fr)}</span>
            <StatusPill status={l.status} />
          </div>
        )
      })}
    </section>
  )
}

/** Mobilní seznam: jen hlavní kategorie, detail po klepnutí. */
export function MobileMonthly({ lines, onSelect, colorBy, member, pace }: TableProps) {
  const { colorOf } = useCategories()
  const { kc, amounts, free } = useLineText(member)
  const { tops } = useLineTree(lines)
  return (
    <div className={s.table}>
      {tops.map((l) => {
        const color = colorOf(l.categoryId)
        const fr = free(l)
        return (
          <div key={l.categoryId} role="button" tabIndex={0} className={s.mRow} onClick={() => onSelect(`m${l.categoryId}`)} onKeyDown={onKey(() => onSelect(`m${l.categoryId}`))}>
            <div className={s.mRowHead}>
              <span className={s.dot} style={{ width: 10, height: 10, background: color }} />
              <span className={s.name}>{l.name}</span>
              <StatusPill status={l.status} />
            </div>
            <BudgetBar height={12} showLimit={false} model={barModel(l, { color, colorBy, memberSelected: member != null, pace, othersLabel: 'ostatní členové' })} />
            <div className={s.mRowFoot}>
              <span className="ellipsis">{amounts(l)}</span>
              <span style={{ fontWeight: 700, color: freeColor(fr), whiteSpace: 'nowrap' }}>{fr == null ? 'bez limitu' : `zbývá ${kc(fr)}`}</span>
            </div>
          </div>
        )
      })}
    </div>
  )
}

export function MobileYearly({ lines, onSelect, colorBy, member, pace }: TableProps) {
  const { colorOf } = useCategories()
  const { kc, amounts, free } = useLineText(member)
  return (
    <>
      <div className={s.mSection}><span>Roční rozpočty</span><span>tempo {num(pace)} %</span></div>
      <div className={s.table}>
        {lines.map((l) => {
          const fr = free(l)
          return (
            <div key={l.categoryId} role="button" tabIndex={0} className={s.mYear} onClick={() => onSelect(`y${l.categoryId}`)} onKeyDown={onKey(() => onSelect(`y${l.categoryId}`))}>
              <div className={s.mRowHead} style={{ fontSize: 14 }}>
                <span className={s.name} style={{ fontSize: 14 }}>{l.name}</span>
                <span style={{ fontWeight: 700, color: freeColor(fr), whiteSpace: 'nowrap' }}>{fr == null ? '—' : kc(fr)}</span>
              </div>
              <BudgetBar height={8} showLimit={false} model={barModel(l, { color: colorOf(l.categoryId), colorBy, memberSelected: member != null, pace, othersLabel: 'ostatní členové' })} />
              <span className={s.note} style={{ fontSize: 12 }}>{amounts(l, ' za rok')}</span>
            </div>
          )
        })}
      </div>
    </>
  )
}
