import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo } from 'react'
import { api, notifyError, qs } from './api'
import { monthNamesCap } from './format'
import type { BudgetPeriod } from './types'

// ---------- DTO (BudgetService.cs) ----------

export type BudgetStatus = 'NoLimit' | 'OnPace' | 'Faster' | 'WontFit' | 'Over' | 'Paid' | 'Waiting'

export interface Reservation {
  recurringId: number
  name: string
  date: string
  amount: number
}

export interface NeedSplit {
  need: number
  joy: number
  none: number
}

export interface BudgetLine {
  categoryId: number
  parentId?: number | null
  depth: number
  name: string
  period: BudgetPeriod
  /** Efektivní limit včetně přeneseného (vlastní, jinak součet podkategorií). */
  limit?: number | null
  /** Vlastní limit (domácnosti, nebo osobní u `personal`). */
  ownLimit?: number | null
  childSum: number
  carryOver: boolean
  carriedIn: number
  carryOut: number
  /** Útrata celé domácnosti; u osobního limitu útrata člena. */
  spent: number
  /** Podíl vybraného člena (jen když je vybraný člen). */
  memberSpent?: number | null
  reserved: number
  reservations: Reservation[]
  status: BudgetStatus
  needs: NeedSplit
  isFixed: boolean
  /** Řádek ukazuje osobní limit vybraného člena. */
  personal: boolean
  free: number
}

export interface BudgetOverview {
  month: string
  closed: boolean
  day: number
  daysInMonth: number
  pace: number
  total: number
  spent: number
  memberSpent?: number | null
  reserved: number
  free: number
  monthly: BudgetLine[]
  yearly: BudgetLine[]
  yearPace: number
}

export interface BudgetSeries {
  cumulative: number[]
  limit?: number | null
  projection: number
  day: number
  daysInMonth: number
}

export interface BudgetInput {
  categoryId: number
  /** null = limit domácnosti, číslo = osobní limit člena. */
  memberId: number | null
  period: BudgetPeriod
  /** null = zrušit limit. */
  amount: number | null
  carryOver?: boolean
}

// ---------- Data ----------

export function useBudgets(month: string, member: number | undefined, confirmedOnly: boolean) {
  return useQuery({
    queryKey: ['budgets', month, member ?? null, confirmedOnly],
    queryFn: () => api.get<BudgetOverview>(`/api/budgets${qs({ month, member, confirmedOnly: confirmedOnly || undefined })}`),
    placeholderData: keepPreviousData,
  })
}

export function useBudgetSeries(categoryId: number | null, month: string, member: number | undefined, confirmedOnly: boolean) {
  return useQuery({
    queryKey: ['budget-series', categoryId, month, member ?? null, confirmedOnly],
    queryFn: () => api.get<BudgetSeries>(`/api/budgets/${categoryId}/series${qs({ month, member, confirmedOnly: confirmedOnly || undefined })}`),
    enabled: categoryId != null,
    placeholderData: keepPreviousData,
  })
}

export function useSetBudget() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: BudgetInput) => api.put<void>('/api/budgets', input),
    onSuccess: () => Promise.all([
      qc.invalidateQueries({ queryKey: ['budgets'] }),
      qc.invalidateQueries({ queryKey: ['budget-series'] }),
      qc.invalidateQueries({ queryKey: ['categories'] }),
    ]),
    onError: notifyError,
  })
}

/** Rozdělení měsíčních řádků na hlavní a potomky (rodič nemusí mít řádek – pak je řádek hlavní). */
export function useLineTree(lines: BudgetLine[]) {
  return useMemo(() => {
    const ids = new Set(lines.map((l) => l.categoryId))
    const kids = new Map<number, BudgetLine[]>()
    const tops: BudgetLine[] = []
    for (const l of lines) {
      if (l.parentId != null && ids.has(l.parentId)) {
        const arr = kids.get(l.parentId) ?? []
        arr.push(l)
        kids.set(l.parentId, arr)
      } else tops.push(l)
    }
    return { tops, kids }
  }, [lines])
}

// ---------- Stav ----------

export const statusMeta: Record<BudgetStatus, { label: string; fg: string; bg: string }> = {
  NoLimit: { label: 'Bez limitu', fg: 'var(--ink-3)', bg: 'var(--surface-2)' },
  OnPace: { label: 'V tempu', fg: 'var(--pos)', bg: 'color-mix(in oklch, var(--pos) 12%, var(--surface))' },
  Faster: { label: 'Rychleji než tempo', fg: 'var(--warn)', bg: 'color-mix(in oklch, var(--warn) 16%, var(--surface))' },
  WontFit: { label: 'Nevejde se', fg: 'var(--neg)', bg: 'color-mix(in oklch, var(--neg) 14%, var(--surface))' },
  Over: { label: 'Přečerpáno', fg: 'var(--surface)', bg: 'var(--neg)' },
  Paid: { label: 'Zaplaceno', fg: 'var(--ink-2)', bg: 'var(--surface-2)' },
  Waiting: { label: 'Čeká na platbu', fg: 'var(--ink-2)', bg: 'var(--surface-2)' },
}

/** Odchylka od tempa, od které je čerpání „rychleji než tempo“ (BudgetService.FasterMargin). */
export const FASTER_MARGIN = 4

export const HATCH = 'repeating-linear-gradient(135deg, var(--ink-3) 0 2px, transparent 2px 5px)'

// ---------- Pruh čerpání ----------

export type ColorBy = 'cat' | 'need'

export interface BarSeg {
  value: number
  color: string
  title?: string
}

export interface BarModel {
  segs: BarSeg[]
  track: number
  limit: number | null
  /** Hodnota, kde leží značka tempa (limit × tempo). */
  pace: number | null
}

/** Útrata „vlastní“ (vybraný člen nebo celá domácnost) a zbytek ostatních členů. */
export function shareOf(l: BudgetLine, memberSelected: boolean) {
  const own = memberSelected && !l.personal && l.memberSpent != null ? l.memberSpent : l.spent
  return { own, others: Math.max(0, l.spent - own) }
}

export function barModel(l: BudgetLine, o: { color: string; colorBy: ColorBy; memberSelected: boolean; pace: number; othersLabel?: string }): BarModel {
  const limit = l.limit != null && l.limit > 0 ? l.limit : null
  const { own, others } = shareOf(l, o.memberSelected)
  const over = limit != null && l.spent > limit
  const base = over ? 'var(--neg)' : o.color
  const segs: BarSeg[] = []
  const n = l.needs.need + l.needs.joy + l.needs.none
  if (o.colorBy === 'need' && n > 0) {
    segs.push({ value: (own * l.needs.need) / n, color: 'var(--need)', title: 'nezbytné' })
    segs.push({ value: (own * l.needs.joy) / n, color: 'var(--joy)', title: 'pro radost' })
    segs.push({ value: (own * l.needs.none) / n, color: 'var(--none)', title: 'neoznačené' })
  } else segs.push({ value: own, color: base })
  if (others > 0) segs.push({ value: others, color: `color-mix(in oklch, ${base} 35%, var(--surface))`, title: o.othersLabel ?? 'ostatní' })
  if (l.reserved > 0) segs.push({ value: l.reserved, color: HATCH, title: 'rezervováno' })
  const track = Math.max(limit ?? (l.spent + l.reserved || 1), l.spent + l.reserved)
  return { segs: segs.filter((s) => s.value > 0), track, limit, pace: limit != null ? (limit * o.pace) / 100 : null }
}

// ---------- Měsíce ----------

const monthGen = ['ledna', 'února', 'března', 'dubna', 'května', 'června', 'července', 'srpna', 'září', 'října', 'listopadu', 'prosince']

export function shiftMonth(month: string, delta: number) {
  const [y, m] = month.split('-').map(Number)
  const d = new Date(y, m - 1 + delta, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export const monthIndex = (month: string) => Number(month.split('-')[1]) - 1

/** „Září 2026“ */
export function monthTitle(month: string) {
  const [y, m] = month.split('-').map(Number)
  return `${monthNamesCap[m - 1]} ${y}`
}

/** „ze srpna“, „z října“ – odkud se přenáší. */
export function fromMonth(month: string) {
  const i = monthIndex(month)
  return `${i === 7 || i === 8 ? 'ze' : 'z'} ${monthGen[i]}`
}

/** „do října“ */
export const toMonth = (month: string) => `do ${monthGen[monthIndex(month)]}`

export function isMonth(v: string | null): v is string {
  return !!v && /^\d{4}-(0[1-9]|1[0-2])$/.test(v)
}
