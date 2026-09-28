// Typy a pomůcky pro obrazovku Pravidla (DTO podle RuleService.cs).
import { api } from './api'
import type { NeedType } from './types'

export type RuleField = 'Merchant' | 'Mcc' | 'Time' | 'CounterpartyAccount' | 'Account' | 'Amount'
export type RuleOp = 'Contains' | 'Eq' | 'Lt' | 'Gt' | 'Between' | 'Outside'
export type RuleLogic = 'And' | 'Or'
export type RuleSource = 'Manual' | 'Inbox' | 'Ai' | 'Mcp'

export interface RuleCondition {
  field: RuleField
  op: RuleOp
  /** Čas „11:00–14:00“, částka v Kč, účet = id účtu, protiúčet „123-456/0800“. */
  value: string
}

export interface RuleConflict {
  ruleId: number
  position: number
  /** true = druhé pravidlo je výš a toto přebíjí. */
  overrides: boolean
}

export interface RuleDto {
  id: number
  position: number
  logic: RuleLogic
  enabled: boolean
  source: RuleSource
  categoryId: number
  needOverride?: NeedType
  memberId?: number
  excludeFromStats: boolean
  markRecurring: boolean
  conditions: RuleCondition[]
  description: string
  /** Počet použití za posledních 6 měsíců. */
  matches: number
  /** Použití po měsících (6 hodnot, nejstarší první). */
  monthly: number[]
  lastUsed?: string
  createdAt: string
  disabledAt?: string
  conflicts: RuleConflict[]
}

/** POST/PUT /api/rules – vynechané = beze změny. */
export interface RuleInput {
  conditions?: RuleCondition[]
  logic?: RuleLogic
  categoryId?: number | null
  needOverride?: NeedType | null
  setNeed?: boolean
  memberId?: number | null
  setMember?: boolean
  excludeFromStats?: boolean
  markRecurring?: boolean
  enabled?: boolean
  position?: number
  source?: RuleSource
}

export interface RuleTestMatch {
  transactionId: number
  date: string
  time?: string
  counterparty: string
  amount: number
  currency: string
  accountId: number
  currentCategoryId?: number
  note: string
  willChange: boolean
}

export interface RuleTestResult {
  matches: number
  changes: number
  sample: RuleTestMatch[]
}

export interface RuleSuggestion {
  pattern: string
  categoryId: number
  count: number
  total: number
  reason: string
}

export const rulesQuery = { queryKey: ['rules'], queryFn: () => api.get<RuleDto[]>('/api/rules') }
export const ruleSuggestionsQuery = { queryKey: ['rules', 'suggestions'], queryFn: () => api.get<RuleSuggestion[]>('/api/rules/suggestions') }

export const FIELDS: RuleField[] = ['Merchant', 'Mcc', 'Time', 'CounterpartyAccount', 'Account', 'Amount']

export const fieldLabel: Record<RuleField, string> = {
  Merchant: 'Obchodník',
  Mcc: 'Typ obchodníka',
  Time: 'Čas platby',
  CounterpartyAccount: 'Protiúčet',
  Account: 'Účet',
  Amount: 'Částka',
}

export const opLabel: Record<RuleOp, string> = {
  Contains: 'obsahuje',
  Eq: 'je',
  Lt: 'je menší než',
  Gt: 'je větší než',
  Between: 'je mezi',
  Outside: 'je mimo',
}

/** Povolené operátory podle pole (stejně jako RuleEngine.Validate). */
export const opsFor: Record<RuleField, RuleOp[]> = {
  Merchant: ['Contains', 'Eq'],
  Mcc: ['Eq'],
  Time: ['Between', 'Outside'],
  CounterpartyAccount: ['Eq'],
  Account: ['Eq'],
  Amount: ['Lt', 'Gt', 'Eq'],
}

/** Výchozí hodnota při změně pole. */
export const defaultValue: Record<RuleField, string> = {
  Merchant: '',
  Mcc: '',
  Time: '11:00–14:00',
  CounterpartyAccount: '',
  Account: '',
  Amount: '1000',
}

export const sourceLabel: Record<RuleSource, string> = {
  Manual: 'Ručně',
  Inbox: 'Z třídění',
  Ai: 'AI návrh',
  Mcp: 'Přes MCP',
}

const TIME_RE = /^\s*(\d{1,2}):(\d{2})\s*[–-]\s*(\d{1,2}):(\d{2})\s*$/

/** Klientská kontrola podmínky (zrcadlí RuleEngine.Validate, aby šlo vypnout Uložit). */
export function conditionValid(c: RuleCondition) {
  const v = c.value.trim()
  if (!opsFor[c.field].includes(c.op) || !v) return false
  if (c.field === 'Time') return TIME_RE.test(v)
  if (c.field === 'Amount') return Number.isFinite(Number(v.replace(/[\s  Kč€$]/g, '').replace(',', '.')))
  if (c.field === 'Account') return /^\d+$/.test(v)
  return true
}
