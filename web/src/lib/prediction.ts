import { monthGenitive, monthLocative, monthNamesCap, monthShort, num } from './format'

// ---------- DTO z GET /api/prediction ----------

export interface ScenarioChange {
  id: string
  key: string
  /** „2026-11“ */
  from: string
  /** null = od měsíce dál, jinak jen do tohoto měsíce */
  to: string | null
  /** Kč/měsíc za domácnost, záporná = výdaj */
  amount: number
}

export interface ScenarioRecurring { id: string; name: string; amount: number; from: string; memberId?: number | null }
export interface ScenarioOneOff { id: string; month: string; name: string; amount: number; memberId?: number | null }

export interface Scenario {
  changes: ScenarioChange[]
  added: ScenarioRecurring[]
  oneOffs: ScenarioOneOff[]
  /** Vynechané očekávané jednorázové platby (klíče PredOneOff.key) */
  skips: string[]
}

export interface PredLeaf {
  note: string
  sign: number
  /** Podíl člena na částce domácnosti (1 za domácnost) */
  share: number
  /** Výchozí částka po měsících (aktuální měsíc = jen zbytek) */
  base: number[]
  /** Se scénářem */
  value: number[]
}

export interface PredNode {
  key: string
  name: string
  /** Token barvy (c1…, pos, accent, ink-3) */
  color: string
  children?: PredNode[] | null
  leaf?: PredLeaf | null
}

export interface PredMonth {
  month: string
  income: number
  expense: number
  balance: number
  baseIncome: number
  baseExpense: number
  baseBalance: number
  sigma: number
}

export interface PredOneOff {
  key: string
  month: string
  name: string
  amount: number
  source: string
  kind: 'recurring' | 'expected' | 'scenario'
  skipped: boolean
  topKey: string
}

export interface PlanMonth {
  month: string
  income: number
  expense: number
  balance: number
  cats: Record<string, number>
  ones: { name: string; amount: number }[]
}

export interface Snapshot {
  id: number
  name: string
  savedOn: string
  horizon: number
  createdBy: string
  plan?: { start: number; months: PlanMonth[] } | null
}

export interface Prediction {
  today: string
  horizon: number
  memberId?: number | null
  start: number
  reserve: number
  dataMonths: number
  months: PredMonth[]
  tree: PredNode[]
  oneOffs: PredOneOff[]
  scenario: Scenario
  historyStart: number
  /** Uzavřené měsíce skutečnosti, nejstarší první (12) */
  history: PlanMonth[]
  groups: { key: string; name: string; color: string }[]
  snapshots: Snapshot[]
}

// ---------- Měsíce ----------

/** Měsíc „2026-10“ posunutý o delta. */
export function addMonths(ym: string, delta: number) {
  const [y, m] = ym.split('-').map(Number)
  const d = new Date(y, m - 1 + delta, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export function monthDiff(from: string, to: string) {
  const [fy, fm] = from.split('-').map(Number)
  const [ty, tm] = to.split('-').map(Number)
  return (ty - fy) * 12 + tm - fm
}

/** Popisky měsíce: říj, Říjen 2026, října 2026, v říjnu 2026. */
export function monthInfo(ym: string) {
  const [y, m] = ym.split('-').map(Number)
  const k = m - 1
  return {
    y,
    short: monthShort[k],
    full: `${monthNamesCap[k]} ${y}`,
    gen: `${monthGenitive[k]} ${y}`,
    genShort: monthGenitive[k],
    loc: `v ${monthLocative[k]} ${y}`,
    jan: k === 0,
  }
}

// ---------- Strom a scénář ----------

export interface LeafInfo {
  key: string
  name: string
  path: string
  color: string
  leaf: PredLeaf
}

/** Všechny listy stromu (klíč → název, cesta, barva). */
export function leafIndex(tree: PredNode[]) {
  const map = new Map<string, LeafInfo>()
  const walk = (n: PredNode, path: string) => {
    const p = path ? `${path} › ${n.name}` : n.name
    if (n.leaf) map.set(n.key, { key: n.key, name: n.name, path: p, color: n.color, leaf: n.leaf })
    n.children?.forEach((c) => walk(c, p))
  }
  tree.forEach((n) => walk(n, ''))
  return map
}

export const emptyScenario = (): Scenario => ({ changes: [], added: [], oneOffs: [], skips: [] })

export const newId = () => Math.random().toString(36).slice(2, 12)

export const colorVar = (token: string) => `var(--${token})`

/** „42 tis.“ pro popisky grafu a sloupců. */
export const kts = (v: number, hidden: boolean) => (hidden ? '•••' : `${v < 0 ? '−' : ''}${num(Math.round(Math.abs(v) / 1000))} tis.`)

/** Zůstatek na konci měsíce i (i < 0 = skutečnost z historie). */
export function balanceAt(data: Prediction, i: number) {
  if (i >= 0) return data.months[i].balance
  const h = data.history
  return h[h.length + i]?.balance ?? data.historyStart
}

/** Měsíce uložené predikce, pro které už známe skutečnost. */
export function evaluated(data: Prediction, snap: Snapshot) {
  const hist = new Map(data.history.map((h) => [h.month, h]))
  return (snap.plan?.months ?? []).filter((pm) => hist.has(pm.month)).map((pm) => ({ plan: pm, act: hist.get(pm.month)! }))
}
