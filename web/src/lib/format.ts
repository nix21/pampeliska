const nf = new Map<number, Intl.NumberFormat>()
function numberFormat(decimals: number) {
  let f = nf.get(decimals)
  if (!f) {
    f = new Intl.NumberFormat('cs-CZ', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
    nf.set(decimals, f)
  }
  return f
}

export const currencySymbol: Record<string, string> = { CZK: 'Kč', EUR: '€', USD: '$' }

/** Číslo v cs-CZ formátu (mezery po tisících). */
export const num = (v: number, decimals = 0) => numberFormat(decimals).format(v)

export interface MoneyOptions {
  currency?: string
  /** Zobrazit + u kladných. */
  sign?: boolean
  decimals?: number
  hidden?: boolean
}

/** „12 345 Kč“, „−128,00 €“; skryté částky jako „••••• Kč“. Minus je typografický (U+2212). */
export function money(v: number | null | undefined, opts: MoneyOptions = {}) {
  const cur = opts.currency ?? 'CZK'
  const sym = currencySymbol[cur] ?? cur
  if (v == null) return '—'
  if (opts.hidden) return `••••• ${sym}`
  const d = opts.decimals ?? (cur === 'CZK' ? 0 : 2)
  const rounded = Math.abs(v) < 10 ** -d / 2 ? 0 : v
  const prefix = rounded < 0 ? '−' : opts.sign && rounded > 0 ? '+' : ''
  return `${prefix}${numberFormat(d).format(Math.abs(rounded))} ${sym}`
}

/** Krátký zápis pro grafy: „12 tis.“, „1,2 mil.“. */
export function short(v: number) {
  const a = Math.abs(v)
  const s = v < 0 ? '−' : ''
  if (a >= 1_000_000) return `${s}${num(a / 1_000_000, a >= 10_000_000 ? 0 : 1)} mil.`
  if (a >= 1000) return `${s}${num(a / 1000, a >= 10_000 ? 0 : 1)} tis.`
  return `${s}${num(a)}`
}

export const pct = (v: number, decimals = 0) => `${num(v, decimals)} %`

/** Česká množná čísla: plural(3, 'platba', 'platby', 'plateb'). */
export function plural(n: number, one: string, few: string, many: string) {
  const a = Math.abs(n)
  return a === 1 ? one : a >= 2 && a <= 4 ? few : many
}
export const count = (n: number, one: string, few: string, many: string) => `${num(n)} ${plural(n, one, few, many)}`

export const monthNames = ['leden', 'únor', 'březen', 'duben', 'květen', 'červen', 'červenec', 'srpen', 'září', 'říjen', 'listopad', 'prosinec']
export const monthNamesCap = monthNames.map((m) => m[0].toUpperCase() + m.slice(1))
export const monthShort = ['led', 'úno', 'bře', 'dub', 'kvě', 'čvn', 'čvc', 'srp', 'zář', 'říj', 'lis', 'pro']
/** 2. pád / lokál: „v září“, „za září“. */
export const monthLocative = ['lednu', 'únoru', 'březnu', 'dubnu', 'květnu', 'červnu', 'červenci', 'srpnu', 'září', 'říjnu', 'listopadu', 'prosinci']
/** 2. pád: „od září“, „od ledna“. */
export const monthGenitive = ['ledna', 'února', 'března', 'dubna', 'května', 'června', 'července', 'srpna', 'září', 'října', 'listopadu', 'prosince']
export const weekdays = ['Neděle', 'Pondělí', 'Úterý', 'Středa', 'Čtvrtek', 'Pátek', 'Sobota']
export const weekdaysShort = ['Ne', 'Po', 'Út', 'St', 'Čt', 'Pá', 'So']

/** ISO „2026-09-28“ → Date (lokální půlnoc). */
export function parseIso(iso: string) {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number)
  return new Date(y, m - 1, d)
}
export function toIso(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
export const todayIso = () => toIso(new Date())
export function addDays(iso: string, days: number) {
  const d = parseIso(iso)
  d.setDate(d.getDate() + days)
  return toIso(d)
}

/** „28. 9.“ nebo s rokem „28. 9. 2026“. */
export function dateShort(iso?: string | null, withYear = false) {
  if (!iso) return '—'
  const d = parseIso(iso)
  return `${d.getDate()}. ${d.getMonth() + 1}.${withYear ? ` ${d.getFullYear()}` : ''}`
}
export const dateLong = (iso?: string | null) => dateShort(iso, true)
/** „Neděle 27. 9.“ */
export const dayHeading = (iso: string) => `${weekdays[parseIso(iso).getDay()]} ${dateShort(iso)}`

/** Relativní čas „dnes 6:12“, „včera 21:40“, „14. 9.“. */
export function relative(ts?: string | null) {
  if (!ts) return '—'
  const d = new Date(ts)
  const today = new Date()
  const time = `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`
  const days = Math.round((new Date(today.toDateString()).getTime() - new Date(d.toDateString()).getTime()) / 86_400_000)
  if (days === 0) return `dnes ${time}`
  if (days === 1) return `včera ${time}`
  if (days > 60) return `před ${count(Math.round(days / 30), 'měsícem', 'měsíci', 'měsíci').replace('1 měsícem', 'měsícem')}`
  return `${d.getDate()}. ${d.getMonth() + 1}.${d.getFullYear() !== today.getFullYear() ? ` ${d.getFullYear()}` : ''}`
}

/** Parser vstupu částky: „1 234,50“, „-12,3“, „1234.5“. */
export function parseAmount(s: string): number | null {
  const clean = s.replace(/[\s ]/g, '').replace('−', '-').replace(/Kč|€|\$/g, '').replace(',', '.')
  if (clean === '' || clean === '-') return null
  const v = Number(clean)
  return Number.isFinite(v) ? v : null
}

/** Parser data: „23. 9. 2026“, „23.09.2026“, „2026-09-23“. */
export function parseDateInput(value: string): string | null {
  const s = value.replace(/\s+/g, '')
  let y: number, m: number, d: number
  let match = s.match(/^(\d{4})[-./](\d{1,2})[-./](\d{1,2})$/)
  if (match) [y, m, d] = [+match[1], +match[2], +match[3]]
  else if ((match = s.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4}|\d{2})$/))) {
    ;[d, m, y] = [+match[1], +match[2], +match[3]]
    if (match[3].length === 2) y += 2000
  } else return null
  const parsed = new Date(y, m - 1, d)
  return parsed.getFullYear() === y && parsed.getMonth() === m - 1 && parsed.getDate() === d ? toIso(parsed) : null
}

export const initials = (name: string) => (name || '?').slice(0, 2).toUpperCase()
