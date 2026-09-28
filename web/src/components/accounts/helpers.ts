import { currencySymbol, num, relative } from '../../lib/format'
import type { Account, Member } from '../../lib/types'

export const sym = (cur: string) => currencySymbol[cur] ?? cur

/** „Vašek a Míša“, „A, B a C“. */
export function joinNames(names: string[]) {
  if (names.length <= 1) return names[0] ?? ''
  return `${names.slice(0, -1).join(', ')} a ${names[names.length - 1]}`
}

/** Členové, kterým účet patří (vlastník, nebo členové s podílem na společném účtu). */
export function accountMembers(a: Account, members: Map<number, Member>): Member[] {
  if (!a.joint) {
    const m = a.ownerMemberId != null ? members.get(a.ownerMemberId) : undefined
    return m ? [m] : []
  }
  const ids = a.ratio.length ? a.ratio.filter((r) => r.percent > 0).map((r) => r.memberId) : [...members.keys()]
  return ids.map((id) => members.get(id)).filter((m): m is Member => !!m)
}

export function belongsTo(a: Account, memberId: number) {
  if (!a.joint) return a.ownerMemberId === memberId
  return a.ratio.length === 0 || a.ratio.some((r) => r.memberId === memberId && r.percent > 0)
}

export function ownerText(a: Account, members: Map<number, Member>) {
  const ms = accountMembers(a, members)
  if (a.joint) return ms.length ? `společný · ${joinNames(ms.map((m) => m.name))}` : 'společný'
  return ms[0]?.name ?? 'bez vlastníka'
}

/** „70 : 30“ */
export function ratioText(ratio: { memberId: number; percent: number }[]) {
  return ratio.map((r) => num(r.percent, Number.isInteger(r.percent) ? 0 : 1)).join(' : ')
}

/** Řádek pod názvem účtu v seznamu: odkud a kdy přišly pohyby. */
export function syncText(a: Account) {
  if (a.kind === 'Investment') return a.valueTracking === 'Manual' ? 'Ruční zadání hodnoty' : a.valueTracking === 'Positions' ? 'Pozice a obchody' : 'Výpis od brokera'
  if (a.source === 'Mcp') return a.lastImportAt ? `MCP · ${relative(a.lastImportAt)}` : 'MCP · čeká na první import'
  if (a.source === 'EnableBanking') return a.lastImportAt ? `Enable Banking · ${relative(a.lastImportAt)}` : 'Enable Banking'
  return a.lastImportAt ? `Ručně · ${relative(a.lastImportAt)}` : 'Ruční zadávání'
}

export function sourceLabel(a: Account) {
  if (a.kind === 'Investment') return a.valueTracking === 'Manual' ? 'Ruční zadání hodnoty' : a.valueTracking === 'Positions' ? 'Pozice a obchody' : 'Import výpisu od brokera'
  return a.source === 'Mcp' ? 'Přes MCP a Clauda' : a.source === 'EnableBanking' ? 'Enable Banking' : 'Ruční zadávání'
}

export function memberRule(a: Account) {
  if (!a.joint) return 'podle vlastníka účtu'
  const r = a.ratio.length ? ratioText(a.ratio) : 'rovným dílem'
  return a.cardToHolder ? `karta → držitel · jinak ${r}` : `poměr ${r}`
}

/** Krátký název banky do štítku („ČS“, „Air Bank“). */
export const shortBank = (a: Account) => (a.institution.name.length > 12 ? a.institution.abbrev : a.institution.name)
