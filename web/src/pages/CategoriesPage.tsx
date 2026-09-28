import { DndContext, DragOverlay, PointerSensor, pointerWithin, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import clsx from 'clsx'
import { ChevronLeft, ChevronRight, GripVertical, Plus, Search, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useLocation, useSearchParams } from 'react-router-dom'
import { PageHeader } from '../components/AppShell'
import { CategoryDetail } from '../components/categories/CategoryDetail'
import { matchesText, useIsMobile } from '../components/categories/hooks'
import {
  hasOwnBudget, invalidateData, kidsBudget, monthlyBudget, periodInline, periodShort, uniqueName, useCategoryStats, useSaveCategory,
  type CategoryAmount,
} from '../components/categories/model'
import { MemberSwitch, PeriodPicker, useMoney } from '../components/common'
import { Button, Card, Empty, IconButton, Segmented, Spinner } from '../components/ui'
import { api, notifyError } from '../lib/api'
import { needColor, needLabel, shade, useCategories, type CategoryNode } from '../lib/categories'
import { count } from '../lib/format'
import type { CategoryKind } from '../lib/types'
import { periodMonths, useUi } from '../state/ui'
import s from './CategoriesPage.module.css'

interface Row {
  node: CategoryNode
  hasKids: boolean
  open: boolean
  kids: number
}

export default function CategoriesPage() {
  const qc = useQueryClient()
  const mobile = useIsMobile()
  const { period } = useUi()
  const cats = useCategories()
  const { byId, children, descendants } = cats
  const [params, setParams] = useSearchParams()
  const location = useLocation()
  const [kind, setKind] = useState<CategoryKind>(() => {
    const sel = Number(params.get('sel'))
    return (sel && cats.byId.get(sel)?.kind) || 'Expense'
  })
  const [q, setQ] = useState('')
  const [closed, setClosed] = useState<Set<number>>(() => new Set())
  const stats = useCategoryStats(kind)
  const save = useSaveCategory()

  const tops = useMemo(() => (children.get(undefined) ?? []).filter((c) => c.kind === kind), [children, kind])
  const all = useMemo(() => cats.list.filter((c) => c.kind === kind), [cats.list, kind])

  // Výběr v URL (?sel=), aby šel na mobilu použít krok zpět
  const selParam = Number(params.get('sel')) || null
  const selected = selParam != null ? byId.get(selParam) : undefined
  const current = selected && selected.kind === kind ? selected : mobile ? undefined : tops[0]
  const select = (id: number | null) => {
    const next = new URLSearchParams(params)
    if (id == null) next.delete('sel')
    else next.set('sel', String(id))
    setParams(next, { replace: !mobile, state: mobile && id != null ? { fromList: true } : undefined })
    if (mobile) window.scrollTo(0, 0)
  }
  // Vybraná kategorie jiného druhu (např. z odkazu) přepne Výdaje / Příjmy
  useEffect(() => {
    if (selected && selected.kind !== kind) setKind(selected.kind)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.id])

  const toggle = (id: number) => setClosed((x) => {
    const n = new Set(x)
    if (n.has(id)) n.delete(id)
    else n.add(id)
    return n
  })
  const expand = (id: number) => setClosed((x) => {
    if (!x.has(id)) return x
    const n = new Set(x)
    n.delete(id)
    return n
  })

  // Řádky stromu (hledání rozbalí vše, co odpovídá)
  const rows = useMemo(() => {
    const out: Row[] = []
    const matches = (c: CategoryNode): boolean => matchesText(c.name, q) || (children.get(c.id) ?? []).some(matches)
    const visit = (list: CategoryNode[]) => {
      for (const c of list) {
        if (q.trim() && !matches(c)) continue
        const kids = children.get(c.id) ?? []
        const open = q.trim() ? true : !closed.has(c.id)
        out.push({ node: c, hasKids: kids.length > 0, open, kids: kids.length })
        if (kids.length && open) visit(kids)
      }
    }
    visit(tops)
    return out
  }, [tops, children, closed, q])

  const depthMax = all.reduce((m, c) => Math.max(m, c.depth), 0)
  const subtitle = `${count(all.length, 'kategorie', 'kategorie', 'kategorií')} · ${count(depthMax + 1, 'úroveň', 'úrovně', 'úrovní')} · čerpání a počty plateb za ${periodInline(period)}`

  const addTop = useMutation({
    mutationFn: () => api.post<{ id: number }>('/api/categories', { name: uniqueName('Nová kategorie', tops), kind }),
    onSuccess: async (r) => {
      await invalidateData(qc)
      select(r.id)
    },
    onError: notifyError,
  })

  // ---- Přetahování ----
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))
  const [dragId, setDragId] = useState<number | null>(null)
  const invalidTargets = useMemo(() => (dragId != null ? descendants(dragId) : new Set<number>()), [dragId, descendants])
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    setDragId(null)
    if (!over) return
    const node = byId.get(Number(active.id))
    if (!node) return
    if (over.id === 'top') {
      if (node.parentId != null) save.mutate({ id: node.id, input: { setParent: true, parentId: null } })
      return
    }
    const target = Number(over.id)
    if (target === node.id || node.parentId === target || descendants(node.id).has(target)) return
    save.mutate({ id: node.id, input: { setParent: true, parentId: target } })
    expand(target)
  }

  const months = periodMonths(period)
  const isExpense = kind === 'Expense'
  const kindSwitch = (
    <Segmented<CategoryKind> aria-label="Druh kategorií" value={kind} full={mobile}
      onChange={(k) => { setKind(k); if (selected && selected.kind !== k) select(null) }}
      options={[{ value: 'Expense', label: 'Výdaje' }, { value: 'Income', label: 'Příjmy' }]} />
  )
  const search = (
    <label className={s.search}>
      <Search size={16} />
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Hledat kategorii" aria-label="Hledat kategorii" />
      {q && <button type="button" onClick={() => setQ('')} aria-label="Vymazat"><X size={14} /></button>}
    </label>
  )

  if (cats.isLoading) return <Spinner center />

  // ---------- Mobil: detail jako samostatná stránka ----------
  if (mobile && current) {
    return (
      <div className={s.mobileDetail}>
        <button type="button" className={s.back} onClick={() => ((location.state as { fromList?: boolean } | null)?.fromList ? window.history.back() : select(null))}>
          <ChevronLeft size={20} /> Kategorie
        </button>
        <CategoryDetail key={current.id} node={current} stat={stats.map.get(current.id)} onSelect={select} onExpand={expand} />
      </div>
    )
  }

  return (
    <>
      <PageHeader
        title="Kategorie"
        subtitle={subtitle}
        actions={<Button variant="primary" icon={<Plus size={16} />} loading={addTop.isPending} onClick={() => addTop.mutate()}>Nová kategorie</Button>}
        tools={mobile ? (
          <div className={s.mobileTools}>
            {kindSwitch}
            <PeriodPicker />
            <MemberSwitch full />
            {search}
          </div>
        ) : (
          <>
            <PeriodPicker />
            {kindSwitch}
            <MemberSwitch />
            {search}
            <button type="button" className={s.textBtn} onClick={() => setClosed(new Set())}>Rozbalit vše</button>
            <button type="button" className={s.textBtn} onClick={() => setClosed(new Set(all.filter((c) => (children.get(c.id)?.length ?? 0) > 0).map((c) => c.id)))}>
              Sbalit vše
            </button>
            <span className={s.dragHint}><GripVertical size={14} /> Přetažením přesuneš</span>
          </>
        )}
      />

      {mobile ? (
        <MobileList rows={rows} stats={stats.map} onToggle={toggle} onSelect={select} />
      ) : (
        <div className={s.layout}>
          <DndContext sensors={sensors} collisionDetection={pointerWithin} onDragStart={(e) => setDragId(Number(e.active.id))}
            onDragEnd={onDragEnd} onDragCancel={() => setDragId(null)}>
            <Card pad={false} className={s.table}>
              <div className={clsx(s.grid, s.thead)}>
                <span>Kategorie</span>
                <span>Typ výdaje</span>
                <span style={{ textAlign: 'right' }}>{months === 1 ? 'Rozpočet' : 'Rozpočet / měs.'}</span>
                <span>{periodShort(period)} · {isExpense ? 'čerpání' : 'příjem'}</span>
                <span style={{ textAlign: 'right' }}>Plateb</span>
              </div>
              {dragId != null && <TopDropZone />}
              {rows.length === 0 && (
                <Empty title={q ? 'Nic nenalezeno' : 'Zatím žádné kategorie'}>
                  {q ? 'Zkus jiný název.' : 'Založ první kategorii tlačítkem Nová kategorie.'}
                </Empty>
              )}
              {rows.map((r) => (
                <TreeRow key={r.node.id} row={r} stat={stats.map.get(r.node.id)} months={months} selected={current?.id === r.node.id}
                  dragging={dragId === r.node.id} invalidDrop={invalidTargets.has(r.node.id)}
                  onSelect={() => select(r.node.id)} onToggle={() => toggle(r.node.id)} />
              ))}
            </Card>
            <DragOverlay dropAnimation={null}>
              {dragId != null && byId.get(dragId) && (
                <div className={s.overlay}>
                  <GripVertical size={14} />
                  <span className={s.dot} style={{ background: shade(byId.get(dragId)!.color, byId.get(dragId)!.depth) }} />
                  {byId.get(dragId)!.name}
                </div>
              )}
            </DragOverlay>
          </DndContext>
          {current && (
            <Card className={s.aside}>
              <CategoryDetail key={current.id} node={current} stat={stats.map.get(current.id)} onSelect={select} onExpand={expand} />
            </Card>
          )}
        </div>
      )}
    </>
  )
}

function TopDropZone() {
  const { setNodeRef, isOver } = useDroppable({ id: 'top' })
  return (
    <div ref={setNodeRef} className={clsx(s.topZone, isOver && s.topZoneOver)}>Pusť sem, aby se z ní stala hlavní kategorie</div>
  )
}

function useRowData(node: CategoryNode, stat: CategoryAmount | undefined, months: number) {
  const { children } = useCategories()
  const money = useMoney()
  const isExpense = node.kind === 'Expense'
  const own = hasOwnBudget(node)
  const kb = kidsBudget(node.id, children)
  const spent = stat?.amount ?? 0
  const perMonth = isExpense ? monthlyBudget(node, children) : 0
  const bm = perMonth * months
  const p = bm ? spent / bm : 0
  const budget = !isExpense ? '—' : own ? money(node.budgetAmount) : kb ? money(kb) : '—'
  const budgetNote = !isExpense ? '' : own
    ? node.budgetPeriod === 'Yearly' ? 'ročně'
      : [kb && node.budgetAmount !== kb ? 'vlastní limit' : '', node.carryOver ? 's přenosem' : ''].filter(Boolean).join(' · ')
    : kb ? 'Σ podkategorií' : ''
  return {
    own, budget, budgetNote, spent: money(spent), count: stat?.count ?? 0, hasBar: isExpense && bm > 0,
    barWidth: `${Math.min(p, 1) * 100}%`, barColor: p > 1 ? 'var(--neg)' : p > 0.97 ? 'var(--warn)' : `var(--${node.color})`,
  }
}

function NeedTag({ node }: { node: CategoryNode }) {
  const inherited = node.need === 'Inherit'
  const n = node.effectiveNeed
  return (
    <span className={clsx(s.need, inherited && s.needInherited)} title={inherited ? `${needLabel[n]} (zděděno)` : needLabel[n]}
      style={inherited ? undefined : { background: `color-mix(in oklch, ${needColor[n]} 20%, var(--surface))` }}>
      <span className={s.needDot} style={{ background: needColor[n] }} />
      {needLabel[n]}
    </span>
  )
}

function TreeRow({ row, stat, months, selected, dragging, invalidDrop, onSelect, onToggle }: {
  row: Row
  stat?: CategoryAmount
  months: number
  selected: boolean
  dragging: boolean
  invalidDrop: boolean
  onSelect: () => void
  onToggle: () => void
}) {
  const { node } = row
  const drag = useDraggable({ id: node.id })
  const drop = useDroppable({ id: node.id, disabled: invalidDrop })
  const d = useRowData(node, stat, months)
  const top = node.depth === 0
  return (
    <div
      ref={(el) => {
        drag.setNodeRef(el)
        drop.setNodeRef(el)
      }}
      {...drag.attributes}
      {...drag.listeners}
      role="button"
      aria-pressed={selected}
      className={clsx(s.grid, s.row, top && s.rowTop, selected && s.rowOn, drop.isOver && s.rowOver, dragging && s.rowDragging)}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === 'Enter') onSelect()
        else drag.listeners?.onKeyDown?.(e)
      }}
    >
      <div className={s.nameCell} style={{ paddingLeft: node.depth * 22 }}>
        <span className={s.grip}><GripVertical size={16} /></span>
        <button type="button" className={clsx(s.chev, row.open && s.chevOpen)} style={{ visibility: row.hasKids ? 'visible' : 'hidden' }}
          aria-label={row.open ? 'Sbalit' : 'Rozbalit'} aria-expanded={row.open}
          onClick={(e) => { e.stopPropagation(); onToggle() }} onPointerDown={(e) => e.stopPropagation()}>
          <ChevronRight size={16} />
        </button>
        <span className={s.dot} style={{ width: top ? 12 : 9, height: top ? 12 : 9, background: shade(node.color, node.depth) }} />
        <span className={clsx('ellipsis', s.name)}>{node.name}</span>
        {row.hasKids && !row.open && <span className={s.kids}>{row.kids}</span>}
      </div>
      <NeedTag node={node} />
      <div className={s.budgetCell}>
        <span className="num" style={{ fontSize: 13, fontWeight: 600, color: d.own ? 'var(--ink)' : 'var(--ink-3)' }}>{d.budget}</span>
        {d.budgetNote && <span className={s.note}>{d.budgetNote}</span>}
      </div>
      <div className={s.spentCell}>
        <span className="num" style={{ fontSize: 13, fontWeight: 500 }}>{d.spent}</span>
        {d.hasBar && <span className={s.bar}><span style={{ width: d.barWidth, background: d.barColor }} /></span>}
      </div>
      <span className={clsx('num', s.count)}>{d.count}</span>
    </div>
  )
}

function MobileList({ rows, stats, onToggle, onSelect }: {
  rows: Row[]
  stats: Map<number, CategoryAmount>
  onToggle: (id: number) => void
  onSelect: (id: number) => void
}) {
  const money = useMoney()
  if (rows.length === 0) return <Card><Empty title="Nic nenalezeno" /></Card>
  return (
    <Card pad={false} className={s.mList}>
      {rows.map(({ node, hasKids, open }) => {
        const st = stats.get(node.id)
        return (
          <div key={node.id} className={s.mRow} style={{ paddingLeft: 4 + node.depth * 18 }}>
            <IconButton label={open ? 'Sbalit' : 'Rozbalit'} plain className={clsx(s.mChev, open && s.chevOpen)}
              style={{ visibility: hasKids ? 'visible' : 'hidden' }} onClick={() => onToggle(node.id)}>
              <ChevronRight size={18} />
            </IconButton>
            <button type="button" className={s.mMain} onClick={() => onSelect(node.id)}>
              <span className={s.dot} style={{ width: node.depth === 0 ? 12 : 9, height: node.depth === 0 ? 12 : 9, background: shade(node.color, node.depth) }} />
              <span className="col grow" style={{ gap: 3 }}>
                <span className="ellipsis" style={{ fontSize: 15, fontWeight: node.depth === 0 ? 700 : 500 }}>{node.name}</span>
                <span className={s.mSub}>
                  <span className={s.needDot} style={{ background: needColor[node.effectiveNeed] }} />
                  {needLabel[node.effectiveNeed]} · <span className="num">{money(st?.amount ?? 0)}</span> · {st?.count ?? 0}×
                </span>
              </span>
              <ChevronRight size={16} color="var(--ink-3)" />
            </button>
          </div>
        )
      })}
    </Card>
  )
}
