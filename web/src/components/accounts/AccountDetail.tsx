import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import clsx from 'clsx'
import { AlertTriangle, ChevronRight, Pencil, Scale, TrendingUp } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useState } from 'react'
import { api, notifyError, notifyOk, qs } from '../../lib/api'
import { addDays, count, dateLong, dateShort, monthNames, num, parseIso } from '../../lib/format'
import type { AccountForecast, ConditionStatus, ConditionsSummary } from '../../lib/household'
import type { Account, TxPage, TxRow } from '../../lib/types'
import { useMembers, useUi } from '../../state/ui'
import { CategoryDot } from '../category'
import { InstitutionBadge, Money, useMoney } from '../common'
import { ImportHelpButton } from '../ImportHelp'
import { Button, DateInput, NumberInput, Skeleton } from '../ui'
import { BalanceChart } from './BalanceChart'
import { memberRule, ownerText, sourceLabel, sym } from './helpers'
import s from './accounts.module.css'

const HORIZON = 30

export function AccountDetail({ account: a, onEdit, korOpen, setKorOpen }: {
  account: Account
  onEdit: () => void
  korOpen: boolean
  setKorOpen: (v: boolean) => void
}) {
  const { household } = useUi()
  const members = useMembers()
  const fmt = useMoney()
  const today = household.today
  const inv = a.kind === 'Investment'
  const pastFrom = addDays(today, -7 * Math.max(1, a.sparkline.length - 1))

  const forecast = useQuery({
    queryKey: ['forecast', HORIZON, a.id],
    queryFn: () => api.get<AccountForecast[]>(`/api/forecast${qs({ horizon: HORIZON, account: a.id })}`),
    enabled: !inv,
    select: (x) => x[0],
  }).data
  const conditions = useQuery({
    queryKey: ['conditions', 'account', a.id],
    queryFn: () => api.get<ConditionsSummary>(`/api/conditions${qs({ account: a.id })}`),
    enabled: !inv && a.conditions.length > 0,
  }).data
  const recent = useQuery({
    queryKey: ['transactions', 'account-recent', a.id],
    queryFn: () => api.get<TxPage>(`/api/transactions${qs({ account: a.id, take: 6 })}`),
  })
  const corrections = useQuery({
    queryKey: ['transactions', 'account-corrections', a.id, pastFrom],
    queryFn: () => api.get<TxPage>(`/api/transactions${qs({ account: a.id, corrections: true, period: `${pastFrom}..${today}`, take: 50 })}`),
    enabled: !inv,
    select: (p) => p.items.map((t) => ({ date: t.date, amount: t.amount })),
  }).data

  const rateNote = a.currency !== 'CZK' && household.rates[a.currency] ? ` · kurz ČNB ${num(household.rates[a.currency], 2)}` : ''
  const low = forecast?.low ? forecast : undefined

  return (
    <div className={s.detail}>
      <div className={s.detailHead}>
        <InstitutionBadge institution={a.institution} name={a.name} size={44} />
        <div className="col grow" style={{ gap: 2 }}>
          <span className={s.detailName}>{a.name}</span>
          <span className={s.detailSub}>
            {a.institution.name}{a.iban ? ` · ${a.iban}` : ''} · {ownerText(a, members)}{a.archived ? ' · archivovaný' : ''}
          </span>
        </div>
      </div>

      <div className={s.detailBalance}>
        <Money value={a.balance} currency={a.currency} className={s.bigNum} />
        {a.currency !== 'CZK' && <span className="faint" style={{ fontSize: 14 }}>≈ {fmt(a.balanceCzk)}{rateNote}</span>}
      </div>

      <div className={s.chartCard}>
        <div className={s.chartLegend}>
          <span className={s.chartTitle}>{inv ? 'Vývoj hodnoty' : 'Vývoj a výhled'} · {a.currency}</span>
          <span className={s.legendItem}><span style={{ width: 14, height: 2, background: 'var(--ink)' }} />skutečnost</span>
          {!inv && <span className={s.legendItem}><span style={{ width: 14, height: 0, borderTop: '2px dashed var(--ink-3)' }} />výhled</span>}
          {!inv && <span className={clsx(s.legendItem, s.hideMobile)}><span style={{ width: 8, height: 8, border: '1.5px dashed var(--ink-2)', transform: 'rotate(45deg)' }} />korekce</span>}
        </div>
        <BalanceChart past={a.sparkline} today={today} forecast={inv ? undefined : forecast} corrections={corrections ?? []}
          limit={inv ? undefined : a.lowBalanceLimit} currency={a.currency} />
      </div>

      {low && low.limit != null && (
        <div className={s.warn}>
          <AlertTriangle size={16} color="var(--neg)" style={{ flexShrink: 0, marginTop: 1 }} />
          <span>{lowText(low, a.currency, fmt)}</span>
        </div>
      )}

      {conditions && conditions.items.length > 0 && <ConditionsBox items={conditions.items} currency={a.currency} />}

      <div className={s.actions}>
        <Button variant={korOpen ? 'dark' : 'secondary'} icon={inv ? <TrendingUp size={16} /> : <Scale size={16} />} onClick={() => setKorOpen(!korOpen)}>
          {inv ? 'Zadat hodnotu' : <><span className={s.long}>Korekce zůstatku</span><span className={s.short}>Korekce</span></>}
        </Button>
        {!inv && (
          <ImportHelpButton variant="secondary">
            <span className={s.long}>Nahrát výpis</span><span className={s.short}>Výpis</span>
          </ImportHelpButton>
        )}
        <Button variant="secondary" icon={<Pencil size={16} />} onClick={onEdit} className={s.hideMobile}>Upravit účet</Button>
      </div>

      {korOpen && <CorrectionPanel key={a.id} account={a} onClose={() => setKorOpen(false)} />}

      <div className={s.recent}>
        <div className={s.recentHead}>
          <span style={{ fontSize: 13, fontWeight: 700 }}>Poslední pohyby</span>
          {a.transactionCount > 0 && (
            <Link to={`/pohyby?ucet=${a.id}`} className={s.recentAll}>Všechny ({num(a.transactionCount)})<ChevronRight size={14} /></Link>
          )}
        </div>
        {recent.isLoading && <Skeleton height={120} />}
        {recent.data && recent.data.items.length === 0 && (
          <span className="faint" style={{ fontSize: 13, padding: '10px 0' }}>
            {inv ? 'Zatím žádné vklady ani obchody.' : 'Zatím žádné pohyby. Nahraj výpis přes Clauda nebo je zadej ručně.'}
          </span>
        )}
        {recent.data?.items.map((t) => <RecentRow key={t.id} t={t} />)}
      </div>

      <div className={s.meta}>
        <div><span>{inv ? 'Sledování hodnoty' : 'Zdroj pohybů'}</span><b>{sourceLabel(a)}</b></div>
        <div><span>Člen se určuje</span><b>{memberRule(a)}</b></div>
        {!inv && <div><span>Započítávat do disponibilního zůstatku</span><b style={{ color: a.includeInDisposable ? 'var(--pos)' : 'var(--ink-3)' }}>{a.includeInDisposable ? 'Ano' : 'Ne'}</b></div>}
        <div><span>Započítávat do čistého jmění</span><b style={{ color: a.includeInNetWorth ? 'var(--pos)' : 'var(--ink-3)' }}>{a.includeInNetWorth ? 'Ano' : 'Ne'}</b></div>
        {a.interestRate != null && <div><span>Úroková sazba</span><b>{num(a.interestRate, 2)} % p. a.</b></div>}
      </div>
    </div>
  )
}

function lowText(f: AccountForecast, currency: string, fmt: ReturnType<typeof useMoney>) {
  const outgoing = f.events.filter((e) => e.amount < 0 && e.date <= f.minDate).sort((x, y) => x.amount - y.amount).slice(0, 2).map((e) => e.name)
  let text = `${dateShort(f.minDate)} klesne zůstatek na ${fmt(f.min, { currency })}, pod limit ${fmt(f.limit, { currency })}.`
  if (outgoing.length) text += ` Do té doby odchází ${outgoing.join(' a ')}.`
  if (f.topUp) text += ` Doplň alespoň ${fmt(f.topUp, { currency })}.`
  return text
}

function ConditionsBox({ items, currency }: { items: ConditionStatus[]; currency: string }) {
  const fmt = useMoney()
  const { hidden } = useUi()
  const end = items[0].periodEnd
  const days = items[0].daysLeft
  return (
    <div className={s.conds}>
      <div className={s.condsHead}>
        <span style={{ fontSize: 13, fontWeight: 800 }}>Podmínky účtu · {monthNames[parseIso(end).getMonth()]}</span>
        <span className="faint" style={{ fontSize: 12 }}>
          {days === 0 ? 'poslední den' : `${days >= 2 && days <= 4 ? 'zbývají' : 'zbývá'} ${count(days, 'den', 'dny', 'dní')}`}
        </span>
      </div>
      {items.map((c) => {
        const ok = c.state === 'Met'
        const p = Math.min(1, c.current / (c.target || 1))
        const color = ok ? 'var(--pos)' : p >= 0.55 ? 'var(--warn)' : 'var(--neg)'
        const card = c.type === 'CardCount'
        const label = c.type === 'IncomingSum' ? `Příchozí platby ≥ ${fmt(c.target, { currency })}` : card ? `Platby kartou ≥ ${num(c.target)}` : `Průměrný zůstatek ≥ ${fmt(c.target, { currency })}`
        const progress = card ? `${num(c.current)} / ${num(c.target)}` : `${hidden ? '•••' : num(Math.round(c.current))} / ${fmt(c.target, { currency })}`
        const missing = card ? count(Math.ceil(c.missing), 'platba', 'platby', 'plateb') : fmt(c.missing, { currency })
        return (
          <div key={c.conditionId} className="col" style={{ gap: 5 }}>
            <div className="row" style={{ alignItems: 'baseline', fontSize: 13 }}>
              <span className="grow" style={{ fontWeight: 600 }}>{label}</span>
              <span className="num" style={{ fontWeight: 800, color }}>{progress}</span>
            </div>
            <div className={s.condBar}><span style={{ width: `${Math.round(p * 100)}%`, background: color }} /></div>
            <span className="faint" style={{ fontSize: 12 }}>
              {ok ? `Splněno · ${c.benefit || 'podmínka splněna'}` : `Chybí ${missing} do ${dateShort(c.periodEnd)}${c.benefit ? ` · jinak přijdeš o: ${c.benefit.charAt(0).toLowerCase()}${c.benefit.slice(1)}` : ''}`}
            </span>
          </div>
        )
      })}
    </div>
  )
}

function RecentRow({ t }: { t: TxRow }) {
  const fmt = useMoney()
  const corr = t.kind === 'Correction'
  const transfer = t.kind === 'Transfer' || t.kind === 'InvestmentTransfer'
  const split = t.splits.length > 1
  return (
    <div className={s.recentRow}>
      <span className={s.recentDate}>{dateShort(t.date)}</span>
      <span className={s.recentName}>
        {corr ? <span className={s.dotDashed} /> : transfer ? <span className={s.dotTransfer} /> : <CategoryDot id={split ? t.splits[0].categoryId : t.categoryId} size={7} />}
        <span className="ellipsis">{t.counterparty}</span>
        <span className={s.recentDateMobile}>{dateShort(t.date)}</span>
      </span>
      <span className="num" style={{ fontSize: 13, fontWeight: 700, color: corr ? 'var(--ink-2)' : t.amount > 0 ? 'var(--pos)' : 'var(--ink)' }}>
        {fmt(t.amount, { currency: t.currency, sign: true })}
      </span>
    </div>
  )
}

/** Korekce zůstatku (běžný/spořicí účet) nebo nová hodnota portfolia (investiční účet). */
function CorrectionPanel({ account: a, onClose }: { account: Account; onClose: () => void }) {
  const { household } = useUi()
  const qc = useQueryClient()
  const fmt = useMoney()
  const inv = a.kind === 'Investment'
  const [date, setDate] = useState<string | null>(household.today)
  const [value, setValue] = useState<number | null>(a.balance)
  const [deposits, setDeposits] = useState<number | null>(null)
  const isToday = date === household.today
  const diff = value != null ? Math.round((value - a.balance) * 100) / 100 : 0

  const save = useMutation({
    mutationFn: () => inv
      ? api.post(`/api/investments/${a.id}/values`, { date, value, deposits })
      : api.post<{ id: number; amount: number; date: string }>(`/api/accounts/${a.id}/corrections`, { date, actualBalance: value }),
    onSuccess: (r) => {
      notifyOk(inv ? 'Hodnota portfolia uložena' : `Korekce ${fmt((r as { amount: number }).amount, { currency: a.currency, sign: true })} uložena`)
      for (const k of [['accounts'], ['transactions'], ['forecast'], ['conditions'], ['investments'], ['stats'], ['household']]) qc.invalidateQueries({ queryKey: k })
      onClose()
    },
    onError: notifyError,
  })

  return (
    <div className={s.kor}>
      <span style={{ fontSize: 13, fontWeight: 700 }}>{inv ? 'Nová hodnota portfolia' : 'Nová korekce zůstatku'}</span>
      <div className={s.korGrid}>
        <label className={s.korLabel}>Ke dni<DateInput value={date} onChange={setDate} /></label>
        <label className={s.korLabel}>{inv ? 'Aktuální hodnota' : 'Skutečný zůstatek'} ({a.currency})
          <NumberInput value={value} onChange={setValue} suffix={sym(a.currency)} autoFocus />
        </label>
        {inv && (
          <label className={s.korLabel}>Vloženo celkem (nepovinné)
            <NumberInput value={deposits} onChange={setDeposits} suffix={sym(a.currency)} />
          </label>
        )}
      </div>
      {isToday ? (
        <div className="row" style={{ justifyContent: 'space-between', fontSize: 13 }}>
          <span className="muted">{inv ? 'Změna proti poslední hodnotě' : 'Rozdíl proti evidenci'}</span>
          <span className="num" style={{ fontWeight: 800, color: diff === 0 ? 'var(--ink-3)' : diff > 0 ? 'var(--pos)' : 'var(--neg)' }}>
            {fmt(diff, { currency: a.currency, sign: true })}
          </span>
        </div>
      ) : (
        <span className="muted" style={{ fontSize: 12 }}>{inv ? `Hodnota se uloží k ${dateLong(date)}.` : `Rozdíl se dopočítá proti zůstatku k ${dateLong(date)}.`}</span>
      )}
      <span className="muted" style={{ fontSize: 12, lineHeight: 1.5 }}>
        {inv ? 'Hodnota se mění jen zadáním nové hodnoty nebo obchodem. Z rozdílu hodnoty a vkladů se počítá výnos. Vloženo celkem vyplň, když vklady neodpovídají převodům – další se dopočítají od tohoto dne.'
          : 'Korekce je zvláštní pohyb mimo statistiky. Grafy vývoje zůstatku se od tohoto dne zpětně dopočítají.'}
      </span>
      <div className="row">
        <Button variant="dark" className="grow" loading={save.isPending} disabled={!date || value == null || (!inv && isToday && diff === 0)}
          onClick={() => save.mutate()}>
          {inv ? 'Uložit hodnotu' : 'Uložit korekci'}
        </Button>
        <Button variant="secondary" onClick={onClose}>Zrušit</Button>
      </div>
    </div>
  )
}
