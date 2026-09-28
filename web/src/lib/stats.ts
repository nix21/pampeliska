// Typy a dotazy pro Přehled a Výdaje (statistiky, výhledy, podmínky, rozpočty). DTO podle backendu, výčty jako řetězce.

import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback } from 'react'
import { compareLabel, periodLabel, periodRange, shiftPeriod, type MemberFilter, type Period } from '../state/ui'
import { api, qs } from './api'
import type { Categories } from './categories'
import { monthLocative, monthNames, monthNamesCap, monthShort } from './format'
import type { Account, AccountGroup, BatchSource, BatchState, CategorySource, ConditionType, NeedType, TxRow } from './types'

// ---------- Statistiky ----------

export interface CategoryAmount {
  /** null = nezařazené */
  categoryId: number | null
  /** Včetně všech potomků. Výdaj kladně. */
  amount: number
  previous: number
  count: number
}

export interface NeedSplit {
  need: number
  joy: number
  none: number
}

export interface MonthPoint {
  /** „2026-09“ */
  month: string
  income: number
  expense: number
  needs: NeedSplit
  /** Id hlavní kategorie → výdaj; klíč „0“ = nezařazené. */
  byTopCategory: Record<string, number>
}

export interface MerchantAmount {
  name: string
  amount: number
  count: number
  categoryId: number | null
}

export interface OverviewStats {
  income: number
  expense: number
  balance: number
  /** Procenta (12,5 = 12,5 %) */
  savingsRate: number | null
  unconfirmedExpense: number
  prevIncome: number | null
  prevExpense: number | null
  byCategory: CategoryAmount[]
  needs: NeedSplit
  joyHistory: MonthPoint[]
  topMerchants: MerchantAmount[]
  transactionCount: number
}

export interface ExpenseTree {
  categories: CategoryAmount[]
  total: number
  prevTotal: number
  months: MonthPoint[]
  needs: NeedSplit
}

export interface NetWorthLayer {
  key: AccountGroup
  values: number[]
}

export interface NetWorth {
  months: string[]
  layers: NetWorthLayer[]
  now: number
  monthAgo: number
  yearAgo: number
  /** Kč za jednotku měny */
  rates: Record<string, number>
}

// ---------- Výhledy, podmínky, rozpočty ----------

export interface PaydayForecast {
  payday: string | null
  paydayName: string | null
  disposable: number
  outgoing: number
  remaining: number
}

export interface ForecastEvent {
  date: string
  recurringId: number
  name: string
  amount: number
  balanceAfter: number
}

export interface AccountForecast {
  accountId: number
  currency: string
  now: number
  end: number
  min: number
  minDate: string
  limit: number | null
  low: boolean
  topUp: number | null
  topUpBy: string | null
  events: ForecastEvent[]
  horizonDays: number
}

export type ConditionState = 'Met' | 'Pending' | 'Urgent'

export interface ConditionStatus {
  conditionId: number
  accountId: number
  type: ConditionType
  target: number
  current: number
  benefit: string | null
  state: ConditionState
  daysLeft: number
  periodEnd: string
  missing: number
}

export interface ConditionsSummary {
  met: number
  total: number
  worst: ConditionState
  daysLeft: number
  items: ConditionStatus[]
}

export type BudgetStatus = 'NoLimit' | 'OnPace' | 'Faster' | 'WontFit' | 'Over' | 'Paid' | 'Waiting'

export interface BudgetLine {
  categoryId: number
  parentId: number | null
  depth: number
  name: string
  limit: number | null
  spent: number
  memberSpent: number | null
  reserved: number
  status: BudgetStatus
  isFixed: boolean
  personal: boolean
  free: number
}

export interface BudgetOverview {
  month: string
  closed: boolean
  day: number
  daysInMonth: number
  /** Procenta uplynulého měsíce */
  pace: number
  total: number
  spent: number
  memberSpent: number | null
  reserved: number
  free: number
  monthly: BudgetLine[]
}

export interface BatchSummary {
  id: number
  createdAt: string
  source: BatchSource
  clientName: string | null
  createdBy: string | null
  state: BatchState
  count: number
  confirmed: number
  pending: number
  duplicateCount: number
  suspectedCount: number
  accounts: string[]
  note: string | null
}

export interface InboxCounts {
  all: number
  aiUnsure: number
  noSuggestion: number
  splitSuggestion: number
  duplicates: number
}

export interface InboxResult {
  items: { tx: TxRow }[]
  counts: InboxCounts
}

// ---------- Dotazy ----------

type Filter = { member?: number; period: string; confirmedOnly?: boolean; compare?: boolean }
const memberParam = (m: MemberFilter) => (m === 'all' ? undefined : m)

export function useOverviewStats(f: Filter) {
  // compare=false musí jít na server explicitně (výchozí je true)
  const params = { ...f, compare: !!f.compare }
  return useQuery({
    queryKey: ['stats', 'overview', params],
    queryFn: () => api.get<OverviewStats>(`/api/stats/overview${qs(params)}`),
    placeholderData: keepPreviousData,
  })
}

export function useExpenseTree(f: Filter, enabled = true) {
  const params = { ...f, compare: !!f.compare }
  return useQuery({
    queryKey: ['stats', 'expenses', params],
    queryFn: () => api.get<ExpenseTree>(`/api/stats/expenses${qs(params)}`),
    placeholderData: keepPreviousData,
    enabled,
  })
}

export function useNetWorth(member: MemberFilter, months = 8) {
  const params = { months, member: memberParam(member) }
  return useQuery({ queryKey: ['stats', 'net-worth', params], queryFn: () => api.get<NetWorth>(`/api/stats/net-worth${qs(params)}`) })
}

export function usePayday(member: MemberFilter) {
  const params = { member: memberParam(member) }
  return useQuery({ queryKey: ['forecast', 'payday', params], queryFn: () => api.get<PaydayForecast>(`/api/forecast/payday${qs(params)}`) })
}

export function useForecast(horizon = 30) {
  return useQuery({ queryKey: ['forecast', 'accounts', horizon], queryFn: () => api.get<AccountForecast[]>(`/api/forecast${qs({ horizon })}`) })
}

export function useConditions(member: MemberFilter) {
  const params = { member: memberParam(member) }
  return useQuery({ queryKey: ['conditions', params], queryFn: () => api.get<ConditionsSummary>(`/api/conditions${qs(params)}`) })
}

export function useBudgets(month: string, member: MemberFilter, confirmedOnly: boolean) {
  const params = { month, member: memberParam(member), confirmedOnly: confirmedOnly || undefined }
  return useQuery({
    queryKey: ['budgets', params],
    queryFn: () => api.get<BudgetOverview>(`/api/budgets${qs(params)}`),
    placeholderData: keepPreviousData,
  })
}

export function useBatches() {
  return useQuery({ queryKey: ['batches'], queryFn: () => api.get<BatchSummary[]>('/api/batches') })
}

export function useInbox(member: MemberFilter) {
  const params = { member: memberParam(member) }
  return useQuery({ queryKey: ['inbox', params], queryFn: () => api.get<InboxResult>(`/api/inbox${qs(params)}`) })
}

/** Preference přihlášeného člena (GET/PUT /api/preferences/{key}), hodnota libovolné JSON. */
export function usePreference<T>(key: string, fallback: T) {
  const qc = useQueryClient()
  const q = useQuery({ queryKey: ['preferences', key], queryFn: () => api.get<T | null>(`/api/preferences/${encodeURIComponent(key)}`), staleTime: Infinity })
  const set = useCallback(
    (value: T) => {
      qc.setQueryData(['preferences', key], value)
      return api.put(`/api/preferences/${encodeURIComponent(key)}`, value)
    },
    [qc, key],
  )
  return [q.data ?? fallback, set, q.isLoading] as const
}

/** Klíče dotazů, které se mění po úpravě pohybu. */
export const TX_DEPENDENT_KEYS = ['stats', 'transactions', 'tx', 'budgets', 'inbox', 'badges', 'batches', 'conditions', 'forecast', 'accounts']

export function useInvalidateAfterTxChange() {
  const qc = useQueryClient()
  return useCallback(
    () => qc.invalidateQueries({ predicate: (q) => typeof q.queryKey[0] === 'string' && TX_DEPENDENT_KEYS.includes(q.queryKey[0]) }),
    [qc],
  )
}

// ---------- Strom výdajů ----------

export interface CatAgg {
  /** Id kategorie; 0 = nezařazené; záporné = zbytek nadřazené kategorie bez podkategorie. */
  id: number
  name: string
  /** Token barvy hlavní kategorie („c1“, „none“). */
  token: string
  need: NeedType
  amount: number
  previous: number
  count: number
  children: CatAgg[]
  /** Pseudo-uzel (nezařazené / zbytek) – nejde podle něj filtrovat podkategorii. */
  synthetic?: boolean
}

/** Hlavní kategorie výdajů s částkami a přímými podkategoriemi (seřazeno sestupně). */
export function buildExpenseTree(cats: Categories, amounts: CategoryAmount[]): CatAgg[] {
  const by = new Map<number | null, CategoryAmount>(amounts.map((a) => [a.categoryId, a]))
  const tops = (cats.children.get(undefined) ?? []).filter((c) => c.kind === 'Expense')
  const result: CatAgg[] = []
  for (const t of tops) {
    const a = by.get(t.id)
    if (!a || (a.amount <= 0 && a.previous <= 0)) continue
    const children: CatAgg[] = (cats.children.get(t.id) ?? [])
      .map((c) => {
        const ca = by.get(c.id)
        return { id: c.id, name: c.name, token: t.color, need: c.effectiveNeed, amount: ca?.amount ?? 0, previous: ca?.previous ?? 0, count: ca?.count ?? 0, children: [] }
      })
      .filter((c) => c.amount > 0 || c.previous > 0)
      .sort((x, y) => y.amount - x.amount)
    const rest = a.amount - children.reduce((s, c) => s + Math.max(0, c.amount), 0)
    const restPrev = a.previous - children.reduce((s, c) => s + Math.max(0, c.previous), 0)
    if (children.length > 0 && (rest > 0.5 || restPrev > 0.5))
      children.push({ id: -t.id, name: `${t.name} – bez podkategorie`, token: t.color, need: t.effectiveNeed, amount: Math.max(0, rest), previous: Math.max(0, restPrev), count: 0, children: [], synthetic: true })
    result.push({ id: t.id, name: t.name, token: t.color, need: t.effectiveNeed, amount: a.amount, previous: a.previous, count: a.count, children })
  }
  const unc = by.get(null)
  if (unc && (unc.amount > 0 || unc.previous > 0))
    result.push({ id: 0, name: 'Nezařazené', token: 'none', need: 'None', amount: unc.amount, previous: unc.previous, count: unc.count, children: [], synthetic: true })
  return result.sort((x, y) => y.amount - x.amount)
}

// ---------- Barvy ----------

export const tokenVar = (token: string) => (token.startsWith('var(') ? token : `var(--${token})`)
export const mix = (color: string, pct: number) => `color-mix(in oklch, ${tokenVar(color)} ${pct}%, var(--surface))`
export const needVar = (n: NeedType | null | undefined) => (n === 'Need' ? 'var(--need)' : n === 'Joy' ? 'var(--joy)' : 'var(--none)')
/** Odstíny podkategorií v prstenci (podle pořadí) a v treemapě. */
export const RING_SHADES = [82, 62, 46, 34, 26]
export const TILE_SHADES = [62, 48, 38, 30, 24]
export const ringShade = (token: string, i: number) => mix(token, RING_SHADES[i] ?? 22)
export const tileShade = (token: string, i: number) => mix(token, TILE_SHADES[i] ?? 22)

// ---------- Období ----------

/** „Výdaje v září“, „Výdaje za Q3 2026“ */
export function spentHeading(p: Period) {
  if (p.kind === 'Month') return `Výdaje v ${monthLocative[Number(p.value.split('-')[1]) - 1]}`
  if (p.kind === 'Year') return `Výdaje za rok ${p.value}`
  if (p.kind === 'Quarter') return `Výdaje za ${periodLabel(p)}`
  return 'Výdaje za období'
}

/** Krátký popisek porovnání: „vs. srpen“ (měsíc v témže roce bez roku). */
export function compareShort(p: Period) {
  if (p.kind === 'Month') {
    const prev = shiftPeriod(p, -1)
    const [y, m] = prev.value.split('-').map(Number)
    return `vs. ${monthNames[m - 1]}${y !== Number(p.value.slice(0, 4)) ? ` ${y}` : ''}`
  }
  return compareLabel(p)
}

/** „2026-09“ → „Září 2026“ */
export const monthKeyLabel = (key: string) => `${monthNamesCap[Number(key.slice(5, 7)) - 1]} ${key.slice(0, 4)}`
/** „2026-09“ → „Zář“ */
export const monthKeyShort = (key: string) => {
  const s = monthShort[Number(key.slice(5, 7)) - 1]
  return s[0].toUpperCase() + s.slice(1)
}

/** Měsíc pro rozpočty: vybraný měsíc, jinak měsíc konce období (nejvýš dnešní). */
export function budgetMonth(p: Period, todayIso: string) {
  if (p.kind === 'Month') return p.value
  const to = periodRange(p).to
  return (to < todayIso ? to : todayIso).slice(0, 7)
}

/** Procentní změna, nebo null když není s čím porovnat. */
export function deltaPct(cur: number, prev: number | null | undefined) {
  if (prev == null || prev <= 0) return null
  return (cur / prev - 1) * 100
}

// ---------- Účty a členové ----------

/** Váha účtu pro vybraného člena (vlastní účet 1, společný podle poměru, cizí 0). */
export function accountWeight(a: Account, member: MemberFilter) {
  if (member === 'all') return 1
  if (a.joint) return (a.ratio.find((r) => r.memberId === member)?.percent ?? 0) / 100
  return a.ownerMemberId === member ? 1 : a.ownerMemberId == null ? 1 : 0
}

/** Podíl člena na pohybu v procentech (100 = celý). */
export function txShare(tx: TxRow, member: MemberFilter) {
  if (member === 'all') return 100
  return tx.shares.find((s) => s.memberId === member)?.percent ?? 0
}

export const categorySourceLabel: Record<CategorySource, string> = { Rule: 'Pravidlo', Ai: 'AI', Manual: 'Zařazeno ručně', Auto: 'Automaticky' }
