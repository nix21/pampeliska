import type { ChartNode } from '../charts'
import { mix, needVar, ringShade, tileShade, tokenVar, type CatAgg } from '../../lib/stats'

export type ColorMode = 'cat' | 'need'

/**
 * Podkategorie pro graf; hlavní kategorie bez podkategorií dostane jednu „vlastní“ dlaždici. Záporné podkategorie (u člena
 * třeba vyrovnání dovolené od druhého člena) v grafu nejsou a zbylé se poměrně vejdou do součtu hlavní kategorie.
 */
const kids = (t: CatAgg): CatAgg[] => {
  const list = (t.children.length ? t.children : [{ ...t, children: [], synthetic: true }]).filter((c) => c.amount > 0)
  const sum = list.reduce((a, c) => a + c.amount, 0)
  return sum > t.amount && sum > 0 ? list.map((c) => ({ ...c, amount: (c.amount * t.amount) / sum })) : list
}

/** Barva podkategorie v legendě / prstenci. */
export const childColor = (top: CatAgg, child: CatAgg, i: number, mode: ColorMode) => (mode === 'need' ? needVar(child.need) : ringShade(top.token, i))
export const topColor = (top: CatAgg, mode: ColorMode) => (mode === 'need' ? mix(top.token, 45) : tokenVar(top.token))

export function ringNodes(tops: CatAgg[], mode: ColorMode): ChartNode[] {
  return tops.map((t) => ({
    id: t.id,
    label: t.name,
    value: t.amount,
    color: topColor(t, mode),
    children: kids(t).map((c, i) => ({ id: c.id, label: c.name, value: c.amount, color: childColor(t, c, i, mode), disabled: !!c.synthetic })),
  }))
}

const tileFill = (t: CatAgg, c: CatAgg, i: number, mode: ColorMode) =>
  mode === 'need' ? `color-mix(in oklch, ${needVar(c.need)} 58%, var(--surface))` : tileShade(t.token, i)

/** Treemap: skupiny = hlavní kategorie, dlaždice = podkategorie. */
export function tileNodes(tops: CatAgg[], mode: ColorMode): ChartNode[] {
  return tops.map((t) => ({
    id: t.id,
    label: t.name,
    value: t.amount,
    color: tokenVar(t.token),
    children: kids(t).map((c, i) => ({ id: c.id, label: c.name, value: c.amount, color: tileFill(t, c, i, mode), disabled: !!c.synthetic })),
  }))
}

/** Treemap rozpadu jedné kategorie (ploché dlaždice). */
export function drilledTiles(top: CatAgg, mode: ColorMode): ChartNode[] {
  return kids(top).map((c, i) => ({ id: c.id, label: c.name, value: c.amount, color: tileFill(top, c, i, mode), disabled: !!c.synthetic }))
}

/** „+12 %“ / „−4 %“ (typografické minus); null = není s čím porovnat. */
export function formatDelta(d: number | null) {
  if (d == null || !Number.isFinite(d)) return '—'
  const r = Math.round(d)
  return `${r > 0 ? '+' : r < 0 ? '−' : '±'}${Math.abs(r)} %`
}

/** Barva změny výdajů: víc = červeně, míň = zeleně, do ±5 % neutrálně. */
export const expenseDeltaColor = (d: number | null) => (d == null ? 'var(--ink-3)' : d > 5 ? 'var(--neg)' : d < -5 ? 'var(--pos)' : 'var(--ink-3)')

/** Barva změny příjmů: víc = zeleně, míň = červeně, do ±5 % neutrálně. */
export const incomeDeltaColor = (d: number | null) => (d == null ? 'var(--ink-3)' : d > 5 ? 'var(--pos)' : d < -5 ? 'var(--neg)' : 'var(--ink-3)')
