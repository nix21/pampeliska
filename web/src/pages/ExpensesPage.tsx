import { useInfiniteQuery } from '@tanstack/react-query'
import clsx from 'clsx'
import { ChevronDown, ChevronLeft, Eye, EyeOff, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { PageHeader } from '../components/AppShell'
import { MonthlyStack, Sunburst, Treemap, useIsMobile, type StackColumn } from '../components/charts'
import { ConfirmedToggle, MemberSwitch, PeriodPicker, useMoney } from '../components/common'
import { NeedPill, RingCenter, Swatch } from '../components/overview/parts'
import { PaymentEditor } from '../components/overview/PaymentEditor'
import { childColor, drilledTiles, expenseDeltaColor, formatDelta, ringNodes, tileNodes, topColor, type ColorMode } from '../components/overview/spending'
import { useEffectiveNeed } from '../components/category'
import { Card, Segmented, Spinner } from '../components/ui'
import { useAccounts } from '../lib/accounts'
import { api, notifyError, qs } from '../lib/api'
import { needLabel, useCategories } from '../lib/categories'
import { count, dateShort, monthNames, pct, short } from '../lib/format'
import {
  buildExpenseTree, compareShort, deltaPct, monthKeyLabel, monthKeyShort, needVar, tokenVar, txShare, useExpenseTree, usePreference,
} from '../lib/stats'
import type { TxPage, TxRow } from '../lib/types'
import { periodLabel, periodMonths, useMembers, useUi } from '../state/ui'
import s from './ExpensesPage.module.css'

type View = 'ring' | 'tree' | 'trend'
const PAGE = 200
const COLOR_OPTS = [{ value: 'cat' as const, label: 'Kategorie' }, { value: 'need' as const, label: 'Nezbytné / radost' }]

interface Row {
  tx: TxRow
  /** Zobrazená částka (kladná = výdaj): jen části ve výběru, u člena jen jeho podíl. */
  shown: number
  note: string
  month: string
}

/** Výdaje: prstenec / treemap / vývoj po měsících s rozpadem kategorií, skrývání kategorií a seznam plateb s úpravou. */
export default function ExpensesPage() {
  const { filterParams, period, compare, member, household, hidden: amountsHidden } = useUi()
  const mobile = useIsMobile()
  const cats = useCategories()
  const money = useMoney()
  const members = useMembers()
  const { byId: accById } = useAccounts()
  const effNeed = useEffectiveNeed()

  const [mode, setMode] = useState<ColorMode>('cat')
  const [viewPref, setView] = useState<View>(household.settings.mainChart === 'Treemap' ? 'tree' : 'ring')
  const [sel, setSelRaw] = useState<number | null>(null)
  const [sub, setSubRaw] = useState<number | null>(null)
  const [monthSel, setMonthSel] = useState<{ scope: string; value: string } | null>(null)
  const [sort, setSort] = useState<'date' | 'amt'>('date')
  const [limitSel, setLimitSel] = useState({ key: '', n: 20 })
  const [open, setOpen] = useState<number | null>(null)
  const [hiddenIds, setHiddenIds] = usePreference<number[]>('vydaje.hidden', [])

  const setSel = (v: number | null) => (setSelRaw(v), setSubRaw(null))
  const setSub = setSubRaw
  // Výběr měsíce platí jen pro období a člena, ve kterém vznikl
  const scope = `${period.value}|${member}`
  const month = monthSel?.scope === scope ? monthSel.value : null
  const setMonth = (v: string | null) => setMonthSel(v ? { scope, value: v } : null)

  const months = periodMonths(period)
  const multi = months > 1
  const view: View = viewPref === 'trend' && !multi ? 'ring' : viewPref

  // ---------- Data ----------
  const full = useExpenseTree(filterParams)
  const monthTree = useExpenseTree({ ...filterParams, period: month ?? filterParams.period }, !!month)
  const tree = month ? monthTree.data : full.data
  const hiddenSet = useMemo(() => new Set(hiddenIds), [hiddenIds])
  const hiddenDesc = useMemo(() => {
    const set = new Set<number>()
    for (const h of hiddenIds) for (const d of cats.descendants(h)) set.add(d)
    return set
  }, [hiddenIds, cats])

  const allTops = useMemo(() => (tree ? buildExpenseTree(cats, tree.categories) : []), [cats, tree])
  const visTops = allTops.filter((t) => !hiddenSet.has(t.id) && t.amount > 0)
  const hiddenTops = allTops.filter((t) => hiddenSet.has(t.id))
  const total = visTops.reduce((a, t) => a + t.amount, 0)
  const prevTotal = allTops.filter((t) => !hiddenSet.has(t.id)).reduce((a, t) => a + t.previous, 0)
  const selCat = visTops.find((t) => t.id === sel)
  const selSub = selCat?.children.find((c) => c.id === sub && !c.synthetic)

  const cmpLbl = month ? `vs. ${monthNames[(Number(month.slice(5)) + 10) % 12]}` : compareShort(period)
  const dTotal = compare ? deltaPct(total, prevTotal) : null
  const offNames = hiddenIds.map((id) => cats.nameOf(id))

  const toggleHidden = (id: number) => {
    const next = hiddenSet.has(id) ? hiddenIds.filter((x) => x !== id) : [...hiddenIds, id]
    setHiddenIds(next).catch(notifyError)
    if (sel === id) setSel(null)
  }
  const showAll = () => setHiddenIds([]).catch(notifyError)
  const goBack = () => (sub != null ? setSub(null) : setSel(null))

  // ---------- Graf ----------
  const center = selSub
    ? { title: selSub.name, value: money(selSub.amount), sub: 'Klikněte pro krok zpět' }
    : selCat
      ? { title: selCat.name, value: money(selCat.amount), sub: 'Klikněte pro krok zpět' }
      : {
        title: month ? monthKeyLabel(month) : 'Výdaje celkem',
        value: money(total),
        sub: multi && !month ? `průměr ${amountsHidden ? '•••' : short(total / months)} / měs.` : count(visTops.length, 'kategorie', 'kategorie', 'kategorií'),
      }

  const fullTops = useMemo(() => (full.data ? buildExpenseTree(cats, full.data.categories) : []), [cats, full.data])
  const columns: StackColumn[] = (full.data?.months ?? []).map((m) => {
    const by = m.byTopCategory
    if (selCat) return { key: m.month, label: monthKeyShort(m.month), segments: [{ key: selCat.id, value: by[String(selCat.id)] ?? 0, color: tokenVar(selCat.token), label: selCat.name }] }
    const visible = Object.entries(by).filter(([k]) => !hiddenSet.has(Number(k))).reduce((a, [, v]) => a + v, 0)
    if (mode === 'need') {
      const f = m.expense > 0 ? visible / m.expense : 0
      return {
        key: m.month, label: monthKeyShort(m.month), segments: [
          { key: 'Need', value: m.needs.need * f, color: needVar('Need'), label: 'Nezbytné' },
          { key: 'Joy', value: m.needs.joy * f, color: needVar('Joy'), label: 'Pro radost' },
          { key: 'None', value: m.needs.none * f, color: needVar('None'), label: 'Neoznačené' },
        ],
      }
    }
    return {
      key: m.month, label: monthKeyShort(m.month),
      segments: fullTops.filter((t) => !hiddenSet.has(t.id)).map((t) => ({ key: t.id, value: by[String(t.id)] ?? 0, color: tokenVar(t.token), label: t.name })),
    }
  })
  // popisky s rokem, když období přesahuje rok
  const years = new Set(columns.map((c) => c.key.slice(0, 4)))
  if (years.size > 1) columns.forEach((c, i) => { if (i === 0 || c.key.endsWith('-01')) c.label = `${c.label} ${c.key.slice(2, 4)}` })

  const size = mobile ? 270 : 340
  const chart = !tree ? <Spinner center /> : visTops.length === 0 && view !== 'trend' ? (
    <div className={s.emptyChart}>V tomto výběru nejsou žádné výdaje.</div>
  ) : view === 'ring' ? (
    <div style={{ display: 'flex', justifyContent: 'center' }}>
      <Sunburst size={size} items={ringNodes(selCat ? [selCat] : visTops, mode)} aria-label="Výdaje podle kategorií"
        isDimmed={(node, parent) => !!parent && sub != null && node.id !== sub}
        onItemClick={(it) => setSel(sel != null ? null : Number(it.id))}
        onChildClick={(ch, parent) => {
          const pid = Number(parent.id)
          if (sel !== pid) setSelRaw(pid)
          setSub(ch.disabled || (sel === pid && sub === ch.id) ? null : Number(ch.id))
        }}
        onCenterClick={selCat ? goBack : undefined}
        center={<RingCenter title={center.title} value={center.value} sub={center.sub} small={mobile} />} />
    </div>
  ) : view === 'tree' ? (
    <Treemap height={mobile ? 300 : 360} formatValue={(v) => money(v)} formatShare={(x) => pct(x * 100)}
      items={selCat ? drilledTiles(selCat, mode) : tileNodes(visTops, mode)}
      isDimmed={(tile) => !!selCat && sub != null && tile.id !== sub}
      onTileClick={(tile, group) => {
        if (selCat) return !tile.disabled && setSub(sub === tile.id ? null : Number(tile.id))
        if (!group) return
        setSelRaw(Number(group.id))
        setSub(tile.disabled ? null : Number(tile.id))
      }} />
  ) : (
    <MonthlyStack columns={columns} height={mobile ? 200 : 280} formatShort={(v) => (amountsHidden ? '•••' : short(v))} selectedKey={month}
      onColumnClick={(c) => setMonth(month === c.key ? null : c.key)}
      onSegmentClick={(c, seg) => {
        if (!selCat && mode === 'cat') {
          setSel(Number(seg.key))
          setMonth(c.key)
        } else setMonth(month === c.key ? null : c.key)
      }} />
  )

  // ---------- Legenda ----------
  const legend = selCat
    ? selCat.children.map((c, i) => {
      const on = sub === c.id
      const d = compare ? deltaPct(c.amount, c.previous) : null
      return {
        key: c.id, name: c.name, value: money(c.amount), share: pct((c.amount / (selCat.amount || 1)) * 100), delta: compare ? formatDelta(d) : '',
        deltaColor: expenseDeltaColor(d), color: childColor(selCat, c, i, mode), on, dim: sub != null && !on, off: false,
        onClick: c.synthetic ? undefined : () => setSub(on ? null : c.id), eye: false,
      }
    })
    : [...visTops, ...hiddenTops].map((t) => {
      const off = hiddenSet.has(t.id)
      const d = compare && !off ? deltaPct(t.amount, t.previous) : null
      return {
        key: t.id, name: t.name, value: money(t.amount), share: off ? 'skryto' : pct((t.amount / (total || 1)) * 100), delta: off || !compare ? '' : formatDelta(d),
        deltaColor: expenseDeltaColor(d), color: off ? 'transparent' : topColor(t, 'cat'), on: false, dim: false, off,
        onClick: off ? () => toggleHidden(t.id) : t.amount > 0 ? () => setSel(t.id) : undefined, eye: t.id !== 0,
      }
    })
  const levelName = selSub?.name ?? selCat?.name ?? 'Všechny kategorie'
  const backTitle = selSub ? `Zpět na ${selCat?.name}` : 'Zpět na všechny kategorie'

  const legendBlock = (
    <div className="col" style={{ gap: 0, minWidth: 0 }}>
      <div className={s.levelHead}>
        {selCat && <button type="button" className={s.backBtn} title={backTitle} aria-label={backTitle} onClick={goBack}><ChevronLeft size={mobile ? 18 : 14} /></button>}
        <span className={s.levelName}>{levelName}</span>
        {!mobile && compare && <span className={s.legendHead}>Podíl · {cmpLbl}</span>}
      </div>
      {legend.map((l) => (
        <div key={l.key} className={clsx(s.legendRow, l.on && s.legendRowOn, l.onClick && s.clickable)} style={{ opacity: l.off ? 0.55 : l.dim ? 0.5 : 1 }}
          role={l.onClick ? 'button' : undefined} tabIndex={l.onClick ? 0 : undefined}
          onClick={l.onClick} onKeyDown={(e) => e.key === 'Enter' && l.onClick?.()}>
          <Swatch color={l.color} />
          <span className="ellipsis" style={{ fontWeight: l.on ? 800 : 500, color: l.off ? 'var(--ink-3)' : 'var(--ink)' }}>{l.name}</span>
          <span className={s.legendValue} style={{ textDecoration: l.off ? 'line-through' : undefined, color: l.off ? 'var(--ink-3)' : undefined }}>{l.value}</span>
          {!mobile && <span className={s.legendShare}>{l.share}</span>}
          <span className={s.legendDelta} style={{ color: l.deltaColor }}>{l.delta}</span>
          {l.eye ? (
            <button type="button" className={clsx(s.eyeBtn, l.off && s.eyeBtnOff)} title={l.off ? 'Vrátit do přehledu' : 'Skrýt z přehledu'}
              aria-label={l.off ? `Vrátit ${l.name} do přehledu` : `Skrýt ${l.name} z přehledu`}
              onClick={(e) => (e.stopPropagation(), toggleHidden(Number(l.key)))}>
              {l.off ? <EyeOff size={15} /> : <Eye size={15} />}
            </button>
          ) : <span />}
        </div>
      ))}
    </div>
  )

  // ---------- Platby ----------
  const txParams = {
    period: month ?? period.value,
    member: filterParams.member,
    confirmedOnly: filterParams.confirmedOnly,
    kind: 'Expense',
    category: sub ?? (sel != null && sel > 0 ? sel : undefined),
    uncategorized: sel === 0 || undefined,
    sort: sort === 'amt' ? 'AmountDesc' : 'DateDesc',
  }
  // Počet zobrazených plateb se vrací na 20 při každé změně filtru
  const listKey = JSON.stringify([txParams, hiddenIds])
  const limit = limitSel.key === listKey ? limitSel.n : 20
  const txq = useInfiniteQuery({
    queryKey: ['transactions', 'vydaje', txParams],
    initialPageParam: 0,
    queryFn: ({ pageParam }) => api.get<TxPage>(`/api/transactions${qs({ ...txParams, skip: pageParam, take: PAGE })}`),
    getNextPageParam: (last, pages) => {
      const loaded = pages.reduce((a, p) => a + p.items.length, 0)
      return loaded < last.total ? loaded : undefined
    },
  })
  const loaded = useMemo(() => txq.data?.pages.flatMap((p) => p.items) ?? [], [txq.data])
  const apiTotal = txq.data?.pages[0]?.total ?? 0
  const allLoaded = !txq.hasNextPage

  const rows: Row[] = useMemo(() => {
    const selSet = sub != null ? cats.descendants(sub) : sel != null && sel > 0 ? cats.descendants(sel) : null
    const match = (cid: number | null | undefined) =>
      sel === 0 ? cid == null : selSet ? cid != null && selSet.has(cid) : cid == null || !hiddenDesc.has(cid)
    const out: Row[] = []
    for (const tx of loaded) {
      const parts = tx.splits.length ? tx.splits.map((p) => ({ cid: p.categoryId as number | null, v: -p.amountCzk })) : [{ cid: tx.categoryId ?? null, v: -tx.amountCzk }]
      const mt = parts.filter((p) => match(p.cid))
      if (mt.length === 0 && tx.id !== open) continue
      const fullAmt = -tx.amountCzk
      const partial = mt.length > 0 && mt.length < parts.length
      const base = mt.length ? mt.reduce((a, p) => a + p.v, 0) : fullAmt
      const share = txShare(tx, member)
      const shown = (base * share) / 100
      const note = partial ? `část z ${money(fullAmt)}` : share < 100 ? `podíl ${share} % z ${money(fullAmt)}` : ''
      out.push({ tx, shown, note, month: tx.date.slice(0, 7) })
    }
    if (sort === 'amt') out.sort((a, b) => b.shown - a.shown)
    return out
  }, [loaded, sel, sub, hiddenDesc, cats, member, money, sort, open])

  // Doplnit další stránku, když skryté kategorie „vyžraly“ načtené platby
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = txq
  useEffect(() => {
    if (rows.length < limit && hasNextPage && !isFetchingNextPage) void fetchNextPage()
  }, [rows.length, limit, hasNextPage, isFetchingNextPage, fetchNextPage])

  const listCount = allLoaded ? rows.length : Math.max(rows.length, apiTotal)
  const listSum = allLoaded ? rows.reduce((a, r) => a + r.shown, 0) : (selSub?.amount ?? selCat?.amount ?? total)
  const shownRows = rows.slice(0, limit)
  const more = Math.min(20, listCount - limit)
  const heads = sort === 'date' && multi && !month

  const monthSum = (key: string) => {
    const m = full.data?.months.find((x) => x.month === key)
    if (m && !sub && sel !== 0) {
      if (selCat) return m.byTopCategory[String(selCat.id)] ?? 0
      return Object.entries(m.byTopCategory).filter(([k]) => !hiddenSet.has(Number(k))).reduce((a, [, v]) => a + v, 0)
    }
    return rows.filter((r) => r.month === key).reduce((a, r) => a + r.shown, 0)
  }

  const chips: { kind: string; label: string; color: string; clear: () => void }[] = []
  if (selCat) chips.push({ kind: 'Kategorie', label: selCat.name, color: tokenVar(selCat.token), clear: () => setSel(null) })
  if (selSub && selCat) chips.push({ kind: 'Podkategorie', label: selSub.name, color: childColor(selCat, selSub, selCat.children.indexOf(selSub), 'cat'), clear: () => setSub(null) })
  if (offNames.length) chips.push({ kind: 'Skryto', label: offNames.join(', '), color: 'transparent', clear: showAll })
  if (month) chips.push({ kind: 'Měsíc', label: monthKeyLabel(month), color: 'var(--ink-3)', clear: () => setMonth(null) })

  const who = (tx: TxRow) => (tx.shares.length > 1 ? 'společná' : members.get(tx.shares[0]?.memberId ?? -1)?.name ?? '')
  let lastMonth: string | null = null

  // ---------- Vykreslení ----------
  const crumbs = (
    <div className={s.crumbs}>
      <span>Výdaje · {month ? monthKeyLabel(month) : periodLabel(period)}</span>
      {selCat && <><span className="faint">›</span>
        <button type="button" className={s.crumb} disabled={!selSub} onClick={() => setSub(null)} style={{ color: selSub ? 'var(--ink-2)' : 'var(--ink)' }}>{selCat.name}</button></>}
      {selSub && <><span className="faint">›</span><span style={{ color: 'var(--ink)' }}>{selSub.name}</span></>}
    </div>
  )
  const deltaEl = dTotal != null && <span style={{ fontSize: 13, fontWeight: 600, color: expenseDeltaColor(dTotal) }}>{formatDelta(dTotal)} {cmpLbl}</span>
  const offEl = offNames.length > 0 && (
    <button type="button" className={s.offNote} title="Zobrazit vše" onClick={showAll}>
      <EyeOff size={14} /> bez {offNames.length === 1 ? offNames[0] : count(offNames.length, 'kategorie', 'kategorií', 'kategorií')}
    </button>
  )
  const viewSeg = (
    <Segmented full={mobile} size={mobile ? 'md' : 'sm'} value={view} onChange={(v) => setView(v)}
      options={[
        { value: 'ring', label: 'Prstenec' },
        { value: 'tree', label: 'Treemap' },
        { value: 'trend', label: 'Vývoj po měsících', disabled: !multi, title: multi ? undefined : 'Jen pro období delší než měsíc' },
      ]} />
  )
  const colorSeg = <Segmented full={mobile} size="sm" value={mode} onChange={setMode} options={COLOR_OPTS} />

  return (
    <>
      <PageHeader title="Výdaje" subtitle="Kam odcházejí peníze, podle kategorií a měsíců · klikáním do grafu filtrujete platby"
        tools={<><PeriodPicker compact={mobile} /><MemberSwitch full={mobile} /><span className={s.toolsEnd}><ConfirmedToggle /></span></>} />

      <Card style={{ gap: mobile ? 14 : 18 }}>
        {mobile ? (
          <>
            <div className="col" style={{ gap: 4 }}>
              {crumbs}
              <span className={s.big}>{money(total)}</span>
              {deltaEl}
              {offEl}
            </div>
            {viewSeg}
            {chart}
            {colorSeg}
            {legendBlock}
          </>
        ) : (
          <>
            <div className={s.summary}>
              <div className="col" style={{ gap: 6, marginRight: 'auto', minWidth: 0 }}>
                {crumbs}
                <div className="row" style={{ alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
                  <span className={s.big}>{money(total)}</span>
                  {deltaEl}
                  {offEl}
                </div>
              </div>
              {colorSeg}
              {viewSeg}
            </div>
            <div className={s.chartGrid}>
              <div style={{ minWidth: 0 }}>{chart}</div>
              {legendBlock}
            </div>
          </>
        )}
      </Card>

      <Card style={{ gap: mobile ? 10 : 12 }}>
        <div className={s.payHead}>
          <div className={s.payTitle}>
            <h2 style={{ fontSize: mobile ? 20 : 22 }}>Platby</h2>
            <span className="faint num" style={{ fontSize: mobile ? 12 : 13 }}>{count(listCount, 'platba', 'platby', 'plateb')} · {money(listSum)}</span>
          </div>
          <Segmented size="sm" value={sort} onChange={setSort} options={[{ value: 'date', label: 'Nejnovější' }, { value: 'amt', label: 'Největší' }]} />
        </div>
        {chips.length > 0 ? (
          <div className={s.chips}>
            {chips.map((c) => (
              <button key={c.kind} type="button" className={s.chip} title="Zrušit filtr" onClick={c.clear}>
                <span className={s.chipDot} style={{ background: c.color }} />
                <span className="faint" style={{ fontWeight: 500 }}>{c.kind}</span>
                <span className="ellipsis">{c.label}</span>
                <X size={14} color="var(--ink-3)" />
              </button>
            ))}
            {(sel != null || month) && <button type="button" className={s.clearAll} onClick={() => (setSel(null), setMonth(null))}>Zrušit filtry</button>}
          </div>
        ) : (
          <span className="faint" style={{ fontSize: 12 }}>
            {multi ? 'Klikněte na kategorii, dlaždici nebo měsíc v grafu a platby se vyfiltrují' : 'Klikněte na kategorii nebo dlaždici v grafu a platby se vyfiltrují'}
          </span>
        )}

        <div className="col" style={{ gap: 0 }}>
          {txq.isLoading && <Spinner center />}
          {shownRows.map((r) => {
            const tx = r.tx
            const head = heads && r.month !== lastMonth
            lastMonth = r.month
            const isOpen = open === tx.id
            const split = tx.splits.length > 0
            const c = tx.categoryId != null ? cats.byId.get(tx.categoryId) : undefined
            const top = c ? cats.byId.get(c.topId) : undefined
            const n = effNeed(tx.categoryId, tx.needOverride)
            const dotColor = mode === 'need' ? needVar(n.need) : c ? tokenVar(c.color) : 'var(--none)'
            const unconf = tx.status === 'Suggested'
            const parts = tx.splits.map((p, i) => ({ key: i, value: Math.abs(p.amountCzk), color: cats.colorOf(p.categoryId) }))
            const partsLabel = count(parts.length, 'část', 'části', 'částí')
            const acc = accById.get(tx.accountId)?.name ?? 'Účet'
            const amount = (
              <div className={s.amountCol}>
                <span className="num" style={{ fontSize: 14, fontWeight: 700, color: r.shown < 0 ? 'var(--pos)' : undefined }}>{money(-r.shown)}</span>
                {r.note && <span className="faint" style={{ fontSize: 11, whiteSpace: 'nowrap' }}>{r.note}</span>}
              </div>
            )
            return (
              <div key={tx.id}>
                {head && (
                  <div className={s.monthHead}><span>{monthKeyLabel(r.month)}</span><span className="num">{money(monthSum(r.month))}</span></div>
                )}
                <div className={clsx(s.txWrap, isOpen && s.txWrapOpen)}>
                  <div className={mobile ? s.txRowMobile : s.txRow} role="button" tabIndex={0} aria-expanded={isOpen}
                    onClick={() => setOpen(isOpen ? null : tx.id)} onKeyDown={(e) => e.key === 'Enter' && setOpen(isOpen ? null : tx.id)}>
                    {mobile ? (
                      <>
                        <div className="col" style={{ gap: 4, minWidth: 0 }}>
                          <div className="row" style={{ gap: 6, minWidth: 0 }}>
                            <span className="ellipsis" style={{ fontWeight: 600, fontSize: 14 }}>{tx.counterparty}</span>
                            {unconf && <span className={s.unconfDot} title="Nepotvrzeno" />}
                          </div>
                          <div className="row" style={{ gap: 6, fontSize: 12, color: 'var(--ink-3)', minWidth: 0 }}>
                            <span className={s.dot7} style={{ background: split ? 'var(--ink-3)' : dotColor }} />
                            <span className="ellipsis">{split ? `Rozděleno · ${partsLabel}` : c?.name ?? 'Nezařazeno'} · {dateShort(tx.date)}</span>
                          </div>
                        </div>
                        {amount}
                      </>
                    ) : (
                      <>
                        <span className={s.txDate}>{dateShort(tx.date)}</span>
                        <div className="col" style={{ gap: 2, minWidth: 0 }}>
                          <div className="row" style={{ gap: 8, minWidth: 0 }}>
                            <span className="ellipsis" style={{ fontWeight: 600, fontSize: 14 }}>{tx.counterparty}</span>
                            {unconf && <span className={s.unconfPill}>Nepotvrzeno</span>}
                          </div>
                          <span className="faint ellipsis" style={{ fontSize: 12 }}>{acc} · {who(tx)}</span>
                        </div>
                        <div className="row" style={{ gap: 8, minWidth: 0 }}>
                          {split ? (
                            <>
                              <span className={s.miniBar}>{parts.map((p) => <span key={p.key} style={{ flex: p.value, background: p.color }} />)}</span>
                              <span style={{ fontSize: 13, color: 'var(--ink-2)', whiteSpace: 'nowrap' }}>Rozděleno · {partsLabel}</span>
                            </>
                          ) : (
                            <>
                              <span className={s.dot10} style={{ background: dotColor }} />
                              <span className="col" style={{ gap: 1, minWidth: 0, flex: 1 }}>
                                <span className="ellipsis" style={{ fontSize: 14, fontWeight: 700 }}>{c?.name ?? 'Nezařazeno'}</span>
                                {top && top.id !== c?.id && <span className="faint ellipsis" style={{ fontSize: 12 }}>{top.name}</span>}
                              </span>
                              {c && n.need !== 'None' && n.need !== 'Inherit' && <NeedPill label={needLabel[n.need]} color={needVar(n.need)} />}
                            </>
                          )}
                        </div>
                        {amount}
                        <ChevronDown size={16} color="var(--ink-3)" style={{ transform: isOpen ? 'rotate(180deg)' : undefined, transition: 'transform .18s' }} />
                      </>
                    )}
                  </div>
                  {isOpen && <PaymentEditor tx={tx} onClose={() => setOpen(null)} />}
                </div>
              </div>
            )
          })}
          {!txq.isLoading && rows.length === 0 && !hasNextPage && <div className={s.emptyList}>V tomto výběru nejsou žádné platby</div>}
        </div>
        {(rows.length > limit || (hasNextPage && rows.length >= limit)) && more > 0 && (
          <button type="button" className={s.moreBtn} onClick={() => setLimitSel({ key: listKey, n: limit + 20 })}>
            {isFetchingNextPage ? 'Načítám…' : `Zobrazit dalších ${more}`}
          </button>
        )}
      </Card>
    </>
  )
}
