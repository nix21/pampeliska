// Typy DTO z API (psané ručně podle backendu, výčty jako řetězce).

export type ThemeMode = 'Light' | 'Dark' | 'System'
export type PeriodKind = 'Month' | 'Quarter' | 'Year' | 'Custom'
export type NeedType = 'Inherit' | 'Need' | 'Joy' | 'None'
export type MemberRole = 'Owner' | 'Member'
export type MemberStatus = 'Invited' | 'Active'
export type AccountKind = 'Current' | 'Savings' | 'Investment'
export type AccountGroup = 'Current' | 'Savings' | 'Foreign' | 'Investment'
export type AccountSource = 'Mcp' | 'EnableBanking' | 'Manual'
export type InvestmentKind = 'Etf' | 'Pension' | 'Dip' | 'Crypto' | 'Other'
export type ValueTracking = 'Manual' | 'Positions' | 'Statement'
export type ConditionType = 'IncomingSum' | 'CardCount' | 'AvgBalance'
export type InstitutionKind = 'Bank' | 'Broker'
export type CategoryKind = 'Expense' | 'Income'
export type BudgetPeriod = 'None' | 'Monthly' | 'Yearly'
export type TransactionKind = 'Expense' | 'Income' | 'Transfer' | 'InvestmentTransfer' | 'Refund' | 'Correction'
export type TransactionStatus = 'Suggested' | 'Confirmed'
export type CategorySource = 'Rule' | 'Ai' | 'Manual' | 'Auto'
export type PaymentType = 'Other' | 'Card' | 'Transfer' | 'DirectDebit' | 'StandingOrder' | 'Cash' | 'Fee' | 'Interest'
export type BatchSource = 'Mcp' | 'Manual' | 'EnableBanking'
export type BatchState = 'Uploaded' | 'Categorized' | 'Confirmed'
export type ShareRecalcMode = 'NewOnly' | 'All' | 'FromDate'

export interface Me {
  email: string
  name?: string
  picture?: string
  memberId?: number
  memberName?: string
  color?: string
  role?: MemberRole
}

export interface HouseholdSettings {
  theme: ThemeMode
  defaultPeriod: PeriodKind
  confirmedOnlyDefault: boolean
  hideAmountsOnStart: boolean
  mainChart: 'Sunburst' | 'Treemap'
  fxMode: 'DayOfPayment' | 'MonthlyAverage'
  netWorthAltCurrency: string
  dedupWindowDays: number
  aiAutoConfirmThreshold: number
  suggestRules: boolean
  notifyLowBalance: boolean
  notifyConditions: boolean
  onboardingDone: boolean
}

export interface Member {
  id: number
  name: string
  email: string
  colorToken: string
  initials: string
  role: MemberRole
  status: MemberStatus
  lastLoginAt?: string
}

export interface Household {
  name: string
  baseCurrency: string
  settings: HouseholdSettings
  members: Member[]
  accountCount: number
  rates: Record<string, number>
  ratesDate?: string
  today: string
  lastBackup?: { startedAt: string; success: boolean; sizeBytes?: number; message?: string }
}

export interface Institution {
  key: string
  name: string
  abbrev: string
  color: string
  kind: InstitutionKind
}

export interface Share {
  memberId: number
  percent: number
}

export interface AccountCondition {
  id: number
  type: ConditionType
  target: number
  benefit?: string
}

export interface Account {
  id: number
  kind: AccountKind
  group: AccountGroup
  name: string
  institution: Institution
  iban?: string
  currency: string
  ownerMemberId?: number
  joint: boolean
  ratio: Share[]
  cardToHolder: boolean
  balance: number
  balanceCzk: number
  sparkline: number[]
  source: AccountSource
  lastImportAt?: string
  lowBalanceLimit?: number
  interestRate?: number
  investmentKind?: InvestmentKind
  fundingAccountId?: number
  valueTracking: ValueTracking
  includeInDisposable: boolean
  includeInNetWorth: boolean
  openingBalance: number
  openingDate: string
  openingDeposits?: number
  archived: boolean
  conditions: AccountCondition[]
  transactionCount: number
}

export interface CategoryTemplateNode {
  name: string
  need: NeedType
  color?: string
  children?: CategoryTemplateNode[]
}

export interface CategoryTemplate {
  key: string
  label: string
  note: string
  expense: CategoryTemplateNode[]
  income: CategoryTemplateNode[]
}

// ---------- Pohyby ----------

export interface SplitDto {
  categoryId: number
  /** Se znaménkem jako pohyb, v měně pohybu. */
  amount: number
  amountCzk: number
  needOverride?: NeedType
}

export interface TxRow {
  id: number
  date: string
  time?: string
  accountId: number
  /** Záporná = odchozí, v měně účtu. */
  amount: number
  currency: string
  amountCzk: number
  fxRate: number
  counterparty: string
  message?: string
  kind: TransactionKind
  status: TransactionStatus
  categoryId?: number
  needOverride?: NeedType
  splits: SplitDto[]
  shares: Share[]
  sharesOverridden: boolean
  isRecurring: boolean
  excludeFromStats: boolean
  categorySource?: CategorySource
  aiConfidence?: number
  transferPairId?: number
  transferPairAccountId?: number
  refundOfId?: number
  suspectedDuplicateOfId?: number
  batchId?: number
  paymentType: PaymentType
  recurringPaymentId?: number
  note?: string
}

export interface TxRef {
  id: number
  date: string
  accountId: number
  counterparty: string
  amount: number
  currency: string
  amountCzk: number
  rawText?: string
  batchId?: number
  batchSource?: string
}

export interface TxDetail {
  tx: TxRow
  rawText?: string
  counterpartyAccount?: string
  mcc?: string
  aiReason?: string
  aiAlternatives: { categoryId: number; confidence: number }[]
  appliedRule?: string
  events: { at: string; actor: string; text: string }[]
  transferPair?: TxRef
  refundOf?: TxRef
  suspectedDuplicateOf?: TxRef
  cnbRate?: number
  cardHolderMemberId?: number
  batchLabel?: string
}

export interface TxPage {
  items: TxRow[]
  total: number
}

export interface SplitInput {
  categoryId: number
  amount: number
  needOverride?: NeedType | null
}

/** PATCH /api/transactions/{id} – vynechané = beze změny. */
export interface TxUpdate {
  categoryId?: number | null
  setCategory?: boolean
  splits?: SplitInput[]
  needOverride?: NeedType | null
  setNeed?: boolean
  memberId?: number | null
  setMember?: boolean
  shares?: Share[]
  excludeFromStats?: boolean
  isRecurring?: boolean
  confirm?: boolean
  note?: string
  refundOfId?: number | null
  setRefundOf?: boolean
  createRule?: boolean
  applyRuleToHistory?: boolean
}
