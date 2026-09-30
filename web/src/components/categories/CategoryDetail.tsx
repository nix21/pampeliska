import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import clsx from 'clsx'
import { ChevronDown, GitMerge, ListFilter, Pencil, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { api, notifyError, notifyOk } from '../../lib/api'
import { needColor, needLabel, shade, useCategories, type CategoryNode } from '../../lib/categories'
import { count, num } from '../../lib/format'
import { rulesQuery } from '../../lib/rules'
import type { BudgetPeriod, NeedType } from '../../lib/types'
import { useUi } from '../../state/ui'
import { useMoney } from '../common'
import { Button, Dialog, NumberInput, Segmented, Switch } from '../ui'
import s from './detail.module.css'
import {
  compareShort, hasOwnBudget, invalidateData, kidsBudget, periodShort, uniqueName, useSaveCategory,
  type CategoryAmount, type CategoryInput, type MergePreview,
} from './model'

const COLORS = ['c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7', 'c8', 'c9', 'c10', 'c11', 'c12']
const NEEDS: NeedType[] = ['Inherit', 'Need', 'Joy', 'None']

/** Pravý panel (na mobilu samostatná stránka) s úpravou vybrané kategorie. */
export function CategoryDetail({ node, stat, onSelect, onExpand }: {
  node: CategoryNode
  stat?: CategoryAmount
  onSelect: (id: number | null) => void
  onExpand: (id: number) => void
}) {
  const qc = useQueryClient()
  const { byId, children, descendants } = useCategories()
  const { period, compare } = useUi()
  const money = useMoney()
  const save = useSaveCategory()
  const update = (input: CategoryInput) => save.mutate({ id: node.id, input })

  const parent = node.parentId != null ? byId.get(node.parentId) : undefined
  const isExpense = node.kind === 'Expense'
  const isTop = node.parentId == null
  const [name, setName] = useState(node.name)
  const [parentOpen, setParentOpen] = useState(false)
  const [merging, setMerging] = useState(false)
  const [mergeTo, setMergeTo] = useState<number | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [budgetText, setBudgetText] = useState<number | null>(node.budgetAmount ?? null)
  // Změna zvenčí (uložení, jiný člen domácnosti) přepíše rozepsané hodnoty
  const [synced, setSynced] = useState({ name: node.name, budget: node.budgetAmount })
  if (synced.name !== node.name || synced.budget !== node.budgetAmount) {
    setSynced({ name: node.name, budget: node.budgetAmount })
    setName(node.name)
    setBudgetText(node.budgetAmount ?? null)
  }

  const exclude = descendants(node.id)
  const kb = kidsBudget(node.id, children)
  const own = hasOwnBudget(node)
  const kidsCount = children.get(node.id)?.length ?? 0

  // ---- Statistiky ----
  const spent = stat?.amount ?? 0
  const prev = stat?.previous ?? 0
  const diffPct = compare && prev ? (spent / prev - 1) * 100 : null
  const worse = isExpense ? spent > prev * 1.05 : spent < prev * 0.95
  const better = isExpense ? spent < prev * 0.95 : spent > prev * 1.05
  const stats = [
    { l: periodShort(period), v: money(spent), c: 'var(--ink)' },
    {
      l: compare ? compareShort(period) : 'vs. předchozí',
      v: diffPct == null ? '—' : `${diffPct >= 0 ? '+' : '−'}${num(Math.abs(diffPct))} %`,
      c: diffPct == null ? 'var(--ink-3)' : worse ? 'var(--neg)' : better ? 'var(--pos)' : 'var(--ink-2)',
    },
    { l: 'Plateb', v: String(stat?.count ?? 0), c: 'var(--ink)' },
  ]

  // ---- Pravidla mířící do kategorie ----
  const rules = (useQuery(rulesQuery).data ?? []).filter((r) => r.categoryId === node.id)

  // ---- Sloučení ----
  const preview = useQuery({
    queryKey: ['merge-preview', node.id, mergeTo],
    queryFn: () => api.get<MergePreview>(`/api/categories/${node.id}/merge-preview?target=${mergeTo}`),
    enabled: mergeTo != null,
  })
  const merge = useMutation({
    mutationFn: (target: number) => api.post<MergePreview>(`/api/categories/${node.id}/merge`, { targetId: target }),
    onSuccess: async (_, target) => {
      notifyOk(`Kategorie „${node.name}“ sloučena do „${byId.get(target)?.name ?? ''}“`)
      onSelect(target)
      await invalidateData(qc)
    },
    onError: notifyError,
  })

  const addChild = useMutation({
    mutationFn: () => api.post<{ id: number }>('/api/categories', { name: uniqueName('Nová podkategorie', children.get(node.id) ?? []), parentId: node.id }),
    onSuccess: async (r) => {
      onExpand(node.id)
      await invalidateData(qc)
      onSelect(r.id)
    },
    onError: notifyError,
  })

  const del = useMutation({
    mutationFn: () => api.del(`/api/categories/${node.id}`),
    onSuccess: () => {
      notifyOk(`Kategorie „${node.name}“ smazána`)
      setConfirmDelete(false)
      invalidateData(qc)
      onSelect(node.parentId ?? null)
    },
    onError: (e) => {
      setConfirmDelete(false)
      notifyError(e)
    },
  })

  const commitName = () => {
    const v = name.trim()
    if (!v) return setName(node.name)
    if (v !== node.name) update({ name: v })
  }

  const setBudgetPeriod = (p: BudgetPeriod | 'None') => {
    if (p === 'None') update({ budgetPeriod: 'None' })
    else update({ budgetPeriod: p, budgetAmount: node.budgetAmount ?? (kb || 1000) })
    if (p !== 'None' && node.budgetAmount == null) setBudgetText(kb || 1000)
  }
  const commitBudget = () => {
    if (budgetText == null || budgetText < 0 || budgetText === node.budgetAmount) return
    update({ budgetAmount: Math.round(budgetText) })
  }

  const parentPath = parent ? parent.path : 'Hlavní kategorie'
  const needHint = node.need === 'Inherit'
    ? parent ? `Dědí z „${node.inheritedFrom ?? parent.name}“: ${needLabel[node.effectiveNeed]}` : 'Hlavní kategorie nemá z čeho dědit'
    : `Podkategorie s „Zdědit“ převezmou ${needLabel[node.need].toLowerCase()}. Jde přebít na konkrétní platbě.`
  const periodUnit = node.budgetPeriod === 'Yearly' ? 'roku' : 'měsíce'
  const rest = own && node.budgetPeriod === 'Monthly' ? node.budgetAmount! - kb : null
  const mergeTarget = mergeTo != null ? byId.get(mergeTo) : undefined
  const p = preview.data

  return (
    <div className={s.panel}>
      <div className={s.head}>
        <span className={s.path}>{parentPath} · {isExpense ? 'výdaje' : 'příjmy'}</span>
        <div className={s.nameRow}>
          <span className={s.bigDot} style={{ background: shade(node.color, node.depth) }} />
          <input className={s.name} value={name} aria-label="Název kategorie" onChange={(e) => setName(e.target.value)} onBlur={commitName}
            onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()} />
          <Pencil size={16} className={s.pen} aria-hidden />
        </div>
        <div className={s.stats}>
          {stats.map((x) => (
            <div key={x.l} className={s.stat}>
              <span className={s.statLabel}>{x.l}</span>
              <span className={clsx(s.statValue, 'num')} style={{ color: x.c }}>{x.v}</span>
            </div>
          ))}
        </div>
      </div>

      {isTop && (
        <div className={s.section}>
          <span className={s.label}>Barva <span className={s.labelNote}>· podkategorie přebírají odstín</span></span>
          <div className={s.colors}>
            {COLORS.map((c) => (
              <button key={c} type="button" aria-label={`Barva ${c}`} aria-pressed={node.color === c}
                className={clsx(s.swatch, node.color === c && s.swatchOn)} style={{ background: `var(--${c})` }}
                onClick={() => node.color !== c && update({ color: c })} />
            ))}
          </div>
        </div>
      )}

      <div className={s.section}>
        <span className={s.label}>Nadřazená kategorie</span>
        <button type="button" className={s.select} onClick={() => setParentOpen((o) => !o)} aria-expanded={parentOpen}>
          <span className={s.smallDot} style={{ background: parent ? shade(parent.color, parent.depth) : 'var(--line)' }} />
          <span className="grow ellipsis" style={{ textAlign: 'left' }}>{parent ? parent.name : '— Hlavní kategorie —'}</span>
          <ChevronDown size={16} color="var(--ink-3)" />
        </button>
        {parentOpen && (
          <TreeOptions kind={node.kind} exclude={exclude} value={node.parentId ?? null} includeRoot
            onPick={(id) => {
              setParentOpen(false)
              if (id === (node.parentId ?? null)) return
              update({ setParent: true, parentId: id })
              if (id != null) onExpand(id)
            }} />
        )}
      </div>

      <div className={s.section}>
        <span className={s.label}>Výchozí typ výdaje</span>
        <div className={s.needGrid} role="radiogroup" aria-label="Výchozí typ výdaje">
          {NEEDS.map((n) => (
            <button key={n} type="button" role="radio" aria-checked={node.need === n} className={clsx(s.needOpt, node.need === n && s.needOptOn)}
              onClick={() => node.need !== n && update({ need: n })}>
              <span className={s.needDot} style={{
                background: n === 'Inherit' ? (parent ? needColor[parent.effectiveNeed] : 'var(--none)') : needColor[n],
                borderStyle: n === 'Inherit' ? 'dashed' : 'solid',
              }} />
              {needLabel[n]}
            </button>
          ))}
        </div>
        <span className={s.hint}>{needHint}</span>
      </div>

      {isExpense && (
        <div className={s.section} style={{ gap: 10 }}>
          <span className={s.label}>Rozpočet</span>
          <Segmented<BudgetPeriod> full aria-label="Rozpočet" value={own ? node.budgetPeriod : 'None'} onChange={setBudgetPeriod}
            options={[{ value: 'None', label: 'Bez limitu' }, { value: 'Monthly', label: 'Měsíční' }, { value: 'Yearly', label: 'Roční' }]} />
          {own && (
            <>
              <div onBlur={commitBudget} onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLElement).blur()}>
                <NumberInput className={s.budgetInput} value={budgetText} onChange={setBudgetText} decimals={0} aria-label="Částka rozpočtu"
                  suffix={node.budgetPeriod === 'Yearly' ? 'Kč / rok' : 'Kč / měsíc'} />
              </div>
              <label className={s.switchRow}>
                <span className="grow">Přenášet nevyčerpané do dalšího {periodUnit}</span>
                <Switch checked={node.carryOver} onChange={(v) => update({ carryOver: v })} label="Přenášet nevyčerpané" />
              </label>
            </>
          )}
          {kidsCount > 0 && kb > 0 && (
            <div className={s.kidsBox}>
              <div className={s.kidsLine}><span className="muted">Součet podkategorií</span><span className="num" style={{ fontWeight: 700 }}>{money(kb)}</span></div>
              {rest != null && (
                <div className={s.kidsLine}>
                  <span className="muted">Nerozpočtovaný zbytek</span>
                  <span className="num" style={{ fontWeight: 700, color: rest < 0 ? 'var(--neg)' : 'var(--ink)' }}>{money(rest)}</span>
                </div>
              )}
              <span className={s.hint}>
                {own
                  ? (rest ?? 0) >= 0 ? 'Zbytek pokryje výdaje bez vlastního rozpočtu (např. Kavárny)' : 'Podkategorie dohromady přesahují vlastní limit'
                  : 'Bez vlastního limitu je rozpočet součtem podkategorií'}
              </span>
            </div>
          )}
        </div>
      )}

      <div className={s.section}>
        <label className={s.switchRow}>
          <span className="grow">Nezapočítávat do statistik</span>
          <Switch checked={node.effectiveExclude} disabled={node.effectiveExclude && !node.excludeFromStats}
            onChange={(v) => update({ excludeFromStats: v })} label="Nezapočítávat do statistik" />
        </label>
        <span className={s.hint}>
          {node.effectiveExclude && !node.excludeFromStats
            ? `Zděděno z nadřazené kategorie „${parent?.name ?? ''}“.`
            : `Platby v kategorii (i části rozdělených) se nepočítají do ${isExpense ? 'výdajů' : 'příjmů'} – např. kauce nebo půjčky.`}
        </span>
      </div>

      <div className={s.section}>
        <div className={s.rulesHead}>
          <span className={s.label}>Pravidla</span>
          <Link to="/pravidla" className={s.link}>Spravovat</Link>
        </div>
        {rules.map((r) => (
          <Link key={r.id} to={`/pravidla?sel=${r.id}`} className={s.rule}>
            <ListFilter size={14} color="var(--ink-3)" />
            <span className="grow">{r.description}</span>
            <span className="faint num">{r.matches}×</span>
          </Link>
        ))}
        {rules.length === 0 && <span className={s.hint}>Žádné pravidlo. Vznikne, když sem ručně zařadíš platbu.</span>}
      </div>

      {merging && (
        <div className={s.merge}>
          <span style={{ fontSize: 13, fontWeight: 700 }}>Sloučit „{node.name}“ do…</span>
          <TreeOptions kind={node.kind} exclude={exclude} value={mergeTo} onPick={(id) => id != null && setMergeTo(id)} />
          {mergeTarget && (
            <>
              <span className={s.mergeText}>
                {p ? (
                  <>
                    Do „{mergeTarget.name}“ se přesune {count(p.transactions, 'platba', 'platby', 'plateb')} (za celou historii),{' '}
                    {count(p.rules, 'pravidlo', 'pravidla', 'pravidel')}
                    {p.children > 0 && <> a {count(p.children, 'podkategorie', 'podkategorie', 'podkategorií')}</>}.{' '}
                    Kategorie „{node.name}“ zanikne. Rozpočet se přičte k cíli.
                  </>
                ) : preview.isError ? 'Náhled se nepodařilo načíst.' : 'Počítám dopad…'}
              </span>
              <div className="row">
                <Button variant="dark" className="grow" loading={merge.isPending} disabled={!p} onClick={() => merge.mutate(mergeTarget.id)}>Sloučit</Button>
                <Button onClick={() => { setMerging(false); setMergeTo(null) }}>Zrušit</Button>
              </div>
            </>
          )}
        </div>
      )}

      <div className={s.actions}>
        <Button icon={<Plus size={16} />} loading={addChild.isPending} onClick={() => addChild.mutate()}>Podkategorie</Button>
        <Button icon={<GitMerge size={16} />} onClick={() => { setMerging((m) => !m); setMergeTo(null) }}>Sloučit do…</Button>
        <Button icon={<Trash2 size={16} />} className={s.danger} title="Smazat lze jen kategorii bez plateb, podkategorií a pravidel. Jinak ji slouč do jiné."
          onClick={() => setConfirmDelete(true)}>Smazat</Button>
      </div>

      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete} title={`Smazat kategorii „${node.name}“?`}
        description="Smazat jde jen prázdnou kategorii – bez plateb, podkategorií a pravidel. Kategorii s platbami nejdřív slouč do jiné."
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmDelete(false)}>Zrušit</Button>
            <Button variant="danger" loading={del.isPending} onClick={() => del.mutate()}>Smazat</Button>
          </>
        }>
        <span className="muted" style={{ fontSize: 13 }}>Akci nejde vrátit.</span>
      </Dialog>
    </div>
  )
}

/** Stromový výběr kategorie stejného druhu (nadřazená, cíl sloučení). */
function TreeOptions({ kind, exclude, value, includeRoot, onPick }: {
  kind: CategoryNode['kind']
  exclude: Set<number>
  value: number | null
  includeRoot?: boolean
  onPick: (id: number | null) => void
}) {
  const { list } = useCategories()
  const items = list.filter((c) => c.kind === kind && !exclude.has(c.id))
  return (
    <div className={s.options} role="listbox">
      {includeRoot && (
        <button type="button" role="option" aria-selected={value === null} className={clsx(s.option, value === null && s.optionOn)} style={{ fontWeight: 700 }}
          onClick={() => onPick(null)}>
          <span className={s.optDot} style={{ background: 'var(--ink-3)' }} />— Hlavní kategorie —
        </button>
      )}
      {items.map((c) => (
        <button key={c.id} type="button" role="option" aria-selected={value === c.id} className={clsx(s.option, value === c.id && s.optionOn)}
          style={{ paddingLeft: 8 + c.depth * 16, fontWeight: c.depth === 0 ? 700 : 500 }} onClick={() => onPick(c.id)}>
          <span className={s.optDot} style={{ background: shade(c.color, c.depth) }} />
          <span className="ellipsis">{c.name}</span>
        </button>
      ))}
    </div>
  )
}
