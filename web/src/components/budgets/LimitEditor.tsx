import { useState } from 'react'
import { useCategories } from '../../lib/categories'
import { fromMonth, shiftMonth, toMonth, useSetBudget, type BudgetLine } from '../../lib/budgets'
import { notifyOk } from '../../lib/api'
import { num } from '../../lib/format'
import type { Member } from '../../lib/types'
import { useMoney } from '../common'
import { NumberInput, Segmented, Switch } from '../ui'
import s from './budgets.module.css'

type Scope = 'household' | 'personal'

/**
 * Editor limitu vybraného řádku. Bez vybraného člena upravuje limit domácnosti; s vybraným členem nabídne volbu
 * „Limit domácnosti / Osobní limit (jméno)“. Limit platí pro všechny měsíce (není vázaný na zobrazený měsíc).
 */
export function LimitEditor({ line, month, closed, member, hasKids }: {
  line: BudgetLine
  month: string
  closed: boolean
  member: Member | null
  hasKids: boolean
}) {
  const { byId } = useCategories()
  const kc = useMoney()
  const save = useSetBudget()
  const [scope, setScope] = useState<Scope>(line.personal ? 'personal' : 'household')
  const cat = byId.get(line.categoryId)
  const yearly = line.period === 'Yearly'
  const personal = scope === 'personal' && member != null

  // Aktuální hodnoty zvoleného limitu
  const current: number | null = personal
    ? (line.personal ? line.ownLimit ?? null : null)
    : line.personal
      ? (cat && cat.budgetPeriod === line.period ? cat.budgetAmount ?? null : null)
      : line.ownLimit ?? null
  const carry = personal ? line.personal && line.carryOver : line.personal ? !!cat?.carryOver : line.carryOver
  const matchesLine = personal === line.personal

  const [draft, setDraft] = useState<number | null>(current)
  const [synced, setSynced] = useState<{ current: number | null; key: string }>({ current, key: `${line.categoryId}-${scope}` })
  const key = `${line.categoryId}-${scope}`
  if (synced.current !== current || synced.key !== key) {
    setSynced({ current, key })
    setDraft(current)
  }

  const put = (amount: number | null, carryOver: boolean, message: string) =>
    save.mutate(
      { categoryId: line.categoryId, memberId: personal ? member!.id : null, period: line.period, amount, carryOver },
      { onSuccess: () => notifyOk(message) },
    )

  const commit = () => {
    const v = draft != null ? Math.round(Math.abs(draft)) : null
    if (v === current) return
    put(v, carry, v == null ? 'Limit zrušen' : 'Limit uložen')
  }

  const label = yearly ? 'Roční limit' : hasKids && current == null ? 'Vlastní limit (teď součet podkategorií)' : 'Měsíční limit'
  const nextFree = Math.max(0, line.free)
  const carryNote = !carry
    ? 'Nevyčerpané propadne'
    : closed
      ? 'Nevyčerpané se přenáší do dalšího měsíce'
      : matchesLine && line.carriedIn > 0
        ? `${capital(fromMonth(shiftMonth(month, -1)))} přeneseno ${kc(line.carriedIn)}. ${capital(toMonth(shiftMonth(month, 1)))} přejde ${kc(nextFree)}`
        : `${capital(toMonth(shiftMonth(month, 1)))} přejde ${kc(nextFree)}`

  return (
    <div className={s.editor}>
      {member && (
        <Segmented<Scope> full size="sm" aria-label="Který limit upravit" value={scope} onChange={setScope} options={[
          { value: 'household', label: 'Limit domácnosti' },
          { value: 'personal', label: `Osobní limit (${member.name})` },
        ]} />
      )}
      <div className={s.limitRow} onBlur={commit}>
        <label className={s.limitLabel} htmlFor={`limit-${line.categoryId}`}>{label}</label>
        <NumberInput id={`limit-${line.categoryId}`} className={s.limitInput} value={draft} onChange={setDraft} decimals={0} suffix="Kč"
          placeholder={hasKids && line.childSum > 0 ? num(line.childSum) : 'bez limitu'} disabled={save.isPending}
          onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }} />
      </div>
      {!yearly && current != null && (
        <div className={s.carry} onClick={() => !save.isPending && put(current, !carry, carry ? 'Přenos vypnut' : 'Přenos zapnut')}>
          <div className={s.carryText}>
            <span>Přenášet nevyčerpané do dalšího měsíce</span>
            <small>{carryNote}</small>
          </div>
          <span onClick={(e) => e.stopPropagation()}>
            <Switch checked={carry} disabled={save.isPending} label="Přenášet nevyčerpané" onChange={(v) => put(current, v, v ? 'Přenos zapnut' : 'Přenos vypnut')} />
          </span>
        </div>
      )}
      <div className={s.editorFoot}>
        <span>{personal ? `Platí jen pro útratu člena ${member!.name}` : 'Platí pro celou domácnost'} · {yearly ? 'každý rok' : 'každý měsíc'}</span>
        {current != null && (
          <button type="button" className={s.linkBtn} disabled={save.isPending} onClick={() => put(null, carry, 'Limit zrušen')}>Zrušit limit</button>
        )}
      </div>
    </div>
  )
}

const capital = (t: string) => t.charAt(0).toUpperCase() + t.slice(1)
