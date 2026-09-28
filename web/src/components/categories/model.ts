import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo } from 'react'
import { api, notifyError, qs } from '../../lib/api'
import type { CategoryNode } from '../../lib/categories'
import { monthNames, monthNamesCap } from '../../lib/format'
import type { BudgetPeriod, CategoryKind, NeedType } from '../../lib/types'
import { periodLabel, shiftPeriod, useUi, type Period } from '../../state/ui'

/** Řádek GET /api/categories/stats – částky včetně potomků, categoryId chybí = nezařazené. */
export interface CategoryAmount {
  categoryId?: number
  amount: number
  previous: number
  count: number
}

export interface CategoryStatsDto {
  categories: CategoryAmount[]
  total: number
  prevTotal: number
}

export interface MergePreview {
  transactions: number
  rules: number
  children: number
  source: string
  target: string
}

/** PUT/POST /api/categories – vynechané = beze změny. */
export interface CategoryInput {
  name?: string
  kind?: CategoryKind
  parentId?: number | null
  setParent?: boolean
  color?: string
  need?: NeedType
  budgetPeriod?: BudgetPeriod
  budgetAmount?: number | null
  setBudget?: boolean
  carryOver?: boolean
  isFixed?: boolean
  sortOrder?: number
}

/** Čerpání a počty plateb za zvolené období (podle člena / jen potvrzené / porovnání). */
export function useCategoryStats(kind: CategoryKind) {
  const { period, member, confirmedOnly, compare } = useUi()
  const q = useQuery({
    queryKey: ['category-stats', kind, period.value, member, confirmedOnly, compare],
    queryFn: () => api.get<CategoryStatsDto>(`/api/categories/stats${qs({
      period: period.value, member: member === 'all' ? undefined : member, confirmedOnly: confirmedOnly || undefined, compare, kind,
    })}`),
    placeholderData: (prev) => prev,
  })
  return useMemo(() => {
    const map = new Map<number, CategoryAmount>()
    for (const c of q.data?.categories ?? []) if (c.categoryId != null) map.set(c.categoryId, c)
    return { map, loading: q.isLoading }
  }, [q.data, q.isLoading])
}

/** Úprava kategorie; po uložení obnoví vše (strom, statistiky, rozpočty, pohyby). */
export function useSaveCategory() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, input }: { id: number; input: CategoryInput }) => api.put(`/api/categories/${id}`, input),
    onSuccess: () => invalidateData(qc),
    onError: notifyError,
  })
}

/** Obnoví data po změně stromu (vše kromě přihlášení a domácnosti). */
export const invalidateData = (qc: ReturnType<typeof useQueryClient>) =>
  qc.invalidateQueries({ predicate: (q) => q.queryKey[0] !== 'me' && q.queryKey[0] !== 'household' })

export function hasOwnBudget(c: CategoryNode) {
  return c.budgetPeriod !== 'None' && c.budgetAmount != null
}

/** Součet měsíčních rozpočtů podkategorií (bez vlastního limitu se jde hlouběji, roční se nepočítají). */
export function kidsBudget(id: number, children: Map<number | undefined, CategoryNode[]>): number {
  return (children.get(id) ?? []).reduce((sum, k) => {
    if (k.budgetPeriod === 'Monthly' && k.budgetAmount != null) return sum + k.budgetAmount
    if (k.budgetPeriod === 'None') return sum + kidsBudget(k.id, children)
    return sum
  }, 0)
}

/** Měsíční limit kategorie: vlastní (roční / 12), jinak součet podkategorií. */
export function monthlyBudget(c: CategoryNode, children: Map<number | undefined, CategoryNode[]>) {
  if (hasOwnBudget(c)) return c.budgetPeriod === 'Yearly' ? c.budgetAmount! / 12 : c.budgetAmount!
  return kidsBudget(c.id, children)
}

/** Krátký název období do hlavičky sloupce a dlaždic („Září“, „Q3“, „2026“). */
export function periodShort(p: Period) {
  if (p.kind === 'Month') return monthNamesCap[Number(p.value.split('-')[1]) - 1]
  if (p.kind === 'Quarter') return p.value.split('-')[1]
  if (p.kind === 'Year') return p.value
  return periodLabel(p)
}

/** „vs. srpen“, „vs. Q2“, „vs. 2025“. */
export function compareShort(p: Period) {
  const prev = shiftPeriod(p, -1)
  if (prev.kind === 'Month') return `vs. ${monthNames[Number(prev.value.split('-')[1]) - 1]}`
  return `vs. ${periodShort(prev)}`
}

/** „září 2026“, „Q3 2026“, „rok 2026“ – do podtitulku „… za září 2026“. */
export function periodInline(p: Period) {
  if (p.kind === 'Quarter') return p.value.replace('-', ' ')
  const l = periodLabel(p)
  return l[0].toLowerCase() + l.slice(1)
}

/** Unikátní název mezi sourozenci („Nová kategorie 2“). */
export function uniqueName(base: string, siblings: CategoryNode[]) {
  const taken = new Set(siblings.map((s) => s.name.toLowerCase()))
  if (!taken.has(base.toLowerCase())) return base
  for (let i = 2; ; i++) if (!taken.has(`${base} ${i}`.toLowerCase())) return `${base} ${i}`
}
