import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import clsx from 'clsx'
import { AlertTriangle, Check, Clock, Plus, Sparkles, Waves, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { PageHeader } from '../components/AppShell'
import { CategoryPicker } from '../components/category'
import { forecastLabels, StepForecast } from '../components/charts/StepForecast'
import { MemberSwitch, Money, useMoney } from '../components/common'
import {
  Button, Callout, Card, DateInput, Dialog, Empty, Field, IconButton, NumberInput, Pill, Segmented, Select, Spinner, TextInput, tint,
} from '../components/ui'
import { useAccounts } from '../lib/accounts'
import { api, notifyError, notifyOk, qs } from '../lib/api'
import { useCategories } from '../lib/categories'
import { addDays, count, dateShort, monthShort, parseIso, weekdaysShort } from '../lib/format'
import {
  frequencyLabel, frequencyTitle, type AccountForecast, type Frequency, type HistoryState, type Occurrence, type Recurring, type RecurringAlert,
  type RecurringInput,
} from '../lib/planning'
import { useUi } from '../state/ui'
import s from './RecurringPage.module.css'

const HISTORY: Record<HistoryState, { label: string; color: string; bg: string; dashed?: boolean; icon: 'check' | 'clock' | 'wave' | 'alert' | null }> = {
  Ok: { label: 'včas', color: 'var(--pos)', bg: 'color-mix(in oklch, var(--pos) 10%, var(--surface))', icon: 'check' },
  Late: { label: 'později', color: 'var(--warn)', bg: 'color-mix(in oklch, var(--warn) 12%, var(--surface))', icon: 'clock' },
  Variable: { label: 'jiná částka', color: 'var(--ink-2)', bg: 'var(--surface-2)', icon: 'wave' },
  Higher: { label: 'víc', color: 'var(--warn)', bg: 'color-mix(in oklch, var(--warn) 12%, var(--surface))', icon: 'alert' },
  Lower: { label: 'méně', color: 'var(--ink-2)', bg: 'var(--surface-2)', icon: 'wave' },
  Missing: { label: 'chybí', color: 'var(--neg)', bg: 'color-mix(in oklch, var(--neg) 10%, var(--surface))', dashed: true, icon: 'alert' },
  None: { label: '—', color: 'var(--ink-3)', bg: 'transparent', dashed: true, icon: 'clock' },
}

const Icon = ({ k, size = 11 }: { k: 'check' | 'clock' | 'wave' | 'alert' | null; size?: number }) =>
  k === 'check' ? <Check size={size} /> : k === 'clock' ? <Clock size={size} /> : k === 'wave' ? <Waves size={size} /> : k === 'alert' ? <AlertTriangle size={size} /> : null

export default function RecurringPage() {
  const { household, member } = useUi()
  const today = household.today
  const qc = useQueryClient()
  const money = useMoney()
  const { byId: accounts, list: accountList } = useAccounts()
  const cats = useCategories()
  const [tab, setTab] = useState<'up' | 'all'>('up')
  const [sel, setSel] = useState<number | null>(null)
  const [hz, setHz] = useState(60)
  const [acc, setAcc] = useState<number | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [showAllSuggestions, setShowAllSuggestions] = useState(false)

  const recQ = useQuery({ queryKey: ['recurring'], queryFn: () => api.get<Recurring[]>('/api/recurring') })
  const occQ = useQuery({
    queryKey: ['recurring', 'occ', today],
    queryFn: () => api.get<Occurrence[]>(`/api/recurring/occurrences${qs({ from: addDays(today, -40), to: addDays(today, 30) })}`),
  })
  const alertsQ = useQuery({ queryKey: ['recurring', 'alerts'], queryFn: () => api.get<RecurringAlert[]>('/api/recurring/alerts') })
  const fcQ = useQuery({ queryKey: ['forecast', hz], queryFn: () => api.get<AccountForecast[]>(`/api/forecast${qs({ horizon: hz })}`) })

  const visibleAccount = (id: number) => {
    const a = accounts.get(id)
    return member === 'all' || !a || a.joint || a.ownerMemberId === member
  }
  const all = (recQ.data ?? []).filter((r) => visibleAccount(r.accountId))
  const active = all.filter((r) => r.status === 'Active')
  const suggestions = all.filter((r) => r.status === 'Suggested')
  const byId = new Map(all.map((r) => [r.id, r]))
  const monthlyOut = -active.filter((r) => r.amount < 0 && !r.isTransfer).reduce((a, r) => a + r.monthlyCzk, 0)
  const monthlyIn = active.filter((r) => r.amount > 0 && !r.isTransfer).reduce((a, r) => a + r.monthlyCzk, 0)

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['recurring'] })
    qc.invalidateQueries({ queryKey: ['forecast'] })
    qc.invalidateQueries({ queryKey: ['badges'] })
  }
  const act = useMutation({
    mutationFn: ({ url, body }: { url: string; body?: unknown }) => api.post(url, body),
    onSuccess: invalidate,
    onError: notifyError,
  })

  // Nadcházející: chybějící (po splatnosti) + výskyty v příštích 30 dnech po dnech
  const occ = (occQ.data ?? []).filter((o) => byId.has(o.recurringId))
  const overdue = occ.filter((o) => o.state === 'Missing')
  const upcoming = occ.filter((o) => o.due > today && (o.state === 'Expected' || o.state === 'Paired'))
  const days = useMemo(() => {
    const m = new Map<string, Occurrence[]>()
    for (const o of upcoming) m.set(o.due, [...(m.get(o.due) ?? []), o])
    return [...m.entries()].sort(([a], [b]) => a.localeCompare(b))
  }, [upcoming])

  const avatar = (r: Recurring) => {
    const color = r.amount > 0 ? 'var(--pos)' : r.isTransfer ? 'var(--ink-3)' : r.categoryId ? cats.colorOf(r.categoryId) : 'var(--ink-3)'
    return <span className={s.avatar} style={{ background: tint(color, 16), color }}>{r.name[0]?.toUpperCase()}</span>
  }
  const meta = (r: Recurring) =>
    [r.categoryId ? cats.nameOf(r.categoryId) : null, accounts.get(r.accountId)?.name, r.frequency !== 'Monthly' ? frequencyLabel[r.frequency] : null]
      .filter(Boolean).join(' · ')

  const statusPill = (r: Recurring, o: Occurrence) => {
    if (o.state === 'Missing') return <Pill tone="neg" icon={<AlertTriangle size={11} />}>Chybí {count(o.daysOverdue, 'den', 'dny', 'dní')}</Pill>
    if (o.state === 'Paired') return <Pill tone="pos" icon={<Check size={11} />}>Spárováno</Pill>
    if (r.amountKind === 'Variable') return <Pill tone="dashed" icon={<Waves size={11} />}>Odhad ±{r.variancePct} %</Pill>
    return <Pill icon={<Clock size={11} />}>Očekává se</Pill>
  }

  const row = (o: Occurrence) => {
    const r = byId.get(o.recurringId)!
    return (
      <button key={`${o.recurringId}-${o.due}`} type="button" className={clsx(s.row, sel === r.id && s.rowOn)} onClick={() => setSel(r.id)}>
        {avatar(r)}
        <span className="col grow" style={{ gap: 2 }}>
          <span className="ellipsis" style={{ fontSize: 14, fontWeight: 700 }}>{r.name}</span>
          <span className="ellipsis faint" style={{ fontSize: 12 }}>{meta(r)}</span>
        </span>
        <span className={s.hideSm}>{statusPill(r, o)}</span>
        <span className="col" style={{ alignItems: 'flex-end', gap: 1, minWidth: 110 }}>
          <Money value={r.amount} currency={r.currency} sign style={{ fontSize: 14, fontWeight: 800, color: r.amount > 0 ? 'var(--pos)' : r.isTransfer ? 'var(--ink-3)' : 'var(--ink)' }} />
          {r.currency !== 'CZK' ? <span className="faint" style={{ fontSize: 11 }}>≈ {money(o.amountCzk)}</span>
            : r.amountKind === 'Variable' ? <span className="faint" style={{ fontSize: 11 }}>odhad</span> : null}
        </span>
      </button>
    )
  }

  // Výhled: vybraný účet
  const fcs = (fcQ.data ?? []).filter((f) => visibleAccount(f.accountId))
  const fc = fcs.find((f) => f.accountId === acc) ?? fcs.find((f) => f.low) ?? fcs[0]
  const fcAccount = fc ? accounts.get(fc.accountId) : undefined
  const selected = sel != null ? byId.get(sel) : undefined

  return (
    <>
      <PageHeader
        title="Pravidelné platby a výhled"
        subtitle={`${count(active.length, 'pravidelná platba', 'pravidelné platby', 'pravidelných plateb')} · párování s tolerancí · výhled per účet v jeho měně`}
        actions={<Button variant="primary" icon={<Plus size={16} />} onClick={() => setFormOpen(true)}>Nová pravidelná platba</Button>}
        tools={
          <>
            <MemberSwitch />
            <Segmented value={tab} onChange={setTab} options={[{ value: 'up', label: 'Nadcházející 30 dní' }, { value: 'all', label: 'Všechny pravidelné' }]} />
            <span className={s.sums}>Měsíčně odchází <strong><Money value={monthlyOut} /></strong> přichází <strong className="pos"><Money value={monthlyIn} /></strong></span>
          </>
        }
      />

      {(alertsQ.data?.length ?? 0) + suggestions.length > 0 && (
        <div className="col" style={{ gap: 8 }}>
          {(alertsQ.data ?? []).filter((a) => byId.has(a.recurringId)).map((a) => (
            <Callout key={`${a.kind}-${a.recurringId}-${a.due}`} tone={a.kind === 'missing' ? 'danger' : 'warn'} icon={<AlertTriangle size={18} />}
              action={
                <div className="row wrap" style={{ gap: 6 }}>
                  {a.kind === 'missing' ? (
                    <>
                      <PairButton recurring={byId.get(a.recurringId)!} due={a.due!} onDone={invalidate} />
                      <Button size="sm" onClick={() => act.mutate({ url: `/api/recurring/${a.recurringId}/skip`, body: { due: a.due } })}>Tentokrát nebude</Button>
                    </>
                  ) : (
                    <>
                      <Button size="sm" onClick={() => act.mutate({ url: `/api/recurring/${a.recurringId}/amount-alert`, body: { accept: true } })}>
                        Nová částka {money(Math.abs(a.newAmount ?? 0), { currency: byId.get(a.recurringId)?.currency })}
                      </Button>
                      <Button size="sm" onClick={() => act.mutate({ url: `/api/recurring/${a.recurringId}/amount-alert`, body: { accept: false } })}>Jednorázově</Button>
                    </>
                  )}
                </div>
              }>
              <div style={{ fontWeight: 700, fontSize: 14 }}>{a.title}</div>
              <div className="muted" style={{ fontSize: 12 }}>{a.text}</div>
            </Callout>
          ))}
          {suggestions.slice(0, showAllSuggestions ? undefined : 3).map((r) => (
            <Callout key={r.id} tone="info" icon={<Sparkles size={18} />}
              action={
                <div className="row" style={{ gap: 6 }}>
                  <Button size="sm" variant="dark" icon={<Check size={14} />} onClick={() => act.mutate({ url: `/api/recurring/${r.id}/confirm` })}>Je pravidelná</Button>
                  <Button size="sm" onClick={() => act.mutate({ url: `/api/recurring/${r.id}/end`, body: { delete: true } })}>Není</Button>
                </div>
              }>
              <div style={{ fontWeight: 700, fontSize: 14 }}>Vypadá jako pravidelná: {r.name} · {money(r.amount, { currency: r.currency, sign: true })} {frequencyLabel[r.frequency]}</div>
              <div className="muted" style={{ fontSize: 12 }}>{meta(r)}{r.note ? ` · ${r.note}` : ''}</div>
            </Callout>
          ))}
          {suggestions.length > 3 && !showAllSuggestions && (
            <Button variant="ghost" size="sm" style={{ alignSelf: 'flex-start' }} onClick={() => setShowAllSuggestions(true)}>
              + {count(suggestions.length - 3, 'další návrh', 'další návrhy', 'dalších návrhů')}
            </Button>
          )}
        </div>
      )}

      <div className={s.grid}>
        <Card pad={false} className={clsx(s.list, selected && s.listHiddenMobile)}>
          {recQ.isLoading || occQ.isLoading ? <Spinner center /> : active.length === 0 ? (
            <Empty title="Zatím žádné pravidelné platby" icon={<Clock size={28} />}>
              Aplikace je rozpozná sama po dvou měsících pohybů, nebo je přidej ručně.
            </Empty>
          ) : tab === 'up' ? (
            <>
              {overdue.length > 0 && (
                <>
                  <div className={s.day} style={{ color: 'var(--neg)' }}><span>Po splatnosti</span><span /></div>
                  {overdue.map(row)}
                </>
              )}
              {days.map(([d, items]) => {
                const dd = parseIso(d)
                const tomorrow = addDays(today, 1) === d
                return (
                  <div key={d}>
                    <div className={s.day}>
                      <span>{tomorrow ? 'Zítra · ' : ''}{weekdaysShort[dd.getDay()]} {dateShort(d)}</span>
                      <Money value={items.reduce((a, o) => a + o.amountCzk, 0)} sign />
                    </div>
                    {items.map(row)}
                  </div>
                )
              })}
              {days.length === 0 && overdue.length === 0 && <Empty title="V příštích 30 dnech nic">Žádná pravidelná platba není na řadě.</Empty>}
            </>
          ) : (
            <>
              <div className={clsx(s.allRow, s.allHead)}><span>Platba</span><span>Frekvence</span><span style={{ textAlign: 'right' }}>Částka</span><span>Poslední párování</span></div>
              {[...active].sort((a, b) => a.monthlyCzk - b.monthlyCzk).map((r) => {
                const last = [...r.history].reverse().find((h) => h.state !== 'None')
                const h = HISTORY[last?.state ?? 'None']
                return (
                  <button key={r.id} type="button" className={clsx(s.allRow, sel === r.id && s.rowOn)} onClick={() => setSel(r.id)}>
                    <span className="row" style={{ gap: 10, minWidth: 0 }}>
                      {avatar(r)}
                      <span className="col grow" style={{ gap: 2 }}>
                        <span className="ellipsis" style={{ fontSize: 14, fontWeight: 700 }}>{r.name}</span>
                        <span className="ellipsis faint" style={{ fontSize: 12 }}>{meta(r)}</span>
                      </span>
                    </span>
                    <span className="muted" style={{ fontSize: 13 }}>{frequencyLabel[r.frequency]}{r.frequency === 'Monthly' ? ` · ${parseIso(r.anchorDate).getDate()}.` : ''}</span>
                    <span className="col" style={{ alignItems: 'flex-end', gap: 1 }}>
                      <Money value={r.amount} currency={r.currency} sign style={{ fontSize: 14, fontWeight: 800, color: r.amount > 0 ? 'var(--pos)' : 'var(--ink)' }} />
                      <span className="faint" style={{ fontSize: 11 }}>{r.amountKind === 'Variable' ? `proměnlivá ±${r.variancePct} %` : 'pevná'}</span>
                    </span>
                    <span className="row" style={{ gap: 5, fontSize: 12, fontWeight: 600, color: h.color }}>
                      <Icon k={h.icon} size={12} /> {last ? `${monthShort[Number(last.month.slice(5)) - 1]} · ${h.label}` : 'zatím nic'}
                    </span>
                  </button>
                )
              })}
            </>
          )}
        </Card>

        <div className={clsx(s.side, !selected && s.sideHiddenMobile)}>
          {selected && <RecurringEditor key={selected.id} r={selected} onClose={() => setSel(null)} onSaved={invalidate} />}
          <Card className={selected ? s.hideSmWhenSel : undefined}>
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <h2 style={{ fontSize: 20 }}>Výhled zůstatku</h2>
              <Segmented size="sm" value={hz} onChange={setHz} options={[{ value: 30, label: '30 d' }, { value: 60, label: '60 d' }, { value: 90, label: '90 d' }]} />
            </div>
            <div className="row wrap" style={{ gap: 6 }}>
              {fcs.map((f) => {
                const a = accounts.get(f.accountId)
                const on = f.accountId === fc?.accountId
                return (
                  <button key={f.accountId} type="button" className={clsx(s.accChip, on && s.accChipOn)} onClick={() => setAcc(f.accountId)}>
                    {a?.name} <span style={{ fontSize: 10, opacity: 0.7 }}>{f.currency}</span>
                    {f.low && <span className={s.warnDot} />}
                  </button>
                )
              })}
            </div>
            {fc && fcAccount ? (
              <>
                <div className="row" style={{ alignItems: 'baseline', gap: 8 }}>
                  <Money value={fc.now} currency={fc.currency} style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 26 }} />
                  <span className="faint" style={{ fontSize: 12 }}>dnes · za {hz} dní <Money value={fc.end} currency={fc.currency} /></span>
                </div>
                <StepForecast start={fc.now} points={fc.events.map((e) => ({ date: e.date, balance: e.balanceAfter }))} limit={fc.limit} from={today} days={hz} />
                <div className="row" style={{ justifyContent: 'space-between', fontSize: 11, color: 'var(--ink-3)' }}>
                  {forecastLabels(today, hz).map((l) => <span key={l}>{l}</span>)}
                </div>
                {fc.low ? (
                  <Callout tone="danger" icon={<AlertTriangle size={16} />}>
                    {dateShort(fc.minDate)} klesne {fcAccount.name} na {money(fc.min, { currency: fc.currency })}, pod limit {money(fc.limit, { currency: fc.currency })}.
                    Pomůže převést {money(fc.topUp, { currency: fc.currency })} do {dateShort(fc.topUpBy)}.
                  </Callout>
                ) : fc.limit != null ? (
                  <span className="pos" style={{ fontSize: 13, fontWeight: 600 }}>Zůstatek nikdy neklesne pod limit {money(fc.limit, { currency: fc.currency })}</span>
                ) : (
                  <span className="faint" style={{ fontSize: 12 }}>Účet nemá nastavený limit nízkého zůstatku (Účty → Upravit).</span>
                )}
                <div className="col" style={{ gap: 0 }}>
                  {fc.events.slice(0, 8).map((e, i) => (
                    <div key={i} className={s.event}>
                      <span className="faint">{dateShort(e.date)}</span>
                      <span className="ellipsis" style={{ fontWeight: 600 }}>{e.name}</span>
                      <Money value={e.amount} currency={fc.currency} sign style={{ fontWeight: 700, color: e.amount > 0 ? 'var(--pos)' : 'var(--ink)' }} />
                      <Money value={e.balanceAfter} currency={fc.currency} style={{ textAlign: 'right', color: fc.limit != null && e.balanceAfter < fc.limit ? 'var(--neg)' : 'var(--ink-3)' }} />
                    </div>
                  ))}
                </div>
              </>
            ) : <span className="faint">Žádný účet pro výhled.</span>}
          </Card>
        </div>
      </div>

      <RecurringForm open={formOpen} onOpenChange={setFormOpen} accounts={accountList.filter((a) => a.kind !== 'Investment')} today={today} onSaved={invalidate} />
    </>
  )
}

function PairButton({ recurring, due, onDone }: { recurring: Recurring; due: string; onDone: () => void }) {
  const [open, setOpen] = useState(false)
  const q = useQuery({
    queryKey: ['transactions', 'pair', recurring.id, due],
    enabled: open,
    queryFn: () => api.get<{ items: { id: number; date: string; counterparty: string; amount: number; currency: string }[] }>(
      `/api/transactions${qs({ account: recurring.accountId, period: `${addDays(due, -20)}..${addDays(due, 20)}`, take: 30 })}`),
  })
  const pair = useMutation({
    mutationFn: (transactionId: number) => api.post(`/api/recurring/${recurring.id}/pair`, { transactionId }),
    onSuccess: () => (setOpen(false), notifyOk('Spárováno'), onDone()),
    onError: notifyError,
  })
  return (
    <>
      <Button size="sm" variant="dark" onClick={() => setOpen(true)}>Spárovat ručně</Button>
      <Dialog open={open} onOpenChange={setOpen} title={`Spárovat: ${recurring.name}`} description={`Očekáváno ${dateShort(due)} · vyber odpovídající pohyb`}>
        {q.isLoading ? <Spinner center /> : (
          <div className="col" style={{ gap: 0 }}>
            {(q.data?.items ?? []).filter((t) => Math.sign(t.amount) === Math.sign(recurring.amount)).map((t) => (
              <button key={t.id} type="button" className={s.pairRow} onClick={() => pair.mutate(t.id)}>
                <span className="faint">{dateShort(t.date)}</span>
                <span className="ellipsis grow" style={{ fontWeight: 600 }}>{t.counterparty}</span>
                <Money value={t.amount} currency={t.currency} sign style={{ fontWeight: 700 }} />
              </button>
            ))}
            {(q.data?.items ?? []).length === 0 && <span className="faint">Kolem data žádné pohyby na účtu.</span>}
          </div>
        )}
      </Dialog>
    </>
  )
}

function RecurringEditor({ r, onClose, onSaved }: { r: Recurring; onClose: () => void; onSaved: () => void }) {
  const cats = useCategories()
  const { byId: accounts } = useAccounts()
  const money = useMoney()
  const [draft, setDraft] = useState<RecurringInput>({})
  const f = draft.frequency ?? r.frequency
  const kind = draft.amountKind ?? r.amountKind
  const tol = draft.toleranceDays ?? r.toleranceDays
  const amount = draft.amount ?? r.amount
  const save = useMutation({
    mutationFn: () => api.put(`/api/recurring/${r.id}`, draft),
    onSuccess: () => (notifyOk('Uloženo'), setDraft({}), onSaved()),
    onError: notifyError,
  })
  const end = useMutation({
    mutationFn: () => api.post(`/api/recurring/${r.id}/end`, {}),
    onSuccess: () => (notifyOk('Pravidelná platba ukončena'), onClose(), onSaved()),
    onError: notifyError,
  })
  const color = r.amount > 0 ? 'var(--pos)' : r.categoryId ? cats.colorOf(r.categoryId) : 'var(--ink-3)'
  return (
    <Card>
      <div className="row" style={{ gap: 12 }}>
        <span className={s.avatar} style={{ width: 40, height: 40, fontSize: 15, background: tint(color, 16), color }}>{r.name[0]?.toUpperCase()}</span>
        <div className="col grow" style={{ gap: 2 }}>
          <span style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 22 }}>{r.name}</span>
          <span className="faint" style={{ fontSize: 12 }}>{r.matchPattern} · {accounts.get(r.accountId)?.name} · {r.currency}</span>
        </div>
        <IconButton label="Zavřít" plain onClick={onClose}><X size={18} /></IconButton>
      </div>
      <div className={s.editGrid}>
        <span>Frekvence</span>
        <Segmented full size="sm" value={f} onChange={(v) => setDraft({ ...draft, frequency: v })}
          options={(['Weekly', 'Monthly', 'Quarterly', 'Yearly'] as Frequency[]).map((v) => ({ value: v, label: frequencyTitle[v] }))} />
        <span>Částka</span>
        <Segmented full size="sm" value={kind} onChange={(v) => setDraft({ ...draft, amountKind: v })}
          options={[{ value: 'Fixed', label: 'Pevná' }, { value: 'Variable', label: 'Proměnlivá' }]} />
        <span />
        <NumberInput value={amount} onChange={(v) => v != null && setDraft({ ...draft, amount: v })} suffix={r.currency === 'CZK' ? 'Kč' : r.currency} />
        <span />
        <span style={{ fontSize: 12, color: 'var(--ink-2)' }}>
          {kind === 'Variable' ? `Odhad ${money(Math.abs(amount), { currency: r.currency })} · rozptyl ±${draft.variancePct ?? r.variancePct} % · do výhledu jde odhad`
            : `Vždy ${money(Math.abs(amount), { currency: r.currency })}${f === 'Monthly' ? ` · ${parseIso(draft.anchorDate ?? r.anchorDate).getDate()}. den v měsíci` : ''}`}
        </span>
        <span>Tolerance</span>
        <Segmented full size="sm" value={tol} onChange={(v) => setDraft({ ...draft, toleranceDays: v })}
          options={[1, 3, 5, 7].map((v) => ({ value: v, label: `±${v} d` }))} />
        <span>Kategorie</span>
        <CategoryPicker size="sm" block value={draft.setCategory ? draft.categoryId : r.categoryId}
          onChange={(id) => setDraft({ ...draft, categoryId: id, setCategory: true })} />
        <span>Termín</span>
        <DateInput value={draft.anchorDate ?? r.anchorDate} onChange={(v) => v && setDraft({ ...draft, anchorDate: v })} />
      </div>
      <div className="col" style={{ gap: 6 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink-2)' }}>Historie párování</span>
        <div className="row" style={{ gap: 6 }}>
          {r.history.map((h) => {
            const st = HISTORY[h.state]
            return (
              <div key={h.month} className={s.hist} style={{ background: st.bg, border: `1px ${st.dashed ? 'dashed' : 'solid'} ${st.dashed ? st.color : 'transparent'}` }}>
                <span className="faint" style={{ fontSize: 11 }}>{monthShort[Number(h.month.slice(5)) - 1]}</span>
                <span className="row" style={{ gap: 4, fontSize: 12, fontWeight: 700, color: st.color }}>
                  <Icon k={st.icon} />
                  {h.state === 'Late' && h.daysLate ? `o ${h.daysLate} d` : h.state === 'Higher' || h.state === 'Variable' || h.state === 'Lower'
                    ? money(Math.abs(h.amount ?? 0), { currency: r.currency }) : st.label}
                </span>
              </div>
            )
          })}
        </div>
      </div>
      <div className="row" style={{ gap: 8 }}>
        <Button variant="dark" block disabled={Object.keys(draft).length === 0} loading={save.isPending} onClick={() => save.mutate()}>Uložit</Button>
        <Button onClick={() => end.mutate()} loading={end.isPending}>Ukončit</Button>
      </div>
    </Card>
  )
}

function RecurringForm({ open, onOpenChange, accounts, today, onSaved }: {
  open: boolean
  onOpenChange: (o: boolean) => void
  accounts: { id: number; name: string; currency: string }[]
  today: string
  onSaved: () => void
}) {
  const [v, setV] = useState<RecurringInput & { out: boolean }>({ out: true, frequency: 'Monthly', amountKind: 'Fixed', toleranceDays: 3, anchorDate: today })
  const create = useMutation({
    mutationFn: () => api.post('/api/recurring', { ...v, amount: v.amount != null ? (v.out ? -Math.abs(v.amount) : Math.abs(v.amount)) : undefined, setCategory: v.categoryId != null }),
    onSuccess: () => (notifyOk('Pravidelná platba přidána'), onOpenChange(false), onSaved(), setV({ out: true, frequency: 'Monthly', amountKind: 'Fixed', toleranceDays: 3, anchorDate: today })),
    onError: notifyError,
  })
  const acc = accounts.find((a) => a.id === v.accountId)
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Nová pravidelná platba" description="Pro výhled zůstatku, rezervace v rozpočtu a párování."
      footer={<><Button onClick={() => onOpenChange(false)}>Zrušit</Button><span style={{ flex: 1 }} />
        <Button variant="primary" disabled={!v.name || !v.accountId || !v.amount} loading={create.isPending} onClick={() => create.mutate()}>Přidat</Button></>}>
      <Field label="Název"><TextInput value={v.name ?? ''} placeholder="Např. Hypotéka, Netflix" onChange={(e) => setV({ ...v, name: e.target.value })} /></Field>
      <Field label="Text v platbě (pro párování)" hint="Co musí obsahovat protistrana nebo zpráva. Prázdné = shoda podle částky.">
        <TextInput value={v.matchPattern ?? ''} placeholder="Např. NETFLIX" onChange={(e) => setV({ ...v, matchPattern: e.target.value })} />
      </Field>
      <Field label="Účet">
        <Select value={v.accountId ? String(v.accountId) : null} placeholder="Vyber účet" onChange={(x) => setV({ ...v, accountId: Number(x) })}
          options={accounts.map((a) => ({ value: String(a.id), label: `${a.name} · ${a.currency}` }))} />
      </Field>
      <div className="row wrap" style={{ gap: 10, alignItems: 'flex-end' }}>
        <Segmented value={v.out} onChange={(out) => setV({ ...v, out })} options={[{ value: true, label: 'Odchozí' }, { value: false, label: 'Příchozí' }]} />
        <div className="grow"><NumberInput value={v.amount} onChange={(a) => setV({ ...v, amount: a ?? undefined })} suffix={acc?.currency === 'CZK' || !acc ? 'Kč' : acc.currency} /></div>
      </div>
      <Field label="Frekvence">
        <Segmented full value={v.frequency!} onChange={(f) => setV({ ...v, frequency: f })}
          options={(['Weekly', 'Monthly', 'Quarterly', 'Yearly'] as Frequency[]).map((x) => ({ value: x, label: frequencyTitle[x] }))} />
      </Field>
      <div className="row wrap" style={{ gap: 10 }}>
        <Field label="Nejbližší nebo poslední termín" className="grow"><DateInput value={v.anchorDate ?? null} onChange={(d) => setV({ ...v, anchorDate: d ?? undefined })} /></Field>
        <Field label="Částka" className="grow">
          <Segmented full value={v.amountKind!} onChange={(k) => setV({ ...v, amountKind: k })} options={[{ value: 'Fixed', label: 'Pevná' }, { value: 'Variable', label: 'Proměnlivá' }]} />
        </Field>
      </div>
      <Field label="Kategorie"><CategoryPicker block value={v.categoryId} onChange={(id) => setV({ ...v, categoryId: id })} /></Field>
    </Dialog>
  )
}
