// Typy pro Pravidelné platby, výhled, Kde ušetřit a Investice.

export type Frequency = 'Weekly' | 'Monthly' | 'Quarterly' | 'Yearly'
export type AmountKind = 'Fixed' | 'Variable'
export type RecurringStatus = 'Suggested' | 'Active' | 'Ended'
export type HistoryState = 'None' | 'Ok' | 'Late' | 'Variable' | 'Higher' | 'Lower' | 'Missing'
export type OccurrenceState = 'Expected' | 'Paired' | 'Missing' | 'Skipped'

export interface HistoryCell {
  month: string
  state: HistoryState
  amount?: number
  daysLate?: number
}

export interface Recurring {
  id: number
  accountId: number
  name: string
  matchPattern: string
  categoryId?: number
  amount: number
  currency: string
  amountCzk: number
  amountKind: AmountKind
  variancePct: number
  frequency: Frequency
  anchorDate: string
  toleranceDays: number
  isTransfer: boolean
  status: RecurringStatus
  source: 'Detected' | 'Manual' | 'Rule' | 'Mcp'
  markedToCancel: boolean
  note?: string
  monthlyCzk: number
  yearlyCzk: number
  nextDue?: string
  history: HistoryCell[]
  pairedCount: number
  lastAmount?: number
  lastDate?: string
}

export interface Occurrence {
  recurringId: number
  due: string
  state: OccurrenceState
  transactionId?: number
  amount: number
  amountCzk: number
  daysOverdue: number
}

export interface RecurringAlert {
  kind: 'missing' | 'amount'
  recurringId: number
  title: string
  text: string
  due?: string
  newAmount?: number
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
  limit?: number
  low: boolean
  topUp?: number
  topUpBy?: string
  events: ForecastEvent[]
  horizonDays: number
}

export interface RecurringInput {
  accountId?: number
  name?: string
  matchPattern?: string
  categoryId?: number | null
  setCategory?: boolean
  amount?: number
  amountKind?: AmountKind
  variancePct?: number
  frequency?: Frequency
  anchorDate?: string
  toleranceDays?: number
  isTransfer?: boolean
  markedToCancel?: boolean
  note?: string
}

export const frequencyLabel: Record<Frequency, string> = { Weekly: 'týdně', Monthly: 'měsíčně', Quarterly: 'čtvrtletně', Yearly: 'ročně' }
export const frequencyTitle: Record<Frequency, string> = { Weekly: 'Týdně', Monthly: 'Měsíčně', Quarterly: 'Čtvrtletně', Yearly: 'Ročně' }

// ---------- Kde ušetřit ----------

export interface JoyMonth { month: string; joy: number; total: number; share: number }
export interface JoyCategory { categoryId: number; amount: number; average: number }
export interface JoySubscription {
  recurringId: number
  name: string
  accountId: number
  categoryId?: number
  amount: number
  currency: string
  frequency: Frequency
  monthlyCzk: number
  yearlyCzk: number
  nextDue?: string
  markedToCancel: boolean
  ownerMemberId?: number
}
export interface SavingsOverview {
  month: string
  joy: number
  joyShare: number
  joyYear: number
  history: JoyMonth[]
  averageShare: number
  topJoy: JoyCategory[]
  subscriptions: JoySubscription[]
  insight?: { categoryId: number; count: number; yearlyCzk: number; names: string[] }
  disposable: number
  monthlyNet: number
  outlook: number[]
}

// ---------- Investice ----------

export interface ValuePoint { date: string; value: number; deposits: number }
export interface Position { ticker: string; name?: string; quantity: number; lastPrice: number; value: number; currency: string }
export interface Trade {
  id: number
  date: string
  side: 'Buy' | 'Sell'
  ticker: string
  name?: string
  quantity: number
  price: number
  currency: string
  total: number
  linkedTransactionId?: number
  linkedLabel?: string
}
export interface InvestmentAccountView {
  accountId: number
  value: number
  deposits: number
  gain: number
  gainPct?: number
  changeSinceLast?: number
  lastDate?: string
  prevDate?: string
  history: ValuePoint[]
  positions: Position[]
  cash: number
  trades: Trade[]
}
export interface NetWorth {
  months: string[]
  layers: { key: 'Current' | 'Savings' | 'Foreign' | 'Investment'; values: number[] }[]
  now: number
  monthAgo: number
  yearAgo: number
  rates: Record<string, number>
}
