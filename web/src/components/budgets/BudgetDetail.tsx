import { ChevronLeft, Repeat } from 'lucide-react'
import { FASTER_MARGIN, useBudgetSeries, type BudgetLine, type BudgetOverview } from '../../lib/budgets'
import { useCategories } from '../../lib/categories'
import { dateShort, monthNames, monthShort, num } from '../../lib/format'
import type { Member } from '../../lib/types'
import { useUi } from '../../state/ui'
import { useMoney } from '../common'
import { LimitEditor } from './LimitEditor'
import { SpendChart, type ChartTick } from './SpendChart'
import { StatusPill } from './BudgetBar'
import s from './budgets.module.css'

/** Panel detailu rozpočtu (desktop vpravo, mobil jako samostatná obrazovka). */
export function BudgetDetail({ line, overview, member, month, onSelect, onBack, mobile }: {
  line: BudgetLine
  overview: BudgetOverview
  member: Member | null
  month: string
  onSelect: (key: string) => void
  onBack?: () => void
  mobile?: boolean
}) {
  const { confirmedOnly, hidden } = useUi()
  const { byId, colorOf } = useCategories()
  const kc = useMoney()
  const yearly = line.period === 'Yearly'
  const monthly = overview.monthly
  const series = useBudgetSeries(yearly ? null : line.categoryId, month, line.personal && member ? member.id : undefined, confirmedOnly).data

  const color = colorOf(line.categoryId)
  const limit = line.limit != null && line.limit > 0 ? line.limit : null
  const pace = yearly ? overview.yearPace : overview.pace
  const closed = yearly ? overview.yearPace >= 100 : overview.closed

  // Cesta „Jídlo › …“
  const parents: string[] = []
  for (let p = byId.get(line.categoryId)?.parentId; p != null; p = byId.get(p)?.parentId) parents.unshift(byId.get(p)?.name ?? '')
  const path = parents.length ? parents.join(' › ') : yearly ? 'Roční rozpočet' : 'Měsíční rozpočet'

  // Graf
  let points: [number, number][] = []
  let now: number
  let spent = line.spent
  let projection: number | null
  let ticks: ChartTick[]
  let nowLabel: string
  if (!yearly) {
    const dim = series?.daysInMonth ?? overview.daysInMonth
    if (series && series.cumulative.length) {
      points = series.cumulative.map((v, i) => [(i + 1) / dim, v])
      spent = series.cumulative[series.cumulative.length - 1]
    }
    now = (series?.day ?? overview.day) / dim
    projection = series?.projection ?? (overview.day > 0 ? (line.spent / overview.day) * dim : null)
    ticks = [{ at: 0, label: '1.' }, { at: 10 / dim, label: '10.' }, { at: 20 / dim, label: '20.' }]
    nowLabel = overview.closed ? `${dim}.` : `dnes ${overview.day}.`
  } else {
    now = Math.min(1, overview.yearPace / 100)
    projection = now > 0 ? line.spent / now : null
    ticks = [0, 3, 6, 9].map((m) => ({ at: m / 12, label: monthShort[m] }))
    nowLabel = monthNames[Number(month.slice(5, 7)) - 1]
  }
  const lineColor = limit != null && spent > limit ? 'var(--neg)' : limit != null && (spent / limit) * 100 > pace + FASTER_MARGIN ? 'var(--warn)' : color
  const projText = closed
    ? yearly ? 'rok uzavřen' : 'měsíc uzavřen'
    : projection == null ? '' : `projekce ${kc(projection)}${limit != null ? (projection > limit ? ` · přes limit o ${kc(projection - limit)}` : ' · pod limitem') : ''}`

  const kids = yearly ? [] : monthly.filter((l) => l.parentId === line.categoryId)
  const n = (v: number) => (hidden ? '•••••' : num(v))
  const reservations = [...line.reservations].sort((a, b) => a.date.localeCompare(b.date))
  const free = limit != null ? line.free : null

  const stats = (
    <div className={s.stats}>
      <div className={s.stat}><span>Utraceno</span><b>{kc(line.spent)}</b></div>
      <div className={s.stat}><span>Limit</span><b>{limit != null ? kc(limit) : '—'}</b></div>
      <div className={s.stat}><span>Zbývá volně</span><b style={{ color: free == null ? 'var(--ink-3)' : free < 0 ? 'var(--neg)' : 'var(--pos)' }}>{free != null ? kc(free) : '—'}</b></div>
    </div>
  )
  const share = member && (line.personal
    ? <span className={s.share}>Osobní limit · počítá se jen útrata člena {member.name}</span>
    : line.memberSpent != null ? <span className={s.share}>z toho {member.name}: <b>{kc(line.memberSpent)}</b> · ostatní {kc(Math.max(0, line.spent - line.memberSpent))}</span> : null)

  const chart = (
    <SpendChart points={points} now={now} spent={spent} limit={limit} projection={projection} reserved={closed ? 0 : line.reserved}
      color={color} lineColor={lineColor} ticks={ticks} nowLabel={nowLabel} finished={closed} height={mobile ? 130 : 150} />
  )
  const caption = (
    <span className={s.caption}>
      {limit != null ? `Čárkovaná diagonála = rovnoměrné tempo k limitu ${kc(limit)}` : 'Bez limitu – jen průběh útraty'}
      {yearly && ' · tečka = stav ke konci zobrazeného měsíce'}
    </span>
  )

  const kidsBlock = kids.length > 0 && (
    <div className={mobile ? s.card : s.block}>
      {!mobile && <span className={s.blockTitle}>Podkategorie</span>}
      {kids.map((k) => {
        const kl = k.limit != null && k.limit > 0 ? k.limit : null
        const kcol = colorOf(k.categoryId)
        return (
          <button key={k.categoryId} type="button" className={s.kid} onClick={() => onSelect(`m${k.categoryId}`)}>
            <span className={s.kidName}><span className={s.dot} style={{ width: 7, height: 7, background: kcol }} /><span className="ellipsis">{k.name}</span></span>
            <span className={s.kidBar}><span style={{ width: `${kl ? Math.min(k.spent / kl, 1) * 100 : 100}%`, background: kl ? (k.spent > kl ? 'var(--neg)' : kcol) : 'var(--ink-3)' }} /></span>
            <span className={s.kidAmt}>{n(k.spent)}{kl ? ` / ${n(kl)}` : ' · bez lim.'}</span>
          </button>
        )
      })}
      {line.ownLimit != null && line.childSum > 0 && (
        <div className={s.rest}><span>Nerozpočtovaný zbytek</span><b>{kc(line.ownLimit - line.childSum)}</b></div>
      )}
    </div>
  )

  const resBlock = reservations.length > 0 && !closed && (
    <div className={s.block} style={{ gap: 6 }}>
      <span className={s.blockTitle}>{mobile ? 'Rezervováno' : 'Rezervováno pravidelnými platbami'}</span>
      {reservations.map((r) => (
        <div key={`${r.recurringId}-${r.date}`} className={s.res}>
          {!mobile && <Repeat size={12} />}
          <span className={s.resName}>{r.name}{mobile && <span className={s.resDate}> · {dateShort(r.date)}</span>}</span>
          {!mobile && <span className={s.resDate}>{dateShort(r.date)}</span>}
          <span className={s.resAmt}>{kc(r.amount)}</span>
        </div>
      ))}
    </div>
  )

  const editor = (
    <LimitEditor key={`${line.period}-${line.categoryId}-${member?.id ?? 'all'}`} line={line} month={month} closed={overview.closed} member={member} hasKids={kids.length > 0} />
  )

  const title = (
    <div className={s.detailTitle}>
      <span className={s.dot} style={{ width: 12, height: 12, background: color }} />
      <h2>{line.name}</h2>
      <StatusPill status={line.status} large />
    </div>
  )

  if (mobile) {
    return (
      <div className={s.detail}>
        <button type="button" className={s.mBack} onClick={onBack}><ChevronLeft size={18} /> Rozpočty</button>
        <div className={s.detailHead}>
          <span className={s.detailPath}>{path}</span>
          {title}
        </div>
        {stats}
        {share}
        <div className={s.card}>
          <span className={s.blockTitle}>Čerpání v čase{projText && ` · ${projText}`}</span>
          {chart}
          {caption}
        </div>
        {kidsBlock}
        {resBlock}
        {editor}
      </div>
    )
  }

  return (
    <aside className={s.detail} aria-label={`Detail rozpočtu ${line.name}`}>
      <div className={s.detailHead}>
        <span className={s.detailPath}>{path}</span>
        {title}
      </div>
      {stats}
      {share}
      <div className={s.block} style={{ gap: 6 }}>
        <div className={s.chartHead}><b>Čerpání v čase</b><span>{projText}</span></div>
        {chart}
        {caption}
      </div>
      {kidsBlock}
      {resBlock}
      {editor}
    </aside>
  )
}
