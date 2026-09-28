import { HATCH, FASTER_MARGIN, shareOf, type BarModel, type BarSeg, type BudgetLine, type BudgetOverview, type ColorBy } from '../../lib/budgets'
import { useCategories } from '../../lib/categories'
import { num } from '../../lib/format'
import type { Member } from '../../lib/types'
import { useMoney } from '../common'
import { BudgetBar } from './BudgetBar'
import s from './budgets.module.css'

/** Celkový pruh měsíce: hlavní kategorie (nebo nezbytné / radost), ostatní členové, rezervace a tempo. */
function totalModel(o: BudgetOverview, tops: BudgetLine[], colorBy: ColorBy, member: Member | null, colorOf: (id: number) => string, kc: (v: number) => string) {
  const segs: BarSeg[] = []
  let own = 0
  let others = 0
  const needs = { need: 0, joy: 0, none: 0 }
  for (const t of tops) {
    const sh = shareOf(t, member != null)
    own += sh.own
    others += sh.others
    const n = t.needs.need + t.needs.joy + t.needs.none
    if (n > 0) {
      needs.need += (sh.own * t.needs.need) / n
      needs.joy += (sh.own * t.needs.joy) / n
      needs.none += (sh.own * t.needs.none) / n
    } else needs.none += sh.own
    if (colorBy === 'cat') segs.push({ value: sh.own, color: colorOf(t.categoryId), title: `${t.name} ${kc(sh.own)}` })
  }
  if (colorBy === 'need') {
    segs.push({ value: needs.need, color: 'var(--need)', title: `nezbytné ${kc(needs.need)}` })
    segs.push({ value: needs.joy, color: 'var(--joy)', title: `pro radost ${kc(needs.joy)}` })
    segs.push({ value: needs.none, color: 'var(--none)', title: `neoznačené ${kc(needs.none)}` })
  }
  if (others > 0) segs.push({ value: others, color: 'color-mix(in oklch, var(--ink-3) 30%, var(--surface))', title: `ostatní členové ${kc(others)}` })
  if (o.reserved > 0) segs.push({ value: o.reserved, color: HATCH, title: `rezervováno ${kc(o.reserved)}` })
  const model: BarModel = {
    segs: segs.filter((x) => x.value > 0),
    track: Math.max(o.total, o.spent + o.reserved, 1),
    limit: o.total > 0 ? o.total : null,
    pace: o.total > 0 ? (o.total * o.pace) / 100 : null,
  }
  return { model, own }
}

export function BudgetSummary({ overview: o, tops, colorBy, member, mobile }: {
  overview: BudgetOverview
  tops: BudgetLine[]
  colorBy: ColorBy
  member: Member | null
  mobile?: boolean
}) {
  const { colorOf } = useCategories()
  const kc = useMoney()
  const { model, own } = totalModel(o, tops, colorBy, member, colorOf, kc)
  const spentPct = o.total > 0 ? (o.spent / o.total) * 100 : 0
  const freeColor = o.free < 0 ? 'var(--neg)' : 'var(--pos)'

  if (mobile) {
    return (
      <section className={s.card} style={{ padding: 18, gap: 12, boxShadow: 'var(--shadow)' }}>
        <div className={s.summaryHead}><span>Zbývá volně</span><span style={{ fontSize: 12, color: 'var(--ink-3)' }}>{o.closed ? 'uzavřený měsíc' : `tempo ${num(o.pace)} %`}</span></div>
        <span className={s.summaryValue} style={{ color: freeColor }}>{kc(o.free)}</span>
        <BudgetBar model={model} height={16} showLimit={false} />
        <span style={{ fontSize: 12, color: 'var(--ink-2)' }}>
          {kc(member ? own : o.spent)} utraceno{member ? ` (${member.name})` : ''} · {kc(o.reserved)} rezervováno · limit {kc(o.total)}
        </span>
      </section>
    )
  }

  const kpis = [
    { label: 'Rozpočet měsíce', value: kc(o.total), note: 'součet hlavních kategorií', color: 'var(--ink)' },
    member
      ? { label: `Utraceno · ${member.name}`, value: kc(own), note: `z ${kc(o.spent)} celkem`, color: 'var(--ink)' }
      : { label: 'Utraceno', value: kc(o.spent), note: `${num(spentPct)} % rozpočtu`, color: 'var(--ink)' },
    { label: 'Rezervováno', value: kc(o.reserved), note: o.closed ? 'měsíc uzavřen' : 'pravidelné platby do konce měsíce', color: 'var(--ink-2)' },
    { label: 'Zbývá volně', value: kc(o.free), note: o.free < 0 ? 'přes rozpočet' : 'po odečtení rezervací', color: freeColor },
    {
      label: 'Tempo měsíce', value: `${num(o.pace)} %`,
      note: o.closed ? 'uzavřený měsíc' : `den ${o.day} z ${o.daysInMonth} · čerpáno ${num(spentPct)} %`,
      color: spentPct > o.pace + FASTER_MARGIN ? 'var(--warn)' : 'var(--ink)',
    },
  ]
  return (
    <section className={s.table} style={{ padding: 'var(--pad)', display: 'flex', flexDirection: 'column', gap: 14 }} aria-label="Souhrn měsíce">
      <div className={s.kpis}>
        {kpis.map((k) => (
          <div key={k.label} className={s.kpi}>
            <span className={s.kpiLabel}>{k.label}</span>
            <span className={s.kpiValue} style={{ color: k.color }}>{k.value}</span>
            <span className={s.kpiNote}>{k.note}</span>
          </div>
        ))}
      </div>
      <BudgetBar model={model} height={18} showLimit={false} />
    </section>
  )
}
