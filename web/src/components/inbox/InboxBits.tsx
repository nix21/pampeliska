import clsx from 'clsx'
import { Check, Copy, HelpCircle, Search, Sparkles, Wand2, Zap } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useAccounts } from '../../lib/accounts'
import { useCategories } from '../../lib/categories'
import { dateShort } from '../../lib/format'
import { normalizeText, UNSURE_BELOW, type Effective, type InboxItem } from '../../lib/inbox'
import type { CategoryKind } from '../../lib/types'
import { Money } from '../common'
import { Button } from '../ui'
import s from './inbox.module.css'

/** Odkud je návrh: Ručně / Pravidlo / Bez návrhu / AI · jistota. */
export function SourcePill({ item, eff, short }: { item: InboxItem; eff: Effective; short?: boolean }) {
  const tx = item.tx
  if (eff.manual) return <span className={clsx(s.srcPill, s.srcManual)}><Check size={11} strokeWidth={3} /> Ručně</span>
  if (eff.noSuggestion) return <span className={clsx(s.srcPill, s.srcNone)}><HelpCircle size={11} /> Bez návrhu</span>
  if (tx.categorySource === 'Rule') return <span className={clsx(s.srcPill, s.srcRule)} title={item.rule}><Wand2 size={11} /> Pravidlo</span>
  if (tx.categorySource === 'Ai') {
    const c = tx.aiConfidence ?? 0
    return (
      <span className={clsx(s.srcPill, c < UNSURE_BELOW ? s.srcAiLow : s.srcAiHigh)}>
        <Sparkles size={11} /> {short ? `AI ${c} %` : `AI · jistota ${c} %`}
      </span>
    )
  }
  return <span className={clsx(s.srcPill, s.srcAuto)}><Zap size={11} /> Automaticky</span>
}

export function ConfidenceBar({ value }: { value: number }) {
  return (
    <span className={s.confBar} aria-hidden>
      <span style={{ width: `${Math.max(0, Math.min(100, value))}%`, background: value < UNSURE_BELOW ? 'var(--warn)' : 'var(--pos)' }} />
    </span>
  )
}

/** Barevný proužek rozdělení (poměr částí). */
export function SplitStrip({ parts, width = 34 }: { parts: { categoryId: number | null; amount: number }[]; width?: number }) {
  const { colorOf } = useCategories()
  return (
    <span className={s.splitBar} style={{ width }}>
      {parts.map((p, i) => <span key={i} style={{ flex: p.amount, background: colorOf(p.categoryId) }} />)}
    </span>
  )
}

/** Sloupec „Návrh zařazení · jistota AI“. */
export function SuggestionCell({ item, eff, compact }: { item: InboxItem; eff: Effective; compact?: boolean }) {
  const { byId, colorOf } = useCategories()
  const abs = Math.abs(item.tx.amount) || 1
  const c = eff.categoryId != null ? byId.get(eff.categoryId) : undefined
  const parent = c?.parentId ? byId.get(c.parentId) : undefined
  const label = eff.isSplit
    ? eff.splits.map((p) => `${p.categoryId != null ? byId.get(p.categoryId)?.name ?? '?' : '…'} ${Math.round((p.amount / abs) * 100)} %`).join(' · ')
    : c ? (parent ? `${parent.name} › ${c.name}` : c.name) : 'Vyber kategorii'
  const showConf = item.tx.categorySource === 'Ai' && !eff.manual && !eff.isSplit && item.tx.aiConfidence != null
  const line = (
    <span className={s.suggLine}>
      {eff.isSplit ? <SplitStrip parts={eff.splits} width={compact ? 28 : 34} /> : <span className={s.dot} style={{ background: colorOf(eff.categoryId) }} />}
      <span className={s.suggLabel} style={{ color: c || eff.isSplit ? 'var(--ink)' : 'var(--ink-3)' }} title={label}>{label}</span>
      {compact && <SourcePill item={item} eff={eff} short />}
    </span>
  )
  if (compact) return line
  return (
    <div className={s.sugg}>
      {line}
      <span className="row" style={{ gap: 6 }}>
        <SourcePill item={item} eff={eff} />
        {showConf && <ConfidenceBar value={item.tx.aiConfidence ?? 0} />}
      </span>
    </div>
  )
}

export function DupPill() {
  return <span className={s.dupPill}><Copy size={11} /> Možná duplicita</span>
}

const batchSrc = (src?: string) => (src === 'Mcp' ? 'MCP' : src === 'Manual' ? 'ruční' : src === 'EnableBanking' ? 'banka' : 'import')

/** Podezřelá duplicita: obě platby vedle sebe + Zahodit / Ponechat obě. */
export function DuplicateBlock({ item, onResolve, busy }: { item: InboxItem; onResolve: (keep: boolean) => void; busy?: boolean }) {
  const { byId } = useAccounts()
  const dup = item.duplicateOf
  const tx = item.tx
  const card = (title: string, date: string, amount: number, currency: string, text?: string, account?: number) => (
    <div className={s.dupCard}>
      <span className="faint">{title}</span>
      <span style={{ fontWeight: 700 }}>{dateShort(date)} · <Money value={amount} currency={currency} /></span>
      <span className="faint">{text}</span>
      {account != null && <span className="faint">{byId.get(account)?.name}</span>}
    </div>
  )
  return (
    <div className={s.dup}>
      <span className={s.dupTitle}><Copy size={13} /> Podezřelá duplicita</span>
      <div className={s.dupCards}>
        {card(`Tato platba${tx.batchId ? ` · dávka ${tx.batchId}` : ''}`, tx.date, tx.amount, tx.currency, item.rawText ?? tx.counterparty, tx.accountId)}
        {dup
          ? card(`Existující · ${batchSrc(dup.batchSource)}${dup.batchId ? ` (dávka ${dup.batchId})` : ''}`, dup.date, dup.amount, dup.currency, dup.rawText ?? dup.counterparty, dup.accountId)
          : <div className={s.dupCard}><span className="faint">Existující platba už není dostupná.</span></div>}
      </div>
      <div className="row wrap">
        <Button variant="dark" size="sm" disabled={busy} onClick={() => onResolve(false)}>Zahodit duplicitu</Button>
        <Button size="sm" disabled={busy} onClick={() => onResolve(true)}>Ponechat obě</Button>
      </div>
    </div>
  )
}

/** Vyhledávání ve stromu kategorií s výsledky pod polem (panel detailu). */
export function CategorySearch({ kind, onSelect }: { kind?: CategoryKind; onSelect: (id: number) => void }) {
  const { list, byId } = useCategories()
  const [q, setQ] = useState('')
  const results = useMemo(() => {
    const n = normalizeText(q)
    if (!n) return []
    return list.filter((c) => (!kind || c.kind === kind) && normalizeText(c.path).includes(n)).slice(0, 6)
  }, [list, q, kind])
  return (
    <div className={s.search}>
      <label className={s.searchInput}>
        <Search size={16} />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Hledat ve stromu kategorií" aria-label="Hledat kategorii"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && results[0]) {
              onSelect(results[0].id)
              setQ('')
            }
          }} />
      </label>
      {results.map((c) => {
        const parent = c.parentId ? byId.get(c.parentId) : undefined
        return (
          <button key={c.id} type="button" className={s.searchRow} onClick={() => (onSelect(c.id), setQ(''))}>
            <span className={s.dot} style={{ background: `var(--${c.color})` }} />
            {parent && <span className="faint">{parent.name} ›</span>}
            <span style={{ fontWeight: 600 }}>{c.name}</span>
          </button>
        )
      })}
      {q && results.length === 0 && <span className="faint" style={{ fontSize: 13, padding: '8px 12px', borderTop: '1px solid var(--line)' }}>Nic nenalezeno</span>}
    </div>
  )
}
