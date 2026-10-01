import { keepPreviousData, useQueries, useQuery } from '@tanstack/react-query'
import clsx from 'clsx'
import {
  ArrowLeftRight, Ban, ChevronDown, Link2, Plus, Repeat, Scale, Search, Sparkles, Split, TrendingUp, Undo2, X, type LucideIcon,
} from 'lucide-react'
import { useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { PageHeader } from '../components/AppShell'
import { NeedChip, useEffectiveNeed } from '../components/category'
import { commonStyles, MemberSwitch, Money, PeriodPicker, useMoney } from '../components/common'
import { TransactionPanel } from '../components/transactions/TransactionPanel'
import { AddTransactionDialog, CorrectionDialog } from '../components/transactions/TxDialogs'
import { Button, Empty, Popover, PopoverClose, Segmented, Skeleton, tokenColor } from '../components/ui'
import { useAccounts } from '../lib/accounts'
import { api, qs } from '../lib/api'
import { needLabel, useCategories } from '../lib/categories'
import { count, dayHeading, num } from '../lib/format'
import {
  accountLabel, contributorLabel, countedCzk, FLAG_LABELS, isExcludedTx, isTransferKind, KIND_OPTIONS, ratioLabel, whoLabel,
  type KindFilter, type ListRow, type TransferFlow, type TxFlag, type TxSummary,
} from '../lib/transactions'
import type { Account, TxPage } from '../lib/types'
import { periodLabel, useMembers, useUi } from '../state/ui'
import s from './TransactionsPage.module.css'

const PAGE = 200

const FLAG_ICONS: Record<TxFlag, LucideIcon> = { split: Split, unconfirmed: Sparkles, recurring: Repeat, excluded: Ban, corrections: Scale }
const FLAGS = Object.keys(FLAG_LABELS) as TxFlag[]

const mobileQuery = '(max-width: 767px)'
function useIsMobile() {
  return useSyncExternalStore(
    (cb) => {
      const mq = matchMedia(mobileQuery)
      mq.addEventListener('change', cb)
      return () => mq.removeEventListener('change', cb)
    },
    () => matchMedia(mobileQuery).matches,
    () => false,
  )
}

function useDebounced<T>(value: T, ms = 300) {
  const [v, setV] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return v
}

/** Obrazovka Pohyby: filtry, souhrny, toky převodů, seznam po dnech a detail pohybu (panel vpravo / samostatná obrazovka na mobilu). */
export default function TransactionsPage() {
  const { period, member, filterParams } = useUi()
  const members = useMembers()
  const accounts = useAccounts()
  const { isExcluded } = useCategories()
  const isMobile = useIsMobile()
  const [params, setParams] = useSearchParams()
  const location = useLocation()
  const navigate = useNavigate()

  const [accountId, setAccountIdRaw] = useState<number | null>(() => Number(params.get('ucet')) || null)
  // Zdroj příchozích peněz z „Kdo kolik poslal“ (m{člen} / a{účet} / ext / all); platí jen spolu s účtem
  const [from, setFrom] = useState<string | null>(null)
  const setAccountId = (id: number | null) => (setAccountIdRaw(id), setFrom(null))
  const pickFlow = (id: number, key: string | null) => {
    const same = accountId === id && from === key
    setAccountIdRaw(id)
    setFrom(same ? null : key)
  }
  const [kind, setKind] = useState<KindFilter>('All')
  const [flag, setFlag] = useState<TxFlag | null>(null)
  const [searchText, setSearchText] = useState('')
  const search = useDebounced(searchText.trim())
  const [take, setTake] = useState(PAGE)
  const [openSplits, setOpenSplits] = useState<Set<number>>(new Set())
  const [addOpen, setAddOpen] = useState(false)
  const [corrOpen, setCorrOpen] = useState(false)

  const selId = Number(params.get('id')) || null
  const select = (id: number | null) => {
    setParams((p) => {
      const n = new URLSearchParams(p)
      if (id) n.set('id', String(id))
      else n.delete('id')
      return n
    }, { replace: !isMobile || !id, state: id && isMobile ? { fromList: true } : undefined })
  }
  const closeDetail = () => {
    if (isMobile && (location.state as { fromList?: boolean } | null)?.fromList) navigate(-1)
    else select(null)
  }
  useEffect(() => {
    if (isMobile) window.scrollTo(0, 0)
  }, [isMobile, selId])

  // Při změně filtrů začít znovu od první stránky.
  const base = { period: period.value, account: accountId ?? undefined, member: filterParams.member }
  const listParams = {
    ...base, kind: kind === 'All' ? undefined : kind, search: search || undefined, confirmedOnly: filterParams.confirmedOnly, from: from ?? undefined,
    ...(flag ? { [flag]: true } : {}),
  }
  const listKey = JSON.stringify(listParams)
  const [prevKey, setPrevKey] = useState(listKey)
  if (prevKey !== listKey) {
    setPrevKey(listKey)
    setTake(PAGE)
  }

  const list = useQuery({
    queryKey: ['transactions', 'list', listParams, take],
    queryFn: () => api.get<TxPage>(`/api/transactions${qs({ ...listParams, take })}`),
    placeholderData: keepPreviousData,
  })
  const summary = useQuery({
    queryKey: ['transactions', 'summary', base],
    queryFn: () => api.get<TxSummary>(`/api/transactions/summary${qs(base)}`),
  })
  const flows = useQuery({
    queryKey: ['transactions', 'flows', period.value, accountId],
    queryFn: () => api.get<TransferFlow[]>(`/api/transfers/flows${qs({ period: period.value, account: accountId ?? undefined })}`),
  })
  const flagCounts = useQueries({
    queries: (['split', 'unconfirmed', 'recurring'] as const).map((f) => ({
      queryKey: ['transactions', 'count', f, base],
      queryFn: () => api.get<TxPage>(`/api/transactions${qs({ ...base, [f]: true, take: 1 })}`).then((r) => r.total),
    })),
  })
  const flagCount: Record<TxFlag, number | undefined> = {
    split: flagCounts[0].data,
    unconfirmed: flagCounts[1].data,
    recurring: flagCounts[2].data,
    excluded: summary.data?.excluded,
    corrections: summary.data?.corrections,
  }

  const items = useMemo(() => list.data?.items ?? [], [list.data])
  const total = list.data?.total ?? 0

  // Bez filtru účtu se obě strany spárovaného převodu zobrazí jako jeden řádek (odchozí + protějšek).
  const rows = useMemo<ListRow[]>(() => {
    if (accountId != null) return items.map((tx) => ({ tx }))
    const byId = new Map(items.map((t) => [t.id, t]))
    const out: ListRow[] = []
    for (const tx of items) {
      const pair = isTransferKind(tx.kind) && tx.transferPairId ? byId.get(tx.transferPairId) : undefined
      if (pair && tx.amount > 0 && pair.amount < 0) continue
      out.push({ tx, pair })
    }
    return out
  }, [items, accountId])

  const groups = useMemo(() => {
    const map = new Map<string, ListRow[]>()
    for (const r of rows) {
      const arr = map.get(r.tx.date) ?? []
      arr.push(r)
      map.set(r.tx.date, arr)
    }
    return [...map.entries()].map(([date, rs]) => ({
      date,
      rows: rs,
      sum: rs.reduce((a, r) => a + countedCzk(r.tx, isExcluded), 0),
    }))
  }, [rows, isExcluded])

  const account = accountId != null ? accounts.byId.get(accountId) : undefined
  const memberName = member === 'all' ? null : members.get(member)?.name
  const subtitle = [
    periodLabel(period),
    list.data ? count(total, 'pohyb', 'pohyby', 'pohybů') : null,
    account ? accountLabel(account) : 'všechny účty',
    memberName ? `${memberName} a společné` : 'všichni členové',
  ].filter(Boolean).join(' · ')

  const showFlows = (kind === 'All' || kind === 'Transfer') && (flows.data?.length ?? 0) > 0
  const filtersActive = kind !== 'All' || flag !== null || !!search || accountId != null
  const fromLabel = !from ? null
    : from === 'all' ? 'vše'
      : from === 'ext' ? 'externě'
        : from.startsWith('m') ? members.get(Number(from.slice(1)))?.name ?? 'člen'
          : `z účtu ${accounts.byId.get(Number(from.slice(1)))?.name ?? '?'}`

  const header = (
    <PageHeader
      title="Pohyby"
      subtitle={subtitle}
      actions={(
        <>
          <Button icon={<Scale size={16} />} onClick={() => setCorrOpen(true)}>Korekce zůstatku</Button>
          <Button variant="primary" icon={<Plus size={16} />} onClick={() => setAddOpen(true)}>Přidat pohyb</Button>
        </>
      )}
      tools={(
        <>
          <PeriodPicker allowCompare={false} />
          <MemberSwitch full={isMobile} />
          <Segmented<KindFilter> aria-label="Druh pohybu" className={s.hideMobile} value={kind} onChange={setKind} options={KIND_OPTIONS} />
          <label className={s.search}>
            <Search size={16} color="var(--ink-3)" />
            <input value={searchText} onChange={(e) => setSearchText(e.target.value)} placeholder="Hledat obchodníka, poznámku, částku…" aria-label="Hledat" />
            {searchText && <button type="button" onClick={() => setSearchText('')} aria-label="Vymazat hledání"><X size={14} /></button>}
          </label>
        </>
      )}
    />
  )

  const dialogs = (
    <>
      <AddTransactionDialog key={`add-${accountId ?? ''}`} open={addOpen} onOpenChange={setAddOpen} defaultAccountId={accountId} onCreated={(id) => select(id)} />
      <CorrectionDialog key={`corr-${accountId ?? ''}`} open={corrOpen} onOpenChange={setCorrOpen} defaultAccountId={accountId} onCreated={(id) => select(id)} />
    </>
  )

  if (isMobile && selId) {
    return (
      <>
        <TransactionPanel id={selId} variant="page" onClose={closeDetail} onOpen={(id) => select(id)} />
        {dialogs}
      </>
    )
  }

  return (
    <>
      {header}

      <div className={s.filters}>
        <span className={s.filtersLabel}>Zobrazit jen</span>
        <AccountFilter value={accountId} onChange={setAccountId} />
        {KIND_OPTIONS.filter((k) => k.value !== 'All').map((k) => (
          <button key={k.value} type="button" className={clsx(commonStyles.chip, s.onlyMobileChip, kind === k.value && commonStyles.chipOn)}
            aria-pressed={kind === k.value} onClick={() => setKind(kind === k.value ? 'All' : k.value)}>
            {k.label}
          </button>
        ))}
        {FLAGS.map((f) => {
          const Icon = FLAG_ICONS[f]
          const on = flag === f
          return (
            <button key={f} type="button" className={clsx(commonStyles.chip, on && commonStyles.chipOn)} aria-pressed={on} onClick={() => setFlag(on ? null : f)}>
              <Icon size={12} />
              {FLAG_LABELS[f]}
              {flagCount[f] != null && <span className={s.chipCount}>{num(flagCount[f]!)}</span>}
            </button>
          )
        })}
        {fromLabel && (
          <button type="button" className={clsx(commonStyles.chip, commonStyles.chipOn)} onClick={() => setFrom(null)} title="Zrušit filtr zdroje">
            Příchozí · {fromLabel} <X size={12} />
          </button>
        )}
        {filtersActive && (
          <button type="button" className={s.clear} onClick={() => { setKind('All'); setFlag(null); setSearchText(''); setAccountId(null) }}>
            Zrušit filtry
          </button>
        )}
      </div>

      <div className={s.layout}>
        <section className={s.main}>
          {showFlows && <FlowsCard flows={flows.data!} accountId={accountId} from={from} onPick={setAccountId} onPickCell={pickFlow} />}

          <div className={s.summary}>
            <SummaryCard label="Výdaje" value={summary.data ? <Money value={-summary.data.expense} sign /> : null}
              note={summary.data?.refunds ? <>vč. vratek <Money value={summary.data.refunds} sign /></> : periodLabel(period)} />
            <SummaryCard label="Příjmy" value={summary.data ? <Money value={summary.data.income} sign /> : null} color="var(--pos)"
              note={summary.data ? count(summary.data.incomeCount, 'příjem', 'příjmy', 'příjmů') : ''} />
            <SummaryCard label="Převody" value={summary.data ? num(summary.data.transfers) : null} note="mimo výdaje i příjmy" />
            <SummaryCard label="Mimo statistiky" value={summary.data ? num(summary.data.excluded + summary.data.corrections) : null} color="var(--ink-3)"
              note="nezapočítávané a korekce" />
          </div>

          <div className={s.list}>
            {list.isLoading ? (
              <div className={s.loading}>{[0, 1, 2, 3, 4, 5].map((i) => <Skeleton key={i} height={44} />)}</div>
            ) : groups.length === 0 ? (
              <Empty title="Žádné pohyby neodpovídají filtru">
                {filtersActive ? 'Zkus zrušit některý filtr nebo změnit období.' : 'V tomto období zatím nejsou žádné pohyby.'}
              </Empty>
            ) : (
              groups.map((g) => (
                <div key={g.date} className={s.day}>
                  <div className={s.dayHead}>
                    <span>{dayHeading(g.date)}</span>
                    {g.sum !== 0 && <Money value={g.sum} sign />}
                  </div>
                  <div className={s.dayRows}>
                    {g.rows.map((r) => (
                      <TxListRow key={r.tx.id} row={r} selected={selId === r.tx.id} accountFiltered={accountId != null}
                        open={openSplits.has(r.tx.id)}
                        onToggle={() => setOpenSplits((o) => {
                          const n = new Set(o)
                          if (n.has(r.tx.id)) n.delete(r.tx.id)
                          else n.add(r.tx.id)
                          return n
                        })}
                        onSelect={() => select(r.tx.id)} />
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
          {items.length < total && (
            <Button variant="secondary" className={s.more} loading={list.isFetching} onClick={() => setTake((t) => t + PAGE)}>
              Zobrazit další ({num(total - items.length)})
            </Button>
          )}
        </section>

        {!isMobile && (
          <div className={s.side}>
            {selId ? (
              <TransactionPanel id={selId} onClose={() => select(null)} onOpen={(id) => select(id)} />
            ) : (
              <div className={s.placeholder}>
                <Empty title="Vyber pohyb">Detail pohybu se zobrazí tady. Můžeš ho zařadit, rozdělit, potvrdit nebo spárovat převod.</Empty>
              </div>
            )}
          </div>
        )}
      </div>
      {dialogs}
    </>
  )
}

// ---------- Souhrny ----------

function SummaryCard({ label, value, note, color }: { label: string; value: ReactNode; note?: ReactNode; color?: string }) {
  return (
    <div className={s.stat}>
      <span className={s.statLabel}>{label}</span>
      <span className={s.statValue} style={{ color }}>{value ?? <Skeleton height={22} width={90} />}</span>
      {note && <span className={s.statNote}>{note}</span>}
    </div>
  )
}

// ---------- Filtr účtu ----------

function accountSub(a: Account, members: ReturnType<typeof useMembers>) {
  const shares = a.ratio.filter((r) => r.percent > 0)
  if (shares.length > 1) return `${shares.map((r) => members.get(r.memberId)?.name ?? '?').join(' a ')} · poměr ${ratioLabel(shares)}`
  if (a.ownerMemberId) return members.get(a.ownerMemberId)?.name ?? ''
  return a.joint ? 'společný' : ''
}

function AccountFilter({ value, onChange }: { value: number | null; onChange: (id: number | null) => void }) {
  const accounts = useAccounts()
  const members = useMembers()
  const [open, setOpen] = useState(false)
  const current = value != null ? accounts.byId.get(value) : undefined
  const opts: { id: number | null; label: string; sub?: string }[] = [
    { id: null, label: 'Všechny účty' },
    ...accounts.list.filter((a) => !a.archived).map((a) => ({ id: a.id, label: accountLabel(a), sub: accountSub(a, members) })),
  ]
  return (
    <Popover open={open} onOpenChange={setOpen} width={300} trigger={(
      <button type="button" className={clsx(commonStyles.chip, current && commonStyles.chipOn)}>
        <span className="ellipsis" style={{ maxWidth: 220 }}>{current ? accountLabel(current) : 'Všechny účty'}</span>
        <ChevronDown size={14} />
      </button>
    )}>
      <div className={s.radioList}>
        {opts.map((o) => {
          const on = o.id === value
          return (
            <PopoverClose asChild key={o.id ?? 'all'}>
              <button type="button" className={clsx(s.radioItem, on && s.radioItemOn)} onClick={() => onChange(o.id)}>
                <span className={clsx(s.radio, on && s.radioOn)}><span /></span>
                <span className="col grow" style={{ gap: 0 }}>
                  <span className="ellipsis" style={{ fontSize: 13, fontWeight: 700 }}>{o.label}</span>
                  {o.sub && <span className="ellipsis" style={{ fontSize: 11, color: 'var(--ink-3)' }}>{o.sub}</span>}
                </span>
              </button>
            </PopoverClose>
          )
        })}
      </div>
    </Popover>
  )
}

// ---------- Kdo kolik poslal ----------

const FLOW_LIMIT = 5

/** Malý koláč podílů odesílatelů. */
function MiniPie({ parts, size = 24 }: { parts: { value: number; color: string }[]; size?: number }) {
  const total = parts.reduce((a, p) => a + p.value, 0) || 1
  const r = size / 2
  let a = -Math.PI / 2
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className={s.flowPie} aria-hidden>
      {parts.length === 1 ? <circle cx={r} cy={r} r={r} fill={parts[0].color} /> : parts.map((p, i) => {
        const a1 = a + (p.value / total) * Math.PI * 2
        const large = a1 - a > Math.PI ? 1 : 0
        const d = `M${r} ${r}L${r + r * Math.cos(a)} ${r + r * Math.sin(a)}A${r} ${r} 0 ${large} 1 ${r + r * Math.cos(a1)} ${r + r * Math.sin(a1)}Z`
        a = a1
        return <path key={i} d={d} fill={p.color} stroke="var(--surface)" strokeWidth={1} />
      })}
    </svg>
  )
}

/** Tabulka převodů na účty: kdo kolik poslal (sloupec za člena / zdrojový účet), koláč podílů a srovnání s poměrem. */
function FlowsCard({ flows, accountId, from, onPick, onPickCell }: {
  flows: TransferFlow[]
  accountId: number | null
  from: string | null
  onPick: (id: number) => void
  /** Proklik na částku: filtr pohybů na účet a zdroj (null = zrušit). */
  onPickCell: (id: number, key: string | null) => void
}) {
  const { period } = useUi()
  const accounts = useAccounts()
  const members = useMembers()
  const fm = useMoney()
  const mobile = useIsMobile()
  const [all, setAll] = useState(false)
  const target = accountId != null ? accounts.byId.get(accountId) : undefined

  // Sloupce = odesílatelé napříč účty: členové v pořadí domácnosti, pak zdrojové účty
  const senderKey = (x: TransferFlow['senders'][number]) => (x.external ? 'ext' : x.memberId != null ? `m${x.memberId}` : `a${x.fromAccountId ?? ''}`)
  const colMap = new Map<string, { key: string; label: string; short: string; color: string; order: number }>()
  for (const f of flows) for (const x of f.senders) {
    if (x.amount <= 0) continue
    const key = senderKey(x)
    if (colMap.has(key)) continue
    const m = x.memberId != null ? members.get(x.memberId) : undefined
    const src = x.fromAccountId != null ? accounts.byId.get(x.fromAccountId) : undefined
    colMap.set(key, {
      key,
      label: x.external ? 'Externě' : m ? m.name : src && !src.joint ? `Z účtu ${src.name}` : 'Ze společného',
      short: x.external ? 'externě' : m ? m.name : src && !src.joint ? src.name : 'společný',
      color: x.external ? 'var(--none)' : m ? tokenColor(m.colorToken) : 'var(--ink-3)',
      order: x.external ? 10_000 : m ? [...members.keys()].indexOf(m.id) : 1000 + (src ? accounts.list.indexOf(src) : accounts.list.length),
    })
  }
  const cols = [...colMap.values()].sort((a, b) => a.order - b.order)

  // Účty v nastaveném pořadí (jako na Účtech a ve výběru účtu)
  const rank = (id: number) => { const i = accounts.list.findIndex((a) => a.id === id); return i < 0 ? accounts.list.length : i }
  const rows = [...flows].sort((a, b) => rank(a.accountId) - rank(b.accountId)).map((f) => {
    const acc = accounts.byId.get(f.accountId)
    const by = new Map<string, number>()
    for (const x of f.senders) if (x.amount > 0) by.set(senderKey(x), (by.get(senderKey(x)) ?? 0) + x.amount)
    const share = (v: number) => `${f.total ? Math.round((v / f.total) * 100) : 0} %`
    // Porovnání s výchozím poměrem společného účtu
    let note: string | null = null
    let noteStrong = false
    const ratio = acc?.ratio.filter((r) => r.percent > 0) ?? []
    if (ratio.length > 1) {
      const byMember = ratio.map((r) => ({ r, sent: by.get(`m${r.memberId}`) ?? 0 }))
      const sum = byMember.reduce((a, x) => a + x.sent, 0)
      if (sum > 0) {
        const top = byMember.map((x) => ({ ...x, d: x.sent - (sum * x.r.percent) / 100 })).sort((a, b) => b.d - a.d)[0]
        if (Math.abs(top.d) < 500) note = `Odpovídá výchozímu poměru ${ratioLabel(ratio)}.`
        else {
          note = `Od ${members.get(top.r.memberId)?.name ?? 'člena'} přišlo o ${fm(top.d)} víc, než odpovídá výchozímu poměru ${ratioLabel(ratio)}.`
          noteStrong = true
        }
      }
    }
    const used = cols.filter((c) => by.has(c.key))
    return {
      f, name: acc ? accountLabel(acc) : 'účet', note, noteStrong,
      pie: used.map((c) => ({ value: by.get(c.key)!, color: c.color })),
      cells: cols.map((c) => ({ key: c.key, value: by.get(c.key) ?? 0, share: by.has(c.key) ? share(by.get(c.key)!) : '' })),
      split: used.map((c) => `${c.short} ${share(by.get(c.key)!)}`).join(' · '),
    }
  })
  const shown = all ? rows : rows.slice(0, FLOW_LIMIT)
  const rest = rows.length - FLOW_LIMIT

  return (
    <div className={s.flows}>
      <div className={s.flowsHead}>
        <span className={s.flowsTitle}>{target ? `Kdo kolik poslal na ${target.name}` : 'Kdo kolik poslal na účty'}</span>
        <span className={s.flowsSub} title="Na společné účty i příchozí platby zvenčí: připsané členovi jdou za ním, ostatní jako externě">{periodLabel(period)} · převody mezi účty a příchozí peníze na společné účty</span>
      </div>
      {mobile ? (
        <div className="col" style={{ gap: 0 }}>
          {shown.map((r) => (
            <button key={r.f.accountId} type="button" className={clsx(s.flowRowMobile, accountId === r.f.accountId && from === 'all' && s.flowCellOn)}
              onClick={() => onPickCell(r.f.accountId, 'all')} title="Zobrazit příchozí peníze na tento účet">
              <MiniPie parts={r.pie} />
              <span className="col" style={{ gap: 1, flex: 1, minWidth: 0 }}>
                <span className={clsx('ellipsis', s.flowName)}>{r.name}</span>
                <span className={clsx('ellipsis', s.flowNote)}>{r.split}</span>
              </span>
              <Money value={r.f.total} className={s.flowTotal} />
            </button>
          ))}
        </div>
      ) : (
        <div className={s.flowTable} style={{ gridTemplateColumns: `42px minmax(0, 1fr) ${cols.map(() => '118px').join(' ')} 124px` }}>
          <span /><span className={s.flowTh} style={{ justifyContent: 'flex-start' }}>Na účet</span>
          {cols.map((c) => (
            <span key={c.key} className={s.flowTh}><span className={s.flowDot} style={{ background: c.color }} />{c.label}</span>
          ))}
          <span className={s.flowTh}>Celkem</span>
          {shown.map((r) => (
            <div key={r.f.accountId} style={{ display: 'contents' }}>
              <span className={s.flowTd}><MiniPie parts={r.pie} /></span>
              <button type="button" className={clsx(s.flowTd, s.flowNameCell)} onClick={() => onPick(r.f.accountId)} title="Filtrovat na tento účet">
                <span className={clsx('ellipsis', s.flowName)}>{r.name}</span>
                {r.note && <span className={clsx('ellipsis', s.flowNote)} style={{ color: r.noteStrong ? 'var(--ink-2)' : undefined }} title={r.note}>{r.note}</span>}
              </button>
              {r.cells.map((c) => c.value ? (
                <button key={c.key} type="button" className={clsx(s.flowTd, s.flowCell, s.flowCellBtn, accountId === r.f.accountId && from === c.key && s.flowCellOn)}
                  onClick={() => onPickCell(r.f.accountId, c.key)} title="Zobrazit tyto pohyby">
                  <Money value={c.value} className={s.flowVal} />
                  <span className={s.flowShare}>{c.share}</span>
                </button>
              ) : (
                <div key={c.key} className={clsx(s.flowTd, s.flowCell)}>
                  <span className={s.flowVal} style={{ color: 'var(--ink-3)' }}>—</span>
                </div>
              ))}
              <button type="button" className={clsx(s.flowTd, s.flowCell, s.flowCellBtn, accountId === r.f.accountId && from === 'all' && s.flowCellOn)}
                onClick={() => onPickCell(r.f.accountId, 'all')} title="Zobrazit všechny příchozí peníze na účet">
                <Money value={r.f.total} className={s.flowTotal} />
              </button>
            </div>
          ))}
        </div>
      )}
      {rest > 0 && (
        <button type="button" className={s.flowMore} onClick={() => setAll((v) => !v)}>
          {all ? 'Zobrazit méně' : `Zobrazit další ${count(rest, 'účet', 'účty', 'účtů')}`}
        </button>
      )}
    </div>
  )
}

// ---------- Řádek seznamu ----------

interface Badge { label: string; tone: 'dashed' | 'neutral' | 'warn' | 'pos' | 'line'; icon?: LucideIcon }

function TxListRow({ row, selected, open, onToggle, onSelect, accountFiltered }: {
  row: ListRow
  selected: boolean
  open: boolean
  onToggle: () => void
  onSelect: () => void
  accountFiltered: boolean
}) {
  const { tx, pair } = row
  const accounts = useAccounts()
  const members = useMembers()
  const cats = useCategories()
  const effNeed = useEffectiveNeed()
  const fm = useMoney()

  const acct = accounts.byId.get(tx.accountId)
  const acctName = accountLabel(acct)
  const isSplit = tx.splits.length > 0
  const excl = isExcludedTx(tx, cats.isExcluded)
  const unconfirmed = tx.status === 'Suggested'
  const transfer = isTransferKind(tx.kind)
  const incoming = transfer && tx.amount > 0
  const pairAcctId = pair?.accountId ?? tx.transferPairAccountId
  const pairAcct = pairAcctId != null ? accounts.byId.get(pairAcctId) : undefined
  // Na společný účet: za kým peníze jdou (člen / poměr), jinak komu pohyb patří
  const who = contributorLabel(tx, acct, pairAcct, members) ?? whoLabel(tx.shares, members)
  const cat = tx.categoryId != null ? cats.byId.get(tx.categoryId) : undefined
  const color = cats.colorOf(tx.categoryId)

  // Ikona vlevo
  const [Icon, iconCls]: [LucideIcon | null, string] =
    tx.kind === 'InvestmentTransfer' ? [TrendingUp, s.iconNeutral]
      : tx.kind === 'Transfer' ? [ArrowLeftRight, s.iconNeutral]
        : tx.kind === 'Correction' ? [Scale, s.iconCorrection]
          : tx.kind === 'Refund' ? [Undo2, s.iconRefund]
            : excl ? [Ban, s.iconMuted] : [null, '']

  const badges: Badge[] = []
  if (incoming && accountFiltered) badges.push({ label: 'Příchozí převod', tone: 'pos', icon: Link2 })
  if (unconfirmed) badges.push({ label: 'Nepotvrzeno', tone: 'dashed' })
  if (tx.betweenMembers) badges.push({ label: 'Mezi členy', tone: 'line', icon: ArrowLeftRight })
  if (tx.kind === 'Transfer') badges.push(tx.transferPairId ? { label: 'Spárováno', tone: 'neutral', icon: Link2 } : { label: 'Nespárováno', tone: 'warn', icon: Link2 })
  if (tx.kind === 'InvestmentTransfer') badges.push({ label: 'Nákup investice', tone: 'neutral', icon: TrendingUp })
  if (tx.kind === 'Refund') badges.push({ label: 'Vratka', tone: 'pos' })
  if (tx.kind === 'Correction') badges.push({ label: 'Korekce', tone: 'dashed' })
  if (excl) badges.push({ label: 'Nezapočítává se', tone: 'neutral', icon: Ban })
  if (tx.isRecurring) badges.push({ label: 'Pravidelná', tone: 'line', icon: Repeat })
  if (tx.suspectedDuplicateOfId) badges.push({ label: 'Duplicita?', tone: 'warn' })

  const catTxt = isSplit
    ? tx.splits.map((p) => cats.nameOf(p.categoryId)).join(' + ')
    : transfer
      ? `${incoming ? '← ' : '→ '}${pairAcct ? accountLabel(pairAcct) : 'nespárováno'}${tx.betweenMembers ? ` · ${cat ? cat.path : 'Nezařazeno'}` : ''}`
      : tx.kind === 'Correction'
        ? 'Zůstatek dle výpisu'
        : cat ? cat.path : 'Nezařazeno'
  const meta = `${acctName} · ${who}${catTxt ? ` · ${catTxt}` : ''}`
  const metaShort = `${catTxt || acctName} · ${who}`

  const neutral = transfer || tx.kind === 'Correction' || excl
  const amtColor = incoming && accountFiltered ? 'var(--pos)' : neutral ? 'var(--ink-3)' : tx.amount > 0 ? 'var(--pos)' : 'var(--ink)'
  const foreign = tx.currency !== 'CZK'
  const sub = foreign
    ? `≈ ${fm(tx.amountCzk, { sign: true })}`
    : pair && pair.currency !== tx.currency
      ? fm(pair.amount, { currency: pair.currency, sign: true })
      : null
  const need = tx.kind === 'Expense' && !isSplit && !excl && cat ? effNeed(tx.categoryId, tx.needOverride) : null
  const abs = Math.abs(tx.amount) || 1

  return (
    <div className={s.rowWrap}>
      <div role="button" tabIndex={0} className={clsx(s.row, selected && s.rowOn, tx.kind === 'Correction' && s.rowCorrection)}
        onClick={onSelect} onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onSelect())} aria-current={selected || undefined}>
        <span className={clsx(s.icon, iconCls, isSplit && s.iconSplit)}
          style={!isSplit && !Icon ? { background: `color-mix(in oklch, ${color} 14%, var(--surface))` } : undefined}>
          {isSplit ? (
            <span className={s.miniBar}>
              {tx.splits.map((p, i) => <span key={i} style={{ flex: Math.abs(p.amount), background: cats.colorOf(p.categoryId) }} />)}
            </span>
          ) : Icon ? <Icon size={16} /> : <span className={s.catDot} style={{ background: color }} />}
        </span>
        <div className={s.rowText}>
          <div className={s.rowTitle}>
            <span className={s.rowName}>{tx.counterparty}</span>
            {unconfirmed && <span className={s.unconfDot} title="Nepotvrzeno" />}
            {badges.map((b) => (
              <span key={b.label} className={clsx(s.badge, s[`badge_${b.tone}`])}>
                {b.icon && <b.icon size={10} />}{b.label}
              </span>
            ))}
          </div>
          <span className={clsx(s.meta, s.metaDesktop)}>{meta}</span>
          <span className={clsx(s.meta, s.metaMobile)}>{metaShort}</span>
        </div>
        <div className={s.rowMid}>
          {need && <NeedChip need={need.need} inherited={need.inherited} />}
          {isSplit && (
            <button type="button" className={s.expand} aria-expanded={open} onClick={(e) => (e.stopPropagation(), onToggle())}>
              <ChevronDown size={14} style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .18s' }} />
              {tx.splits.length} části
            </button>
          )}
        </div>
        <div className={s.rowAmt}>
          <Money value={tx.amount} currency={tx.currency} sign className={s.amount} style={{ color: amtColor, textDecoration: excl ? 'line-through' : undefined }} />
          {sub && <span className={s.amountSub}>{sub}</span>}
        </div>
      </div>
      {isSplit && open && (
        <div className={s.parts}>
          {tx.splits.map((p, i) => {
            const c = cats.byId.get(p.categoryId)
            const parent = c?.parentId ? cats.byId.get(c.parentId) : undefined
            const n = effNeed(p.categoryId, p.needOverride)
            const pct = (Math.abs(p.amount) / abs) * 100
            return (
              <div key={i} className={s.part}>
                <span className={s.partDot} style={{ background: cats.colorOf(p.categoryId) }} />
                <span className="ellipsis">{parent && <span className="faint">{parent.name} › </span>}{c?.name ?? '?'}</span>
                <span title={needLabel[n.need]}><NeedChip need={n.need} inherited={n.inherited} /></span>
                <span className="faint" style={{ textAlign: 'right' }}>{num(pct, pct % 1 ? 1 : 0)} %</span>
                <Money value={p.amount} currency={tx.currency} sign style={{ fontWeight: 700, textAlign: 'right' }} />
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

