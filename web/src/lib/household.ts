// Typy a pomocníci pro obrazovky Účty, Členové a Nastavení (DTO psané ručně podle backendu).
import { useEffect, useState } from 'react'
import { monthLocative, parseIso } from './format'
import type {
  AccountKind, AccountSource, ConditionType, HouseholdSettings, InvestmentKind, MemberRole, ShareRecalcMode, ValueTracking,
} from './types'
import type { Period } from '../state/ui'

// ---------- Statistiky členů (GET /api/stats/members) ----------

export interface MemberStat {
  memberId: number
  income: number
  expense: number
  ownExpense: number
  jointExpense: number
  incomeShare: number
  expenseShare: number
}

export interface MemberCategory {
  categoryId: number
  total: number
  /** Klíč = id člena (JSON → řetězec). */
  byMember: Record<string, number>
}

export interface MembersStats {
  members: MemberStat[]
  byCategory: MemberCategory[]
  jointExpense: number
}

// ---------- Výhled (GET /api/forecast) ----------

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
  limit?: number
  low: boolean
  topUp?: number
  topUpBy?: string
  events: ForecastEvent[]
  horizonDays: number
}

// ---------- Podmínky účtů (GET /api/conditions) ----------

export type ConditionState = 'Met' | 'Pending' | 'Urgent'

export interface ConditionStatus {
  conditionId: number
  accountId: number
  type: ConditionType
  target: number
  current: number
  benefit?: string
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

// ---------- Zálohy (GET /api/backups) ----------

export interface BackupRun {
  id: number
  startedAt: string
  finishedAt: string
  success: boolean
  sizeBytes?: number
  message?: string
}

// ---------- Vstupy ----------

export interface ConditionInput {
  type: ConditionType
  target: number
  benefit?: string | null
}

/** POST/PUT /api/accounts – vynechané = beze změny (u PUT). */
export interface AccountInput {
  kind?: AccountKind
  institutionKey?: string
  name?: string
  iban?: string
  currency?: string
  ownerMemberId?: number
  joint?: boolean
  ratio?: Record<number, number>
  ratioMode?: ShareRecalcMode
  ratioFrom?: string
  cardToHolder?: boolean
  lowBalanceLimit?: number
  watchLowBalance?: boolean
  interestRate?: number
  investmentKind?: InvestmentKind
  fundingAccountId?: number
  valueTracking?: ValueTracking
  source?: AccountSource
  includeInDisposable?: boolean
  includeInNetWorth?: boolean
  openingBalance?: number
  openingDate?: string
  openingDeposits?: number
  conditions?: ConditionInput[]
}

export type SettingsInput = Partial<Omit<HouseholdSettings, 'onboardingDone'>> & { name?: string }

export interface MemberInput {
  name?: string
  email?: string
  colorToken?: string
  role?: MemberRole
}

// ---------- Popisky ----------

export const conditionTypeLabel: Record<ConditionType, string> = {
  IncomingSum: 'Příchozí platby za měsíc',
  CardCount: 'Počet plateb kartou za měsíc',
  AvgBalance: 'Průměrný měsíční zůstatek',
}

export const investmentKindLabel: Record<InvestmentKind, string> = {
  Etf: 'ETF a akcie',
  Pension: 'Penzijní spoření',
  Dip: 'DIP',
  Crypto: 'Kryptoměny',
  Other: 'Jiné',
}

export const MEMBER_COLORS = ['c1', 'c4', 'c3', 'c5', 'c6', 'c7', 'c2', 'c8', 'c9', 'c10', 'c11', 'c12']

/** „v září“, „v Q3 2026“, „v roce 2026“, „za období“ – pro popisky statistik. */
export function periodIn(p: Period, todayIso: string) {
  const thisYear = parseIso(todayIso).getFullYear()
  if (p.kind === 'Month') {
    const [y, m] = p.value.split('-').map(Number)
    return `v ${monthLocative[m - 1]}${y !== thisYear ? ` ${y}` : ''}`
  }
  if (p.kind === 'Quarter') return `v ${p.value.replace('-', ' ')}`
  if (p.kind === 'Year') return `v roce ${p.value}`
  return 'za období'
}

/** Mobilní rozložení (≤ 767 px). */
export function useIsMobile() {
  const query = '(max-width: 767px)'
  const [mobile, setMobile] = useState(() => typeof matchMedia !== 'undefined' && matchMedia(query).matches)
  useEffect(() => {
    const mq = matchMedia(query)
    const l = () => setMobile(mq.matches)
    mq.addEventListener('change', l)
    return () => mq.removeEventListener('change', l)
  }, [])
  return mobile
}

/** Velikost souboru „12,4 MB“. */
export function fileSize(bytes?: number) {
  if (bytes == null) return ''
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / 1024 ** 3).toFixed(1).replace('.', ',')} GB`
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 ** 2).toFixed(1).replace('.', ',')} MB`
  return `${Math.max(1, Math.round(bytes / 1024))} kB`
}
