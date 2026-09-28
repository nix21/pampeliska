import clsx from 'clsx'
import { ChevronRight, Inbox, Sparkles } from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { groupLabel, useAccounts } from '../../lib/accounts'
import { useCategories } from '../../lib/categories'
import { count, currencySymbol, dateShort, num, pct, plural, relative } from '../../lib/format'
import {
  accountWeight, budgetMonth, buildExpenseTree, compareShort, deltaPct, monthKeyShort, spentHeading, tokenVar, useBatches, useBudgets, useConditions, useInbox,
  useNetWorth, usePayday, type BudgetLine, type OverviewStats,
} from '../../lib/stats'
import type { Account, AccountGroup, BatchSource, BatchState } from '../../lib/types'
import { periodMonths, useMembers, useUi } from '../../state/ui'
import { NetWorthSpark, SegmentBar } from '../charts'
import { useMoney } from '../common'
import { Card, Segmented } from '../ui'
import { BigNum, Label, MoreLink, SectionHead } from './parts'
import s from './overview.module.css'

// ---------- Pomocné ----------

const GROUP_COLOR: Record<AccountGroup, string> = { Current: 'var(--c1)', Savings: 'var(--c6)', Foreign: 'var(--c4)', Investment: 'var(--c5)' }
const GROUP_ORDER: AccountGroup[] = ['Current', 'Savings', 'Foreign', 'Investment']

/** „+1,8 %“ s jedním desetinným místem. */
function signedPct(d: number) {
  const r = Math.round(d * 10) / 10
  return `${r > 0 ? '+' : r < 0 ? '−' : '±'}${num(Math.abs(r), 1)} %`
}

/** Účty viditelné pro vybraného člena s vahou (společné podle poměru). */
function useVisibleAccounts() {
  const { member } = useUi()
  const { list, isLoading } = useAccounts()
  return useMemo(() => ({
    isLoading,
    items: list.filter((a) => !a.archived).map((a) => ({ a, w: accountWeight(a, member) })).filter((x) => x.w > 0),
  }), [list, member, isLoading])
}

// ---------- Disponibilní zůstatek ----------

export function DisposableCard({ mobile, className }: { mobile?: boolean; className?: string }) {
  const { member } = useUi()
  const money = useMoney()
  const { items } = useVisibleAccounts()
  const payday = usePayday(member).data
  const disp = items.filter(({ a }) => a.includeInDisposable)
  const parts = GROUP_ORDER.map((g) => {
    const v = disp.filter(({ a }) => a.group === g).reduce((sum, { a, w }) => sum + a.balanceCzk * w, 0)
    return { key: g, label: groupLabel[g], value: v, color: GROUP_COLOR[g] }
  }).filter((p) => p.value !== 0)
  const total = parts.reduce((sum, p) => sum + p.value, 0)
  const free = payday ? total - payday.outgoing : null
  const until = payday?.payday ? `do výplaty ${dateShort(payday.payday)}` : 'v příštích 30 dnech'
  const countLabel = count(disp.length, 'účet', 'účty', 'účtů')
  const freeLine = free != null && (
    <span className={s.note}>Po platbách {until} zbude <strong className="num" style={{ color: free < 0 ? 'var(--neg)' : 'var(--ink)' }}>{money(free)}</strong></span>
  )

  if (mobile) {
    return (
      <Link to="/ucty" className={clsx(s.cardLinkWrap, className)}>
        <Card>
          <div className={s.rowBetween}><Label>Disponibilní zůstatek</Label><span className={s.faintLink}>{countLabel}<ChevronRight size={16} /></span></div>
          <BigNum>{money(total)}</BigNum>
          <SegmentBar parts={parts} height={8} />
          <div className="col" style={{ gap: 4 }}>
            {parts.map((p) => (
              <div key={p.key} className={s.kvRow}>
                <span className={s.dot8} style={{ background: p.color }} /><span className="muted">{p.label}</span><span className={s.strongNum}>{money(p.value)}</span>
              </div>
            ))}
          </div>
          {freeLine && <div className={s.topRule}>{freeLine}</div>}
        </Card>
      </Link>
    )
  }
  return (
    <Card className={className} style={{ gap: 12 }}>
      <div className={s.rowBetween}><Label>Disponibilní zůstatek</Label><MoreLink to="/ucty">{countLabel}</MoreLink></div>
      <div className={s.dispBody}>
        <div className="col" style={{ gap: 8 }}>
          <BigNum>{money(total)}</BigNum>
          {freeLine}
        </div>
        <div className={s.dispParts}>
          <SegmentBar parts={parts} height={10} />
          <div className={s.dispLegend}>
            {parts.map((p) => (
              <span key={p.key} className={s.dispLegendItem}>
                <span className={s.dot8} style={{ background: p.color }} /><span className="muted">{p.label}</span><span className={s.strongNum}>{money(p.value)}</span>
              </span>
            ))}
          </div>
        </div>
      </div>
    </Card>
  )
}

// ---------- Čisté jmění ----------

export function NetWorthCard({ className }: { className?: string }) {
  const { member, household } = useUi()
  const money = useMoney()
  const nw = useNetWorth(member, 8).data
  const [cur, setCur] = useState('CZK')
  const rates = nw?.rates ?? household.rates
  const options = ['CZK', ...['EUR', 'USD', household.settings.netWorthAltCurrency].filter((c, i, arr) => c && c !== 'CZK' && rates[c] && arr.indexOf(c) === i)]
  const rate = cur === 'CZK' ? 1 : rates[cur] ?? 1
  const totals = nw ? nw.months.map((_, i) => nw.layers.reduce((sum, l) => sum + (l.values[i] ?? 0), 0)) : []
  const change = nw ? deltaPct(nw.now, nw.monthAgo) : null
  return (
    <Card className={className} style={{ gap: 10 }}>
      <div className={s.rowBetween}>
        <Label>Čisté jmění</Label>
        {options.length > 1 && (
          <Segmented size="sm" value={cur} onChange={setCur} options={options.map((c) => ({ value: c, label: c }))} className={s.tinySeg} />
        )}
      </div>
      <BigNum>{nw ? money(nw.now / rate, { currency: cur, decimals: 0 }) : '—'}</BigNum>
      <div className="row" style={{ gap: 10 }}>
        {change != null && <span style={{ fontSize: 13, fontWeight: 600, color: change >= 0 ? 'var(--pos)' : 'var(--neg)' }}>{signedPct(change)} za měsíc</span>}
        <span className="faint" style={{ fontSize: 12 }}>vč. investic</span>
        <span style={{ flex: 1, display: 'flex', justifyContent: 'flex-end' }}><NetWorthSpark values={totals} /></span>
      </div>
    </Card>
  )
}

// ---------- KPI ----------

function KpiCard({ label, value, color, sub, subColor, note, className }: { label: string; value: ReactNode; color?: string; sub?: ReactNode; subColor?: string; note?: ReactNode; className?: string }) {
  return (
    <Card className={className} style={{ gap: 10 }}>
      <Label>{label}</Label>
      <BigNum color={color}>{value}</BigNum>
      <div className="col" style={{ gap: 2 }}>
        {sub && <span style={{ fontSize: 13, fontWeight: 600, color: subColor }}>{sub}</span>}
        {note && <span className="faint" style={{ fontSize: 12 }}>{note}</span>}
      </div>
    </Card>
  )
}

export function KpiCards({ stats, className }: { stats?: OverviewStats; className?: string }) {
  const { period, compare, confirmedOnly, member } = useUi()
  const members = useMembers()
  const money = useMoney()
  const cmp = compareShort(period)
  const dInc = compare && stats ? deltaPct(stats.income, stats.prevIncome) : null
  const dExp = compare && stats ? deltaPct(stats.expense, stats.prevExpense) : null
  return (
    <>
      <KpiCard className={className} label="Příjmy" value={stats ? money(stats.income) : '—'}
        sub={dInc != null ? `${signedPct(dInc)} ${cmp}` : undefined} subColor={dInc != null && dInc < 0 ? 'var(--warn)' : 'var(--pos)'}
        note={member === 'all' ? 'Všichni členové' : `Podíl: ${members.get(member)?.name ?? ''}`} />
      <KpiCard className={className} label="Výdaje" value={stats ? money(stats.expense) : '—'}
        sub={dExp != null ? `${signedPct(dExp)} ${cmp}` : undefined} subColor={dExp != null && dExp > 0 ? 'var(--warn)' : 'var(--pos)'}
        note={confirmedOnly ? 'Jen potvrzené platby' : stats && stats.unconfirmedExpense > 0 ? `z toho ${money(stats.unconfirmedExpense)} nepotvrzeno` : 'Vše potvrzeno'} />
      <KpiCard className={className} label="Bilance" value={stats ? money(stats.balance, { sign: true }) : '—'}
        color={stats && stats.balance < 0 ? 'var(--neg)' : 'var(--pos)'}
        sub={stats?.savingsRate != null ? `Míra úspor ${num(stats.savingsRate)} %` : 'Bez příjmů v období'} subColor="var(--ink-2)"
        note="Převody a investice nezapočítány" />
    </>
  )
}

export function ConditionsKpi({ className }: { className?: string }) {
  const { member } = useUi()
  const { byId } = useAccounts()
  const c = useConditions(member).data
  const all = c ? c.met === c.total : true
  const color = !c || c.total === 0 ? 'var(--ink-3)' : all ? 'var(--pos)' : c.daysLeft <= 7 ? 'var(--neg)' : 'var(--warn)'
  const bad = c ? [...new Set(c.items.filter((i) => i.state !== 'Met').map((i) => byId.get(i.accountId)?.name ?? '?'))] : []
  const end = c?.items[0]?.periodEnd
  return (
    <Link to="/ucty" className={clsx(s.cardLinkWrap, className)}>
      <Card style={{ gap: 10, height: '100%' }}>
        <Label>Podmínky účtů</Label>
        <div className="row" style={{ alignItems: 'baseline' }}>
          <BigNum color={color}>{c && c.total > 0 ? `${c.met} / ${c.total}` : '—'}</BigNum>
          {c && c.total > 0 && <span className="faint" style={{ fontSize: 13 }}>splněno</span>}
        </div>
        <div className="col" style={{ gap: 2 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color }}>
            {!c || c.total === 0 ? 'Žádné podmínky' : all ? 'Vše splněno' : `${c.total - c.met} nesplněné · zbývá ${count(c.daysLeft, 'den', 'dny', 'dní')}`}
          </span>
          <span className="faint ellipsis" style={{ fontSize: 12 }}>
            {!c || c.total === 0 ? 'Nastavíte je u účtu' : all ? `Uzávěrka ${dateShort(end)}` : bad.join(', ')}
          </span>
        </div>
      </Card>
    </Link>
  )
}

/** Mobil: výdaje za období s příjmy a bilancí. */
export function MobileSpentCard({ stats }: { stats?: OverviewStats }) {
  const { period, compare } = useUi()
  const money = useMoney()
  const d = compare && stats ? deltaPct(stats.expense, stats.prevExpense) : null
  return (
    <Card>
      <div className="col" style={{ gap: 6 }}>
        <Label>{spentHeading(period)}</Label>
        <BigNum size={42}>{stats ? money(stats.expense) : '—'}</BigNum>
        {d != null && <span style={{ fontSize: 13, fontWeight: 600, color: d > 0 ? 'var(--warn)' : 'var(--pos)' }}>{signedPct(d)} {compareShort(period)}</span>}
      </div>
      <div className={s.twoCols}>
        <div className="col" style={{ gap: 2 }}><span className="faint" style={{ fontSize: 12 }}>Příjmy</span><span className={s.midNum}>{stats ? money(stats.income) : '—'}</span></div>
        <div className="col" style={{ gap: 2 }}>
          <span className="faint" style={{ fontSize: 12 }}>Bilance</span>
          <span className={s.midNum} style={{ color: stats && stats.balance < 0 ? 'var(--neg)' : 'var(--pos)' }}>{stats ? money(stats.balance, { sign: true }) : '—'}</span>
        </div>
      </div>
    </Card>
  )
}

// ---------- Nezbytné vs. pro radost ----------

export function NeedsCard({ stats, mobile, className }: { stats?: OverviewStats; mobile?: boolean; className?: string }) {
  const { period } = useUi()
  const money = useMoney()
  const n = stats?.needs ?? { need: 0, joy: 0, none: 0 }
  const total = n.need + n.joy + n.none || 1
  const rows = [
    { key: 'n', label: 'Nezbytné', value: n.need, color: 'var(--need)' },
    { key: 'j', label: 'Pro radost', value: n.joy, color: 'var(--joy)' },
    { key: 'x', label: 'Neoznačené', value: n.none, color: 'var(--none)' },
  ]
  const joyYear = (n.joy / Math.max(1, periodMonths(period))) * 12
  const hist = (stats?.joyHistory ?? []).map((m) => ({ key: m.month, label: monthKeyShort(m.month), share: m.expense > 0 ? (m.needs.joy / m.expense) * 100 : 0 }))
  const maxShare = Math.max(40, ...hist.map((h) => h.share))
  return (
    <Card className={className}>
      <SectionHead title="Nezbytné vs. pro radost">{!mobile && <MoreLink to="/usetrit" chevron={false}>Kde ušetřit</MoreLink>}</SectionHead>
      <SegmentBar parts={rows} height={14} bordered />
      <div className="col" style={{ gap: 6 }}>
        {rows.map((r) => (
          <div key={r.key} className={s.needRow}>
            <span className={s.dot10} style={{ background: r.color }} />
            <span className="muted">{r.label}</span>
            <span className={s.strongNum}>{money(r.value)}</span>
            <span className={s.faintNum}>{pct((r.value / total) * 100)}</span>
          </div>
        ))}
      </div>
      {mobile ? (
        <div className={s.topRule} style={{ fontSize: 13, color: 'var(--ink-2)' }}>Pro radost za rok: <strong className="num" style={{ color: 'var(--ink)' }}>{money(joyYear)}</strong></div>
      ) : (
        <div className={clsx(s.topRule, s.joyFoot)}>
          <div className="col" style={{ gap: 2, flex: 1 }}>
            <span className="faint" style={{ fontSize: 12 }}>Pro radost za rok, při tomto tempu</span>
            <BigNum size={22}>{money(joyYear)}</BigNum>
          </div>
          <div className={s.joyBars}>
            {hist.map((h, i) => (
              <div key={h.key} className={s.joyBar} title={`${h.label}: ${pct(h.share)} pro radost`}>
                <span style={{ height: Math.max(3, (h.share / maxShare) * 46), background: i === hist.length - 1 ? 'var(--joy)' : 'color-mix(in oklch, var(--ink-3) 35%, var(--surface))' }} />
                <span className={s.joyBarLabel}>{h.label}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </Card>
  )
}

// ---------- Ke kategorizaci ----------

const SOURCE: Record<BatchSource, string> = { Mcp: 'MCP', Manual: 'ruční', EnableBanking: 'z banky' }
const STATE: Record<BatchState, string> = { Uploaded: 'nahráno', Categorized: 'kategorizováno', Confirmed: 'potvrzeno' }

export function InboxCard({ mobile, className }: { mobile?: boolean; className?: string }) {
  const { member } = useUi()
  const inbox = useInbox(member).data
  const batch = useBatches().data?.[0]
  if (!inbox || inbox.counts.all === 0) return null
  const c = inbox.counts
  const unsure = inbox.items.filter((i) => i.tx.categorySource === 'Ai' && (i.tx.aiConfidence ?? 0) < 70).slice(0, 2).map((i) => i.tx.counterparty)
  const batchLine = batch && `Dávka ${SOURCE[batch.source]} · ${relative(batch.createdAt)} · ${count(batch.count, 'platba', 'platby', 'plateb')} · ${STATE[batch.state]}`

  if (mobile) {
    return (
      <Link to="/trideni" className={clsx(s.inbox, s.inboxMobile, className)}>
        <Inbox size={18} />
        <div className="col grow" style={{ gap: 2 }}>
          <span style={{ fontWeight: 700, fontSize: 15 }}>{count(c.all, 'platba', 'platby', 'plateb')} ke kategorizaci</span>
          <span style={{ fontSize: 12, opacity: 0.8 }}>
            {[c.aiUnsure > 0 && `${c.aiUnsure}× AI si není jistá`, batch && `dávka ${SOURCE[batch.source]} ${relative(batch.createdAt).replace('dnes ', '')}`].filter(Boolean).join(' · ')}
          </span>
        </div>
        <ChevronRight size={18} />
      </Link>
    )
  }
  return (
    <section className={clsx(s.inbox, className)}>
      <div className="row" style={{ gap: 10 }}>
        <Inbox size={18} />
        <span style={{ fontWeight: 700, fontSize: 15, flex: 1 }}>{c.all} {plural(c.all, 'platba čeká', 'platby čekají', 'plateb čeká')} na zařazení</span>
      </div>
      <div className="col" style={{ gap: 4, fontSize: 13 }}>
        {c.aiUnsure > 0 && (
          <span className="row" style={{ gap: 6 }}><Sparkles size={14} /> {c.aiUnsure}× AI si není jistá{unsure.length ? ` (${unsure.join(', ')})` : ''}</span>
        )}
        {batchLine && <span style={{ opacity: 0.8 }}>{batchLine}</span>}
        {c.duplicates > 0 && <span style={{ opacity: 0.8 }}>{count(c.duplicates, 'podezřelá duplicita', 'podezřelé duplicity', 'podezřelých duplicit')}</span>}
      </div>
      <div className="row">
        <Link to="/trideni" className={s.inboxPrimary}>Zařadit</Link>
        {batch && <Link to={`/davky/${batch.id}`} className={s.inboxSecondary}>Otevřít dávku</Link>}
      </div>
    </section>
  )
}

// ---------- Rozpočty ----------

function budgetStatus(b: BudgetLine, money: (v: number) => string) {
  const p = b.limit ? (b.spent / b.limit) * 100 : 0
  switch (b.status) {
    case 'Over': return { text: `Přečerpáno o ${money(b.spent - (b.limit ?? 0))}`, color: 'var(--neg)', bar: 'var(--neg)' }
    case 'Faster': return { text: `Rychleji než tempo měsíce · ${pct(p)}`, color: 'var(--warn)', bar: 'var(--warn)' }
    case 'WontFit': return { text: `S pravidelnými platbami se nevejde · ${pct(p)}`, color: 'var(--warn)', bar: 'var(--warn)' }
    case 'Paid': return { text: 'Zaplaceno', color: 'var(--ink-3)', bar: undefined }
    case 'Waiting': return { text: `Čeká na platbu ${money(b.reserved)}`, color: 'var(--ink-3)', bar: undefined }
    default: return { text: `V tempu · ${pct(p)}`, color: 'var(--ink-3)', bar: undefined }
  }
}

export function BudgetsCard({ mobile, className }: { mobile?: boolean; className?: string }) {
  const { period, member, confirmedOnly, household, hidden } = useUi()
  const cats = useCategories()
  const money = useMoney()
  const b = useBudgets(budgetMonth(period, household.today), member, confirmedOnly).data
  const tops = (b?.monthly ?? [])
    .filter((l) => l.limit != null && l.limit > 0 && (l.parentId == null || !b!.monthly.some((p) => p.categoryId === l.parentId)))
    .sort((x, y) => y.spent / (y.limit || 1) - x.spent / (x.limit || 1))
    .slice(0, mobile ? 3 : 5)
  return (
    <Card className={className}>
      <SectionHead title="Rozpočty">
        {b && <span className="faint" style={{ fontSize: 12 }}>{b.closed ? `${monthKeyShort(b.month)} · uzavřeno` : `Den ${b.day} z ${b.daysInMonth}`}</span>}
      </SectionHead>
      {b && tops.length === 0 && (
        <div className="col" style={{ gap: 8, fontSize: 13, color: 'var(--ink-2)' }}>
          Rozpočty zatím nemáte nastavené.
          <MoreLink to="/rozpocty">Nastavit rozpočty</MoreLink>
        </div>
      )}
      {tops.map((l) => {
        const st = budgetStatus(l, (v) => money(v))
        const color = st.bar ?? tokenVar(cats.byId.get(l.categoryId)?.color ?? 'ink-3')
        return (
          <Link key={l.categoryId} to="/rozpocty" className={s.budget}>
            <div className={s.budgetHead}>
              <span className="ellipsis" style={{ fontWeight: 600, flex: 1 }}>{l.name}</span>
              <span className="num muted">{hidden ? '•••' : num(l.spent)} / {money(l.limit)}</span>
            </div>
            <div className={s.budgetBar}>
              <span style={{ width: `${Math.min(100, (l.spent / (l.limit || 1)) * 100)}%`, background: color }} />
              {!b!.closed && <i style={{ left: `${Math.min(100, b!.pace)}%` }} />}
            </div>
            <span style={{ fontSize: 12, fontWeight: 600, color: st.color }}>{st.text}</span>
          </Link>
        )
      })}
      {!mobile && b && tops.length > 0 && (
        <div className={s.topRule} style={{ fontSize: 12, color: 'var(--ink-2)', lineHeight: 1.5 }}>
          Celkem {money(b.spent)} z {money(b.total)} · volně {money(b.free)} po rezervaci pravidelných plateb
        </div>
      )}
    </Card>
  )
}

// ---------- Největší žrouti ----------

export function EatersCard({ stats, mobile, className }: { stats?: OverviewStats; mobile?: boolean; className?: string }) {
  const cats = useCategories()
  const money = useMoney()
  const [tab, setTab] = useState<'cat' | 'merch'>('cat')
  const tops = useMemo(() => (stats ? buildExpenseTree(cats, stats.byCategory).filter((t) => t.amount > 0) : []), [cats, stats])
  const total = tops.reduce((a, t) => a + t.amount, 0) || 1
  const topToken = (id: number | null) => {
    const c = id != null ? cats.byId.get(id) : undefined
    return c ? tokenVar(c.color) : 'var(--none)'
  }
  const rows = tab === 'cat'
    ? tops.slice(0, 5).map((t) => ({ key: `c${t.id}`, name: t.name, sub: pct((t.amount / total) * 100), value: t.amount, color: tokenVar(t.token) }))
    : (stats?.topMerchants ?? []).slice(0, 5).map((m) => ({
      key: `m${m.name}`, name: m.name, sub: m.count > 1 ? count(m.count, 'platba', 'platby', 'plateb') : cats.nameOf(m.categoryId), value: m.amount, color: topToken(m.categoryId),
    }))
  const shown = mobile ? rows.slice(0, 3) : rows
  const max = shown[0]?.value || 1
  return (
    <Card className={className} style={{ gap: mobile ? 8 : 12 }}>
      <SectionHead title="Největší žrouti">
        <Segmented size="sm" value={tab} onChange={setTab} options={[{ value: 'cat', label: 'Kategorie' }, { value: 'merch', label: 'Obchodníci' }]} />
      </SectionHead>
      {shown.length === 0 && <span className="faint" style={{ fontSize: 13 }}>Zatím žádné výdaje.</span>}
      {shown.map((x, i) => (
        <div key={x.key} className={s.eater}>
          <span className={s.rank}>{i + 1}</span>
          <div className="col" style={{ gap: 5, minWidth: 0 }}>
            <div className="row" style={{ gap: 6, alignItems: 'baseline', minWidth: 0 }}>
              <span className="ellipsis" style={{ fontSize: 14, fontWeight: 600 }}>{x.name}</span>
              {!mobile && <span className="faint" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>{x.sub}</span>}
            </div>
            <span className={s.eaterBar} style={{ width: `${Math.max(2, (x.value / max) * 100)}%`, background: x.color }} />
          </div>
          <span className={s.strongNum} style={{ fontSize: 14 }}>{money(x.value)}</span>
        </div>
      ))}
    </Card>
  )
}

// ---------- Účty ----------

function ownerText(a: Account, names: Map<number, { name: string }>) {
  if (a.joint) {
    const who = a.ratio.map((r) => names.get(r.memberId)?.name).filter(Boolean)
    return who.length ? who.join(' a ') : 'společný'
  }
  return a.ownerMemberId != null ? names.get(a.ownerMemberId)?.name ?? '' : 'domácnost'
}

export function AccountsCard({ className }: { className?: string }) {
  const money = useMoney()
  const members = useMembers()
  const { items } = useVisibleAccounts()
  const sorted = [...items].sort((x, y) => GROUP_ORDER.indexOf(x.a.group) - GROUP_ORDER.indexOf(y.a.group))
  const total = items.filter(({ a }) => a.includeInNetWorth).reduce((sum, { a, w }) => sum + a.balanceCzk * w, 0)
  return (
    <Card className={className} style={{ gap: 4 }}>
      <SectionHead title="Účty"><span className="num muted" style={{ fontSize: 13, fontWeight: 600 }}>{money(total)}</span></SectionHead>
      <div style={{ height: 4 }} />
      {sorted.map(({ a }) => (
        <Link key={a.id} to={`/ucty/${a.id}`} className={s.account}>
          <span className={s.sym}>{currencySymbol[a.currency] ?? a.currency}</span>
          <div className="col" style={{ gap: 1, minWidth: 0 }}>
            <span className="ellipsis" style={{ fontSize: 14, fontWeight: 600 }}>{a.name}</span>
            <span className="faint ellipsis" style={{ fontSize: 12 }}>{a.institution.name} · {ownerText(a, members)}</span>
          </div>
          <div className={s.amountCol}>
            <span className={s.strongNum} style={{ fontSize: 14 }}>{money(a.balance, { currency: a.currency })}</span>
            {a.currency !== 'CZK' && <span className={s.faintNum}>≈ {money(a.balanceCzk)}</span>}
          </div>
        </Link>
      ))}
      {sorted.length === 0 && <span className="faint" style={{ fontSize: 13 }}>Žádné účty.</span>}
    </Card>
  )
}
