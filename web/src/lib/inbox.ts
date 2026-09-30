// Fronta „Ke kategorizaci“ a dávky importu: DTO, dotazy a pomocné výpočty (bez komponent).
import { keepPreviousData, useQuery, type QueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import type { SplitPart } from '../components/category'
import { api, qs } from './api'
import type {
  Account, BatchSource, BatchState, CategoryKind, CategorySource, NeedType, Share, TransactionKind, TransactionStatus, TxRef, TxRow, TxUpdate,
} from './types'

// ---------- DTO ----------

export type InboxFilter = 'All' | 'AiUnsure' | 'NoSuggestion' | 'SplitSuggestion' | 'Duplicates'

export interface AiAlternative {
  categoryId: number
  confidence: number
}

export interface InboxItem {
  tx: TxRow
  rawText?: string
  aiReason?: string
  alternatives: AiAlternative[]
  /** Popis pravidla, které platbu zařadilo („Obchodník obsahuje „LIDL“ → Supermarkety“). */
  rule?: string
  duplicateOf?: TxRef
}

export interface InboxCounts {
  all: number
  aiUnsure: number
  noSuggestion: number
  splitSuggestion: number
  duplicates: number
}

export interface InboxResult {
  items: InboxItem[]
  counts: InboxCounts
}

export interface BatchSummary {
  id: number
  createdAt: string
  source: BatchSource
  clientName?: string
  createdBy?: string
  state: BatchState
  categorizedAt?: string
  confirmedAt?: string
  count: number
  confirmed: number
  pending: number
  duplicateCount: number
  suspectedCount: number
  accounts: string[]
  note?: string
}

export interface BatchItem {
  id: number
  date: string
  counterparty: string
  amount: number
  currency: string
  amountCzk: number
  account: string
  kind: TransactionKind
  status: TransactionStatus
  /** Cesta kategorie („Jídlo › Supermarkety“) nebo „Rozděleno · 2 části“. */
  category?: string
  source?: CategorySource
  aiConfidence?: number
  suspectedDuplicate: boolean
  betweenMembers: boolean
}

export interface SkippedItem {
  date: string
  counterparty: string
  amount: number
  existingTransactionId?: number
}

export interface BatchDetail {
  batch: BatchSummary
  items: BatchItem[]
  skipped: SkippedItem[]
}

/** Stačí počet – plný typ je v components/McpConnections.tsx. */
export interface McpConnectionLite {
  id: number
  clientName: string
  lastUsedAt?: string
}

/** Pod touto jistotou je návrh AI „nejistý“ (InboxService.UnsureBelow). */
export const UNSURE_BELOW = 70
export const CONFIDENT_MIN = 90

// ---------- Dotazy ----------

export function useInbox(filter: InboxFilter, member: number | undefined, search: string) {
  return useQuery({
    queryKey: ['inbox', filter, member ?? 'all', search],
    queryFn: () => api.get<InboxResult>(`/api/inbox${qs({ filter, member, search })}`),
    placeholderData: keepPreviousData,
  })
}

export function useBatches() {
  return useQuery({ queryKey: ['batches'], queryFn: () => api.get<BatchSummary[]>('/api/batches') })
}

export function useBatch(id: number | null) {
  return useQuery({
    queryKey: ['batches', id],
    queryFn: () => api.get<BatchDetail>(`/api/batches/${id}`),
    enabled: id != null,
    placeholderData: keepPreviousData,
  })
}

export function useMcpConnections() {
  return useQuery({ queryKey: ['mcp-connections'], queryFn: () => api.get<McpConnectionLite[]>('/api/mcp/connections'), retry: false })
}

/** Po každé změně pohybů ve frontě. */
export function invalidateInbox(qc: QueryClient) {
  return Promise.all(['inbox', 'badges', 'batches', 'transactions'].map((k) => qc.invalidateQueries({ queryKey: [k] })))
}

// ---------- Rozpracované úpravy platby ----------

/** Lokální úpravy platby před potvrzením. `undefined` = beze změny. */
export interface InboxDraft {
  categoryId?: number | null
  /** Kladné části; prázdné pole = zrušit rozdělení. */
  splits?: SplitPart[]
  need?: NeedType
  member?: number | 'shared'
  rule?: boolean
}

export interface Effective {
  categoryId: number | null
  splits: SplitPart[]
  isSplit: boolean
  /** Uživatel změnil zařazení (nebo platba už byla zařazena ručně). */
  manual: boolean
  changedCategory: boolean
  noSuggestion: boolean
  splitValid: boolean
  offerRule: boolean
  ruleOn: boolean
  canConfirm: boolean
  hasChanges: boolean
  need?: NeedType
  member: number | 'shared' | null
}

const round2 = (v: number) => Math.round(v * 100) / 100

export function txSplitParts(tx: TxRow): SplitPart[] {
  return tx.splits.map((s) => ({ categoryId: s.categoryId, amount: Math.abs(s.amount), need: s.needOverride ?? null }))
}

/** Člen platby: jediný podíl 100 % = člen, jinak společná. */
export function txMember(tx: TxRow): number | 'shared' | null {
  if (tx.shares.length === 1 && tx.shares[0].percent >= 99.99) return tx.shares[0].memberId
  return tx.shares.length > 1 ? 'shared' : null
}

export function effective(item: InboxItem, draft: InboxDraft | undefined): Effective {
  const tx = item.tx
  const d = draft ?? {}
  const splits = d.splits !== undefined ? d.splits : txSplitParts(tx)
  const isSplit = splits.length > 0
  const categoryId = d.categoryId !== undefined ? d.categoryId : tx.categoryId ?? null
  const changedCategory = d.categoryId !== undefined && d.categoryId !== (tx.categoryId ?? null)
  const noSuggestion = tx.categoryId == null && tx.splits.length === 0
  const sum = round2(splits.reduce((a, p) => a + p.amount, 0))
  const splitValid = isSplit && splits.length >= 2 && splits.every((p) => p.categoryId != null && p.amount > 0) && Math.abs(sum - Math.abs(tx.amount)) < 0.005
  const manual = changedCategory || (d.splits !== undefined && isSplit) || tx.categorySource === 'Manual'
  const offerRule = !isSplit && categoryId != null && (changedCategory || noSuggestion)
  const hasChanges = d.categoryId !== undefined || d.splits !== undefined || d.need !== undefined || d.member !== undefined
  return {
    categoryId, splits, isSplit, manual, changedCategory, noSuggestion, splitValid, offerRule,
    ruleOn: offerRule && (d.rule ?? true),
    canConfirm: isSplit ? splitValid : categoryId != null,
    hasChanges,
    need: d.need ?? tx.needOverride,
    member: d.member !== undefined ? d.member : txMember(tx),
  }
}

/** Podíly pro „Společné“: poměr společného účtu, jinak rovným dílem. */
export function sharedShares(account: Account | undefined, memberIds: number[]): Share[] {
  if (account?.joint && account.ratio.length > 1) return account.ratio
  const n = memberIds.length
  const base = Math.floor(10000 / n) / 100
  return memberIds.map((memberId, i) => ({ memberId, percent: i === n - 1 ? round2(100 - base * (n - 1)) : base }))
}

/** PATCH pro „Potvrdit“: změny z konceptu + potvrzení (+ pravidlo). */
export function buildPatch(item: InboxItem, draft: InboxDraft | undefined, eff: Effective, sharesFor: () => Share[]): TxUpdate {
  const tx = item.tx
  const d = draft ?? {}
  const sign = tx.amount < 0 ? -1 : 1
  const u: TxUpdate = { confirm: true }
  if (d.splits !== undefined) {
    u.splits = eff.isSplit
      ? eff.splits.map((p) => ({ categoryId: p.categoryId as number, amount: round2(sign * p.amount), needOverride: p.need && p.need !== 'Inherit' ? p.need : null }))
      : []
  }
  if (!eff.isSplit && (d.categoryId !== undefined || (d.splits !== undefined && tx.splits.length > 0))) {
    u.setCategory = true
    u.categoryId = eff.categoryId
  }
  if (d.need !== undefined) {
    u.setNeed = true
    u.needOverride = d.need
  }
  if (d.member !== undefined) {
    if (d.member === 'shared') u.shares = sharesFor()
    else {
      u.setMember = true
      u.memberId = d.member
    }
  }
  if (eff.ruleOn) {
    u.createRule = true
    u.applyRuleToHistory = true
  }
  return u
}

// ---------- Texty ----------

const normalize = (s?: string | null) =>
  (s ?? '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim()

/** Klíč obchodníka jako v backendu (Text.MerchantKey): první dvě „slova“ bez čísel. */
export function merchantKey(counterparty?: string | null) {
  return normalize(counterparty)
    .split(/[^a-z0-9.]+/)
    .filter((w) => w.length > 1 && !/^\d+$/.test(w))
    .slice(0, 2)
    .join(' ')
}

export const normalizeText = normalize

export function categoryKindFor(tx: TxRow): CategoryKind | undefined {
  // Příchozí převod od člena: příjem, nebo vyrovnání výdaje (třeba polovina dovolené)
  if (tx.kind === 'Refund' || (tx.betweenMembers && tx.amount > 0)) return undefined
  return tx.amount < 0 ? 'Expense' : 'Income'
}

/** „dnes 6:12“, „včera 21:40“, „27. 9. 21:40“. */
export function whenLabel(ts?: string | null) {
  if (!ts) return '—'
  const d = new Date(ts)
  const now = new Date()
  const time = `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`
  const days = Math.round((new Date(now.toDateString()).getTime() - new Date(d.toDateString()).getTime()) / 86_400_000)
  if (days === 0) return `dnes ${time}`
  if (days === 1) return `včera ${time}`
  return `${d.getDate()}. ${d.getMonth() + 1}.${d.getFullYear() !== now.getFullYear() ? ` ${d.getFullYear()}` : ''} ${time}`
}

export const batchSourceLabel = (b: Pick<BatchSummary, 'source' | 'clientName'>) =>
  b.source === 'Mcp' ? `MCP${b.clientName ? ` · ${b.clientName}` : ''}` : b.source === 'Manual' ? 'Ručně' : 'Banka · Enable Banking'

// ---------- Mobil ----------

const MOBILE = '(max-width: 767px)'

export function useIsMobile() {
  const [m, setM] = useState(() => typeof matchMedia !== 'undefined' && matchMedia(MOBILE).matches)
  useEffect(() => {
    const mq = matchMedia(MOBILE)
    const l = () => setM(mq.matches)
    mq.addEventListener('change', l)
    return () => mq.removeEventListener('change', l)
  }, [])
  return m
}
