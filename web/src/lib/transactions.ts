// Typy a pomocníci obrazovky Pohyby (DTO z TransactionEndpoints / StatsService).
import type { QueryClient } from '@tanstack/react-query'
import type { Account, CategorySource, Member, PaymentType, Share, TransactionKind, TxRow } from './types'

/** GET /api/transactions/summary – karty nad seznamem (v Kč, výdaje kladně po odečtení vratek). */
export interface TxSummary {
  expense: number
  refunds: number
  income: number
  incomeCount: number
  transfers: number
  excluded: number
  corrections: number
  count: number
}

/** Odesílatel převodu: člen (vlastník zdrojového účtu), nebo společný zdrojový účet. */
export interface TransferSender {
  memberId?: number
  fromAccountId?: number
  amount: number
}

/** GET /api/transfers/flows – „Kdo kolik poslal na účty“. */
export interface TransferFlow {
  accountId: number
  total: number
  senders: TransferSender[]
}

/** POST /api/transactions – ruční pohyb. */
export interface ManualTxInput {
  accountId: number
  date: string
  /** Se znaménkem: záporná = výdaj. */
  amount: number
  counterparty: string
  message?: string | null
  categoryId?: number | null
  paymentType?: PaymentType | null
  note?: string | null
  confirm?: boolean
}

/** POST /api/accounts/{id}/corrections */
export interface CorrectionInput {
  date: string
  actualBalance: number
}
export interface CorrectionResult {
  id: number
  amount: number
  date: string
}

export type KindFilter = 'All' | 'Expense' | 'Income' | 'Transfer'
export type TxFlag = 'split' | 'unconfirmed' | 'recurring' | 'excluded' | 'corrections'

export const KIND_OPTIONS: { value: KindFilter; label: string }[] = [
  { value: 'All', label: 'Vše' },
  { value: 'Expense', label: 'Výdaje' },
  { value: 'Income', label: 'Příjmy' },
  { value: 'Transfer', label: 'Převody' },
]

export const FLAG_LABELS: Record<TxFlag, string> = {
  split: 'Rozdělené',
  unconfirmed: 'Nepotvrzené',
  recurring: 'Pravidelné',
  excluded: 'Nezapočítávané',
  corrections: 'Korekce',
}

export const kindLabel: Record<TransactionKind, string> = {
  Expense: 'Výdaj',
  Income: 'Příjem',
  Transfer: 'Převod mezi účty',
  InvestmentTransfer: 'Převod na investice',
  Refund: 'Vratka',
  Correction: 'Korekce zůstatku',
}

export const sourceLabel: Record<CategorySource, string> = {
  Rule: 'Zařadilo pravidlo',
  Ai: 'Zařadila AI',
  Manual: 'Zařazeno ručně',
  Auto: 'Rozpoznáno automaticky',
}

export const isTransferKind = (k: TransactionKind) => k === 'Transfer' || k === 'InvestmentTransfer'
/** Pohyb, který se kategorizuje (výdaj, příjem, vratka, převod mezi členy). */
export const isCategorizable = (tx: Pick<TxRow, 'kind' | 'betweenMembers'>) =>
  tx.kind === 'Expense' || tx.kind === 'Income' || tx.kind === 'Refund' || tx.betweenMembers

/** Pohyb se celý nezapočítává: vyřazený sám, nebo všechny jeho kategorie jsou vyřazené (korekce mají vlastní označení). */
export function isExcludedTx(tx: Pick<TxRow, 'kind' | 'excludeFromStats' | 'categoryId' | 'splits'>, isExcluded: (id?: number | null) => boolean) {
  if (tx.kind === 'Correction') return false
  if (tx.excludeFromStats) return true
  return tx.splits.length > 0 ? tx.splits.every((p) => isExcluded(p.categoryId)) : isExcluded(tx.categoryId)
}

/** Částka v Kč, která se započítává do výdajů/příjmů (bez částí ve vyřazených kategoriích). */
export function countedCzk(tx: TxRow, isExcluded: (id?: number | null) => boolean) {
  if (tx.excludeFromStats || !(tx.kind === 'Expense' || tx.kind === 'Income' || tx.kind === 'Refund')) return 0
  if (tx.splits.length > 0) return tx.splits.reduce((a, p) => a + (isExcluded(p.categoryId) ? 0 : p.amountCzk), 0)
  return isExcluded(tx.categoryId) ? 0 : tx.amountCzk
}

/** „Běžný účet · ČS“ */
export function accountLabel(a?: Pick<Account, 'name' | 'institution'>, short = false) {
  if (!a) return 'Neznámý účet'
  if (short) return a.name
  const inst = a.institution.name.length <= 12 ? a.institution.name : a.institution.abbrev
  return `${a.name} · ${inst}`
}

/** Poměr podílů „70 : 30“. */
export const ratioLabel = (shares: Share[]) => shares.map((s) => Math.round(s.percent)).join(' : ')

/** Komu pohyb patří: jeden člen na 100 % → člen, jinak společné. */
export function shareOwner(shares: Share[]): number | 'joint' | null {
  const active = shares.filter((s) => s.percent > 0)
  if (active.length === 1) return active[0].memberId
  if (active.length > 1) return 'joint'
  return null
}

/** Popisek člena v řádku: „Vašek“, „společná 70 : 30“. */
export function whoLabel(shares: Share[], members: Map<number, Member>) {
  const o = shareOwner(shares)
  if (o === null) return 'bez člena'
  if (o === 'joint') return `společná ${ratioLabel(shares.filter((s) => s.percent > 0))}`
  return members.get(o)?.name ?? 'člen'
}

/** Rovnoměrné podíly pro všechny členy (součet přesně 100). */
export function equalShares(members: Member[]): Share[] {
  const n = members.length
  if (!n) return []
  const base = Math.floor(10000 / n) / 100
  const shares = members.map((m) => ({ memberId: m.id, percent: base }))
  shares[0].percent = Math.round((100 - base * (n - 1)) * 100) / 100
  return shares
}

/** Po změně pohybu obnovit seznamy, souhrny, detail, odznaky a frontu třídění. */
export function invalidateTx(qc: QueryClient) {
  for (const key of ['transactions', 'badges', 'inbox', 'batches', 'accounts', 'stats']) qc.invalidateQueries({ queryKey: [key] })
}

/** Řádek seznamu po sloučení obou stran převodu (bez filtru účtu se příchozí strana schová pod odchozí). */
export interface ListRow {
  tx: TxRow
  /** Spárovaná protistrana převodu, pokud je načtená. */
  pair?: TxRow
}

/** „Nový zůstatek 44870 CZK“ z poznámky korekce → 44870. */
export function correctionBalance(note?: string): number | null {
  const m = note?.match(/Nový zůstatek\s+(-?[\d.,]+)/)
  if (!m) return null
  const v = Number(m[1].replace(',', '.'))
  return Number.isFinite(v) ? v : null
}
