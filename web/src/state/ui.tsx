import { useQuery } from '@tanstack/react-query'
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { api } from '../lib/api'
import { monthNamesCap, monthNames, parseIso, toIso } from '../lib/format'
import type { Household, Me, PeriodKind } from '../lib/types'

// ---------- Období ----------

export interface Period {
  kind: PeriodKind
  /** „2026-09“, „2026-Q3“, „2026“ nebo „2026-04-01..2026-09-28“ – stejný formát jako backend (DateRange.Parse). */
  value: string
}

export function currentPeriod(kind: PeriodKind, todayIso: string): Period {
  const d = parseIso(todayIso)
  const y = d.getFullYear()
  const m = d.getMonth() + 1
  if (kind === 'Quarter') return { kind, value: `${y}-Q${Math.ceil(m / 3)}` }
  if (kind === 'Year') return { kind, value: `${y}` }
  return { kind: 'Month', value: `${y}-${String(m).padStart(2, '0')}` }
}

export function periodRange(p: Period): { from: string; to: string } {
  if (p.kind === 'Custom') {
    const [from, to] = p.value.split('..')
    return { from, to }
  }
  if (p.kind === 'Year') return { from: `${p.value}-01-01`, to: `${p.value}-12-31` }
  if (p.kind === 'Quarter') {
    const [y, q] = p.value.split('-Q').map(Number)
    const from = new Date(y, (q - 1) * 3, 1)
    const to = new Date(y, q * 3, 0)
    return { from: toIso(from), to: toIso(to) }
  }
  const [y, m] = p.value.split('-').map(Number)
  return { from: toIso(new Date(y, m - 1, 1)), to: toIso(new Date(y, m, 0)) }
}

export function shiftPeriod(p: Period, delta: number): Period {
  if (p.kind === 'Year') return { ...p, value: String(Number(p.value) + delta) }
  if (p.kind === 'Quarter') {
    const [y, q] = p.value.split('-Q').map(Number)
    const idx = y * 4 + (q - 1) + delta
    return { ...p, value: `${Math.floor(idx / 4)}-Q${(idx % 4) + 1}` }
  }
  if (p.kind === 'Month') {
    const [y, m] = p.value.split('-').map(Number)
    const d = new Date(y, m - 1 + delta, 1)
    return { ...p, value: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` }
  }
  const { from, to } = periodRange(p)
  const days = Math.round((parseIso(to).getTime() - parseIso(from).getTime()) / 86_400_000) + 1
  const f = parseIso(from)
  f.setDate(f.getDate() + days * delta)
  const t = parseIso(to)
  t.setDate(t.getDate() + days * delta)
  return { ...p, value: `${toIso(f)}..${toIso(t)}` }
}

export function periodLabel(p: Period) {
  if (p.kind === 'Year') return `Rok ${p.value}`
  if (p.kind === 'Quarter') return p.value.replace('-', ' ')
  if (p.kind === 'Month') {
    const [y, m] = p.value.split('-').map(Number)
    return `${monthNamesCap[m - 1]} ${y}`
  }
  const { from, to } = periodRange(p)
  const f = parseIso(from)
  const t = parseIso(to)
  return `${f.getDate()}. ${f.getMonth() + 1}. – ${t.getDate()}. ${t.getMonth() + 1}. ${t.getFullYear()}`
}

/** „vs. srpen 2026“ */
export function compareLabel(p: Period) {
  const prev = shiftPeriod(p, -1)
  if (p.kind === 'Month') {
    const [y, m] = prev.value.split('-').map(Number)
    return `vs. ${monthNames[m - 1]} ${y}`
  }
  return `vs. ${periodLabel(prev)}`
}

export function periodMonths(p: Period) {
  const { from, to } = periodRange(p)
  const f = parseIso(from)
  const t = parseIso(to)
  return (t.getFullYear() - f.getFullYear()) * 12 + t.getMonth() - f.getMonth() + 1
}

/** Počet měsíců pro průměr „Ø za měsíc“: u běžícího období jen uplynulé měsíce včetně aktuálního. */
export function elapsedMonths(p: Period, todayIso: string) {
  const { from, to } = periodRange(p)
  const end = to < todayIso ? to : todayIso
  if (end < from) return periodMonths(p)
  const f = parseIso(from)
  const t = parseIso(end)
  return Math.max(1, (t.getFullYear() - f.getFullYear()) * 12 + t.getMonth() - f.getMonth() + 1)
}

// ---------- Kontext ----------

export type MemberFilter = 'all' | number

interface UiState {
  me: Me
  household: Household
  mode: 'light' | 'dark'
  toggleMode: () => void
  hidden: boolean
  toggleHidden: () => void
  member: MemberFilter
  setMember: (m: MemberFilter) => void
  period: Period
  setPeriod: (p: Period) => void
  compare: boolean
  setCompare: (v: boolean) => void
  /** Jen potvrzené platby – řídí se nastavením domácnosti (v hlavičkách už přepínač není). */
  confirmedOnly: boolean
  /** Parametry pro API: member, period, confirmedOnly. */
  filterParams: { member?: number; period: string; confirmedOnly?: boolean; compare?: boolean }
}

const Ctx = createContext<UiState | null>(null)

function load<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key)
    return v == null ? fallback : (JSON.parse(v) as T)
  } catch {
    return fallback
  }
}
function save(key: string, value: unknown) {
  try {
    if (value === undefined) localStorage.removeItem(key)
    else localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* soukromé okno */
  }
}
function loadSession<T>(key: string, fallback: T): T {
  try {
    const v = sessionStorage.getItem(key)
    return v == null ? fallback : (JSON.parse(v) as T)
  } catch {
    return fallback
  }
}
function saveSession(key: string, value: unknown) {
  try {
    sessionStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* nic */
  }
}

const systemDark = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-color-scheme: dark)').matches

export function UiProvider({ me, household, children }: { me: Me; household: Household; children: ReactNode }) {
  const s = household.settings
  const [modeOverride, setModeOverride] = useState<'light' | 'dark' | undefined>(() => load('pampeliska.mode', undefined))
  const [sysDark, setSysDark] = useState(systemDark)
  useEffect(() => {
    const mq = matchMedia('(prefers-color-scheme: dark)')
    const l = () => setSysDark(mq.matches)
    mq.addEventListener('change', l)
    return () => mq.removeEventListener('change', l)
  }, [])
  const base = s.theme === 'Dark' ? 'dark' : s.theme === 'System' ? (sysDark ? 'dark' : 'light') : 'light'
  // Změna motivu v Nastavení zruší lokální přebití z hlavičky
  const [themeSeen, setThemeSeen] = useState(s.theme)
  if (themeSeen !== s.theme) {
    setThemeSeen(s.theme)
    setModeOverride(undefined)
    save('pampeliska.mode', undefined)
  }
  const mode = modeOverride ?? base
  useEffect(() => {
    document.documentElement.dataset.mode = mode
  }, [mode])

  const [hidden, setHidden] = useState<boolean>(() => loadSession('pampeliska.hidden', s.hideAmountsOnStart))
  const [member, setMemberState] = useState<MemberFilter>(() => loadSession('pampeliska.member', 'all'))
  const [period, setPeriodState] = useState<Period>(() => loadSession('pampeliska.period', currentPeriod(s.defaultPeriod, household.today)))
  const [compare, setCompareState] = useState<boolean>(() => loadSession('pampeliska.compare', true))
  const confirmedOnly = s.confirmedOnlyDefault

  const toggleMode = useCallback(() => {
    const next = mode === 'dark' ? 'light' : 'dark'
    const v = next === base ? undefined : next
    setModeOverride(v)
    save('pampeliska.mode', v)
  }, [mode, base])
  const toggleHidden = useCallback(() => setHidden((h) => (saveSession('pampeliska.hidden', !h), !h)), [])
  const setMember = useCallback((m: MemberFilter) => (setMemberState(m), saveSession('pampeliska.member', m)), [])
  const setPeriod = useCallback((p: Period) => (setPeriodState(p), saveSession('pampeliska.period', p)), [])
  const setCompare = useCallback((v: boolean) => (setCompareState(v), saveSession('pampeliska.compare', v)), [])

  const value = useMemo<UiState>(() => ({
    me, household, mode, toggleMode, hidden, toggleHidden, member, setMember, period, setPeriod, compare, setCompare,
    confirmedOnly,
    filterParams: {
      member: member === 'all' ? undefined : member, period: period.value, confirmedOnly: confirmedOnly || undefined,
      compare: compare || undefined,
    },
  }), [me, household, mode, toggleMode, hidden, toggleHidden, member, setMember, period, setPeriod, compare, setCompare, confirmedOnly])

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useUi() {
  const v = useContext(Ctx)
  if (!v) throw new Error('useUi mimo UiProvider')
  return v
}

export const useHousehold = () => useUi().household

/** Člen podle id (jméno, barva). */
export function useMembers() {
  const h = useUi().household
  return useMemo(() => new Map(h.members.map((m) => [m.id, m])), [h.members])
}

export const householdQuery = { queryKey: ['household'], queryFn: () => api.get<Household>('/api/household') }
export const useHouseholdQuery = () => useQuery(householdQuery)
