import { useQueryClient } from '@tanstack/react-query'
import clsx from 'clsx'
import { Check, ChevronDown, Copy, HelpCircle, Search, Sparkles, Split, X, type LucideIcon } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { PageHeader } from '../components/AppShell'
import { CategoryList } from '../components/category'
import { MemberSwitch, Money } from '../components/common'
import { ImportHelpButton } from '../components/ImportHelp'
import { DupPill, SuggestionCell } from '../components/inbox/InboxBits'
import { InboxDetail } from '../components/inbox/InboxDetail'
import { Logo } from '../components/Logo'
import { Button, Checkbox, Empty, Popover, Spinner } from '../components/ui'
import { useAccounts } from '../lib/accounts'
import { api, notifyError, notifyOk } from '../lib/api'
import { count, dateShort, num, plural } from '../lib/format'
import {
  buildPatch, CONFIDENT_MIN, effective, invalidateInbox, sharedShares, useInbox, useIsMobile, type InboxCounts, type InboxDraft, type InboxFilter,
  type InboxItem,
} from '../lib/inbox'
import type { NeedType, TxRow } from '../lib/types'
import { useMembers, useUi } from '../state/ui'
import s from './InboxPage.module.css'

const FILTERS: { value: InboxFilter; label: string; icon?: LucideIcon; key: keyof InboxCounts }[] = [
  { value: 'All', label: 'Vše', key: 'all' },
  { value: 'AiUnsure', label: 'AI si není jistá', icon: Sparkles, key: 'aiUnsure' },
  { value: 'NoSuggestion', label: 'Bez návrhu', icon: HelpCircle, key: 'noSuggestion' },
  { value: 'SplitSuggestion', label: 'Návrh rozdělení', icon: Split, key: 'splitSuggestion' },
  { value: 'Duplicates', label: 'Podezřelé duplicity', icon: Copy, key: 'duplicates' },
]
const FILTER_VALUES = new Set<string>(FILTERS.map((f) => f.value))

function useDebounced<T>(value: T, ms: number) {
  const [v, setV] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return v
}

const checkedLabel = (n: number) => `${num(n)} ${plural(n, 'vybraná', 'vybrané', 'vybraných')}`

export default function InboxPage() {
  const qc = useQueryClient()
  const isMobile = useIsMobile()
  const { filterParams, household } = useUi()
  const membersById = useMembers()
  const accounts = useAccounts()
  const [params, setParams] = useSearchParams()
  const rawFilter = params.get('filter') ?? 'All'
  const filter: InboxFilter = FILTER_VALUES.has(rawFilter) ? (rawFilter as InboxFilter) : 'All'
  const [searchText, setSearchText] = useState('')
  const search = useDebounced(searchText.trim(), 250)
  const q = useInbox(filter, filterParams.member, search)

  const [gone, setGone] = useState<Set<number>>(() => new Set())
  const [selectedId, setSelectedId] = useState<number | null>(() => Number(params.get('tx')) || null)
  const [checked, setChecked] = useState<Set<number>>(() => new Set())
  const [drafts, setDrafts] = useState<Record<number, InboxDraft>>({})
  const [busy, setBusy] = useState<number | 'bulk' | 'confident' | null>(null)
  const [bulkPick, setBulkPick] = useState(false)

  const items = useMemo(() => (q.data?.items ?? []).filter((i) => !gone.has(i.tx.id)), [q.data, gone])
  const counts = q.data?.counts
  const selected = items.find((i) => i.tx.id === selectedId) ?? (isMobile ? undefined : items[0])
  const checkedIds = items.filter((i) => checked.has(i.tx.id)).map((i) => i.tx.id)

  const setFilter = (f: InboxFilter) => {
    const p = new URLSearchParams(params)
    if (f === 'All') p.delete('filter')
    else p.set('filter', f)
    p.delete('tx')
    setParams(p, { replace: true })
    setChecked(new Set())
  }

  const setDraft = (id: number, d: InboxDraft) => setDrafts((x) => ({ ...x, [id]: d }))
  const dropDrafts = (ids: number[]) => setDrafts((x) => {
    const n = { ...x }
    ids.forEach((id) => delete n[id])
    return n
  })
  const hide = (ids: number[]) => setGone((g) => new Set([...g, ...ids]))
  const nextAfter = (id: number) => {
    const idx = items.findIndex((i) => i.tx.id === id)
    const rest = items.filter((i) => i.tx.id !== id)
    return rest.length ? rest[Math.min(Math.max(idx, 0), rest.length - 1)].tx.id : null
  }
  const refresh = () => invalidateInbox(qc)

  const accountLabel = (tx: TxRow) => {
    const a = accounts.byId.get(tx.accountId)
    return a ? `${a.name} · ${a.institution.abbrev}` : ''
  }
  const memberLabel = (m: number | 'shared' | null) => (m === 'shared' ? 'společná' : m != null ? membersById.get(m)?.name ?? '' : '')

  // ---------- Akce ----------

  const confirmItem = async (item: InboxItem) => {
    const id = item.tx.id
    const draft = drafts[id]
    const eff = effective(item, draft)
    if (!eff.canConfirm) return
    setBusy(id)
    try {
      if (eff.hasChanges || eff.ruleOn) {
        const acc = accounts.byId.get(item.tx.accountId)
        await api.patch(`/api/transactions/${id}`, buildPatch(item, draft, eff, () => sharedShares(acc, household.members.map((m) => m.id))))
      } else {
        await api.post('/api/transactions/confirm', { ids: [id] })
      }
      if (eff.ruleOn) notifyOk('Potvrzeno · pravidlo vytvořeno a použito i na starší platby')
      const next = nextAfter(id)
      if (item.tx.suspectedDuplicateOfId == null) hide([id])
      dropDrafts([id])
      if (selected?.tx.id === id) setSelectedId(next)
      await refresh()
    } catch (e) {
      notifyError(e)
    } finally {
      setBusy(null)
    }
  }

  const toggleExclude = async (item: InboxItem) => {
    try {
      await api.patch(`/api/transactions/${item.tx.id}`, { excludeFromStats: !item.tx.excludeFromStats })
      notifyOk(item.tx.excludeFromStats ? 'Platba se znovu započítává' : 'Platba se nebude započítávat do statistik')
      await refresh()
    } catch (e) {
      notifyError(e)
    }
  }

  const resolveDuplicate = async (item: InboxItem, keep: boolean) => {
    const id = item.tx.id
    setBusy(id)
    try {
      await api.post(`/api/transactions/${id}/duplicate`, { keep })
      notifyOk(keep ? 'Ponechány obě platby' : 'Duplicita zahozena')
      if (!keep) {
        const next = nextAfter(id)
        hide([id])
        dropDrafts([id])
        if (selected?.tx.id === id) setSelectedId(next)
      }
      await refresh()
    } catch (e) {
      notifyError(e)
    } finally {
      setBusy(null)
    }
  }

  const skip = (item: InboxItem) => {
    const idx = items.findIndex((i) => i.tx.id === item.tx.id)
    setSelectedId(items[(idx + 1) % items.length]?.tx.id ?? null)
  }

  const bulk = async (body: { categoryId?: number; need?: NeedType }, msg: string) => {
    if (!checkedIds.length) return
    setBusy('bulk')
    try {
      await api.post('/api/transactions/bulk', { ids: checkedIds, categoryId: body.categoryId ?? null, need: body.need ?? null, confirm: false })
      dropDrafts(checkedIds)
      notifyOk(msg)
      await refresh()
    } catch (e) {
      notifyError(e)
    } finally {
      setBusy(null)
    }
  }

  const confirmChecked = async () => {
    if (!checkedIds.length) return
    setBusy('bulk')
    try {
      const withChanges = items.filter((i) => checked.has(i.tx.id) && effective(i, drafts[i.tx.id]).hasChanges)
      let n = 0
      for (const i of withChanges) {
        const eff = effective(i, drafts[i.tx.id])
        if (!eff.canConfirm) continue
        const acc = accounts.byId.get(i.tx.accountId)
        await api.patch(`/api/transactions/${i.tx.id}`, buildPatch(i, drafts[i.tx.id], eff, () => sharedShares(acc, household.members.map((m) => m.id))))
        n++
      }
      const rest = checkedIds.filter((id) => !withChanges.some((i) => i.tx.id === id))
      if (rest.length) n += (await api.post<{ confirmed: number }>('/api/transactions/confirm', { ids: rest })).confirmed
      const skipped = checkedIds.length - n
      notifyOk(`Potvrzeno ${count(n, 'platba', 'platby', 'plateb')}${skipped > 0 ? ` · ${skipped} bez kategorie zůstává` : ''}`)
      dropDrafts(checkedIds)
      setChecked(new Set())
      await refresh()
    } catch (e) {
      notifyError(e)
      await refresh()
    } finally {
      setBusy(null)
    }
  }

  const confirmConfident = async () => {
    setBusy('confident')
    try {
      const r = await api.post<{ confirmed: number }>('/api/inbox/confirm-confident', { minConfidence: CONFIDENT_MIN })
      notifyOk(r.confirmed ? `Potvrzeno ${count(r.confirmed, 'platba', 'platby', 'plateb')} s jistotou nad ${CONFIDENT_MIN} %` : `Žádná platba nemá jistotu nad ${CONFIDENT_MIN} %`)
      await refresh()
    } catch (e) {
      notifyError(e)
    } finally {
      setBusy(null)
    }
  }

  const toggleCheck = (id: number, on: boolean) => setChecked((c) => {
    const n = new Set(c)
    if (on) n.add(id)
    else n.delete(id)
    return n
  })
  const allOn = items.length > 0 && items.every((i) => checked.has(i.tx.id))
  const someOn = checkedIds.length > 0

  // ---------- Vykreslení ----------

  const subtitle = counts
    ? `${num(counts.all)} ${plural(counts.all, 'platba čeká', 'platby čekají', 'plateb čeká')} na zařazení · ${counts.aiUnsure}× AI si není jistá · ${count(counts.duplicates, 'podezřelá duplicita', 'podezřelé duplicity', 'podezřelých duplicit')}`
    : undefined

  const tools = (
    <div className={s.tools}>
      <MemberSwitch full={isMobile} />
      {household.members.length > 1 && <span className={s.divider} />}
      <div className={s.filters} role="radiogroup" aria-label="Filtr">
        {FILTERS.map((f) => (
          <button key={f.value} type="button" role="radio" aria-checked={filter === f.value}
            className={clsx(s.filter, filter === f.value && s.filterOn)} onClick={() => setFilter(f.value)}>
            {f.icon && !isMobile && <f.icon size={14} />}
            {f.label}
            <span className={s.filterCount}>{counts ? counts[f.key] : ''}</span>
          </button>
        ))}
      </div>
      <label className={s.search}>
        <Search size={16} />
        <input value={searchText} onChange={(e) => setSearchText(e.target.value)} placeholder="Hledat obchodníka, částku…" aria-label="Hledat" />
        {searchText && <button type="button" aria-label="Vymazat" onClick={() => setSearchText('')}><X size={14} /></button>}
      </label>
    </div>
  )

  const filtered = filter !== 'All' || !!search
  const empty = !q.isLoading && items.length === 0 && (
    q.isError ? (
      <Empty title="Frontu se nepodařilo načíst">{q.error instanceof Error ? q.error.message : ''}</Empty>
    ) : filtered ? (
      <Empty title="Nic tu není">{search ? `Hledání „${search}“ nic nenašlo.` : 'V tomto filtru teď nejsou žádné platby.'}</Empty>
    ) : (
      <div className={s.empty}>
        <span style={{ display: 'flex', color: 'var(--accent)' }}><Logo size={56} /></span>
        <span className={s.emptyTitle}>Vše zařazeno</span>
        <span className="muted" style={{ fontSize: 14, maxWidth: 360 }}>Nové platby se objeví, až Claude přes MCP nahraje další výpis.</span>
        <ImportHelpButton variant="secondary" size="sm">Jak nahrát výpis</ImportHelpButton>
      </div>
    )
  )

  const bulkCategory = (
    <Popover open={bulkPick} onOpenChange={setBulkPick} width={360} trigger={
      <button type="button" className={s.bulkBtn} disabled={busy === 'bulk'}>Zařadit do… <ChevronDown size={14} /></button>
    }>
      <CategoryList onSelect={(c) => {
        setBulkPick(false)
        bulk({ categoryId: c.id }, `Zařazeno do ${c.name}: ${count(checkedIds.length, 'platba', 'platby', 'plateb')}`)
      }} />
    </Popover>
  )

  const detailFor = (item: InboxItem, inline: boolean) => {
    const idx = items.findIndex((i) => i.tx.id === item.tx.id)
    return (
      <InboxDetail
        key={item.tx.id}
        item={item}
        inline={inline}
        draft={drafts[item.tx.id]}
        setDraft={(d) => setDraft(item.tx.id, d)}
        busy={busy === item.tx.id}
        onConfirm={() => confirmItem(item)}
        onSkip={items.length > 1 ? () => skip(item) : undefined}
        onPrev={idx > 0 ? () => setSelectedId(items[idx - 1].tx.id) : undefined}
        onNext={idx < items.length - 1 ? () => setSelectedId(items[idx + 1].tx.id) : undefined}
        onExclude={() => toggleExclude(item)}
        onResolveDuplicate={(keep) => resolveDuplicate(item, keep)}
      />
    )
  }

  const amountCell = (tx: TxRow) => (
    <div className={s.amt}>
      <Money className={s.amtMain} value={tx.amount} currency={tx.currency} />
      {tx.currency !== 'CZK' && <span className={s.amtSub}>≈ <Money value={tx.amountCzk} /></span>}
    </div>
  )

  if (isMobile) {
    return (
      <>
        <PageHeader title="Ke kategorizaci" subtitle={subtitle} tools={tools} />
        {q.isLoading ? <Spinner center /> : (
          <div className={s.cards}>
            {items.map((item) => {
              const tx = item.tx
              const eff = effective(item, drafts[tx.id])
              const open = selected?.tx.id === tx.id
              return (
                <div key={tx.id} className={clsx(s.card, open && s.cardOn)}>
                  <div className={s.cardHead} role="button" tabIndex={0} aria-expanded={open}
                    onClick={() => setSelectedId(open ? null : tx.id)}
                    onKeyDown={(e) => e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), setSelectedId(open ? null : tx.id))}>
                    <span className={s.cardCheck}>
                      <Checkbox checked={checked.has(tx.id)} onChange={(v) => toggleCheck(tx.id, v)} label={`Vybrat ${tx.counterparty}`} />
                    </span>
                    <div className="col" style={{ gap: 6, minWidth: 0 }}>
                      <span className="row" style={{ gap: 6, minWidth: 0 }}>
                        <span className={s.cardName}>{tx.counterparty || 'Bez protistrany'}</span>
                        {tx.suspectedDuplicateOfId != null && <Copy size={13} color="var(--neg)" style={{ flexShrink: 0 }} aria-label="Možná duplicita" />}
                      </span>
                      <span className="faint" style={{ fontSize: 12 }}>{dateShort(tx.date)} · {accounts.byId.get(tx.accountId)?.name}</span>
                      <SuggestionCell item={item} eff={eff} compact />
                    </div>
                    {amountCell(tx)}
                  </div>
                  {open && <div className={s.cardBody}>{detailFor(item, true)}</div>}
                </div>
              )
            })}
            {empty}
          </div>
        )}
        {items.length > 0 && (someOn ? (
          <div className={clsx(s.sticky, s.stickyDark)}>
            <button type="button" className={s.bulkClose} aria-label="Zrušit výběr" onClick={() => setChecked(new Set())}><X size={18} /></button>
            <span style={{ fontWeight: 700, flex: 1 }}>{checkedLabel(checkedIds.length)}</span>
            <button type="button" className={clsx(s.stickyBtn, s.stickyAccent)} disabled={busy === 'bulk'} onClick={confirmChecked}>
              <Check size={16} /> Potvrdit
            </button>
          </div>
        ) : (
          <div className={clsx(s.sticky, s.stickyLight)}>
            <button type="button" className={s.stickyBtn} disabled={busy === 'confident'} onClick={confirmConfident}>
              Potvrdit jisté (nad {CONFIDENT_MIN} %)
            </button>
          </div>
        ))}
      </>
    )
  }

  return (
    <>
      <PageHeader title="Ke kategorizaci" subtitle={subtitle} tools={tools} />
      <div className={s.layout} style={!selected ? { gridTemplateColumns: 'minmax(0, 1fr)' } : undefined}>
        <section className={s.list}>
          {someOn && (
            <div className={s.bulk}>
              <span style={{ fontSize: 14, fontWeight: 700, marginRight: 6 }}>{checkedLabel(checkedIds.length)}</span>
              {bulkCategory}
              <button type="button" className={s.bulkBtn} disabled={busy === 'bulk'} onClick={() => bulk({ need: 'Need' }, 'Označeno jako nezbytné')}>Nezbytné</button>
              <button type="button" className={s.bulkBtn} disabled={busy === 'bulk'} onClick={() => bulk({ need: 'Joy' }, 'Označeno jako pro radost')}>Pro radost</button>
              <button type="button" className={clsx(s.bulkBtn, s.bulkPrimary)} disabled={busy === 'bulk'} onClick={confirmChecked}>
                <Check size={16} /> Potvrdit vybrané
              </button>
              <button type="button" className={s.bulkClose} aria-label="Zrušit výběr" onClick={() => setChecked(new Set())}><X size={16} /></button>
            </div>
          )}
          <div className={clsx(s.grid, s.thead)}>
            <Checkbox checked={allOn ? true : someOn ? 'indeterminate' : false} label="Vybrat vše"
              onChange={() => setChecked(allOn ? new Set() : new Set(items.map((i) => i.tx.id)))} />
            <span className={s.colDate}>Datum</span>
            <span>Platba</span>
            <span>Návrh zařazení · jistota AI</span>
            <span style={{ textAlign: 'right' }}>Částka</span>
            <span />
          </div>
          {q.isLoading && <Spinner center />}
          {items.map((item) => {
            const tx = item.tx
            const eff = effective(item, drafts[tx.id])
            const on = selected?.tx.id === tx.id
            return (
              <div key={tx.id} className={clsx(s.grid, s.row, on && s.rowOn)} onClick={() => setSelectedId(tx.id)} aria-selected={on}>
                <Checkbox checked={checked.has(tx.id)} onChange={(v) => toggleCheck(tx.id, v)} label={`Vybrat ${tx.counterparty}`} />
                <span className={clsx(s.date, s.colDate)}>{dateShort(tx.date)}</span>
                <div className={s.pay}>
                  <div className={s.payTop}>
                    <span className={s.payName}>{tx.counterparty || 'Bez protistrany'}</span>
                    {tx.suspectedDuplicateOfId != null && <DupPill />}
                  </div>
                  <span className={s.payMeta}>{[accountLabel(tx), memberLabel(eff.member)].filter(Boolean).join(' · ')}</span>
                </div>
                <SuggestionCell item={item} eff={eff} />
                {amountCell(tx)}
                <button type="button" className={clsx(s.ok, eff.canConfirm && s.okReady)} title={eff.canConfirm ? 'Potvrdit návrh' : 'Nejdřív vyber kategorii'}
                  aria-label="Potvrdit návrh" disabled={!eff.canConfirm || busy === tx.id}
                  onClick={(e) => {
                    e.stopPropagation()
                    confirmItem(item)
                  }}>
                  <Check size={16} />
                </button>
              </div>
            )
          })}
          {empty}
          <div className={s.foot}>
            <span>Tip: Potvrzení bez změny zachová návrh. Ručně změněné zařazení nabídne vytvoření pravidla.</span>
            <Button size="sm" loading={busy === 'confident'} disabled={items.length === 0} onClick={confirmConfident}>
              Potvrdit všechny s jistotou nad {CONFIDENT_MIN} %
            </Button>
          </div>
        </section>
        {selected && <aside className={s.panel}>{detailFor(selected, false)}</aside>}
      </div>
    </>
  )
}

