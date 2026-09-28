import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import clsx from 'clsx'
import { Check, Link2, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { PageHeader } from '../components/AppShell'
import { InstitutionBadge, Money, useMoney } from '../components/common'
import { Button, Card, DateInput, Empty, Field, IconButton, NumberInput, Segmented, Spinner, TextInput } from '../components/ui'
import { useAccounts } from '../lib/accounts'
import { api, notifyError, notifyOk, qs } from '../lib/api'
import { dateShort, monthShort, num, pct } from '../lib/format'
import type { InvestmentAccountView, NetWorth } from '../lib/planning'
import type { Account } from '../lib/types'
import { useUi } from '../state/ui'
import s from './InvestmentsPage.module.css'

const LAYERS: Record<string, { label: string; color: string }> = {
  Current: { label: 'Běžné účty', color: 'var(--c1)' },
  Savings: { label: 'Spořicí', color: 'var(--c5)' },
  Foreign: { label: 'Cizí měny', color: 'var(--c6)' },
  Investment: { label: 'Investice', color: 'var(--c3)' },
}

export default function InvestmentsPage() {
  const { household, member } = useUi()
  const money = useMoney()
  const { list: accounts } = useAccounts()
  const [cur, setCur] = useState<'CZK' | 'EUR' | 'USD'>('CZK')
  const [range, setRange] = useState(12)
  const nwQ = useQuery({
    queryKey: ['net-worth', range, member],
    queryFn: () => api.get<NetWorth>(`/api/stats/net-worth${qs({ months: range, member: member === 'all' ? undefined : member })}`),
  })
  const invQ = useQuery({ queryKey: ['investments'], queryFn: () => api.get<InvestmentAccountView[]>('/api/investments') })
  const invAccounts = accounts.filter((a) => a.kind === 'Investment')
  const [selId, setSelId] = useState<number | null>(null)
  const sel = invAccounts.find((a) => a.id === selId) ?? invAccounts[0]
  const view = invQ.data?.find((v) => v.accountId === sel?.id)

  const nw = nwQ.data
  const rate = cur === 'CZK' ? 1 : nw?.rates[cur] ?? household.rates[cur] ?? 1
  const conv = (v: number) => v / rate

  // Vrstvený graf čistého jmění
  const W = 700
  const H = 230
  const n = nw?.months.length ?? 0
  const totals = nw ? nw.months.map((_, i) => nw.layers.reduce((a, l) => a + l.values[i], 0)) : []
  const mx = Math.max(...totals, 1) * 1.03
  const mn = Math.min(...totals, 0) * 0.72
  const X = (i: number) => (n > 1 ? (i / (n - 1)) * W : 0).toFixed(1)
  const Y = (v: number) => Math.min(H, 225 - ((v - mn) / (mx - mn || 1)) * 215).toFixed(1)
  const layerPaths = nw ? nw.layers.map((l, li) => {
    const top: string[] = []
    const bot: string[] = []
    for (let i = 0; i < n; i++) {
      const below = nw.layers.slice(0, li).reduce((a, x) => a + x.values[i], 0)
      top.push(`${X(i)} ${Y(below + l.values[i])}`)
      bot.push(`${X(i)} ${Y(below)}`)
    }
    return { key: l.key, d: `M${top.join('L')}L${bot.reverse().join('L')}Z` }
  }) : []
  const topLine = totals.map((t, i) => `${i ? 'L' : 'M'}${X(i)} ${Y(t)}`).join('')

  return (
    <>
      <PageHeader title="Investice a jmění" subtitle="Čisté jmění = běžné, spořicí, devizové a investiční účty · hodnota investic zadávaná ručně" />
      <Card className={s.nw}>
        {!nw ? <Spinner center /> : (
          <>
            <div className="col" style={{ gap: 14 }}>
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink-2)' }}>Čisté jmění</span>
                <Segmented size="sm" value={cur} onChange={setCur} options={['CZK', 'EUR', 'USD'].map((c) => ({ value: c as 'CZK', label: c }))} />
              </div>
              <Money value={conv(nw.now)} currency={cur} decimals={0} className={s.big} />
              <div className="row" style={{ gap: 14, fontSize: 13, fontWeight: 700 }}>
                <span style={{ color: nw.now >= nw.monthAgo ? 'var(--pos)' : 'var(--neg)' }}>{money(conv(nw.now - nw.monthAgo), { currency: cur, decimals: 0, sign: true })} za měsíc</span>
                <span style={{ color: nw.now >= nw.yearAgo ? 'var(--pos)' : 'var(--neg)' }}>{money(conv(nw.now - nw.yearAgo), { currency: cur, decimals: 0, sign: true })} za {range === 12 ? 'rok' : `${range} měs.`}</span>
              </div>
              <div className="col" style={{ gap: 2, paddingTop: 10, borderTop: '1px solid var(--line)' }}>
                {[...nw.layers].reverse().map((l) => {
                  const v = l.values[n - 1]
                  return (
                    <div key={l.key} className={s.part}>
                      <span style={{ width: 10, height: 10, borderRadius: 3, background: LAYERS[l.key].color }} />
                      <span>{LAYERS[l.key].label}</span>
                      <Money value={conv(v)} currency={cur} decimals={0} style={{ fontWeight: 700 }} />
                      <span className="faint" style={{ textAlign: 'right' }}>{nw.now ? pct((v / nw.now) * 100) : '—'}</span>
                    </div>
                  )
                })}
              </div>
              <span className="faint" style={{ fontSize: 11, lineHeight: 1.5 }}>
                {cur === 'CZK' ? `Účty v EUR a USD přepočteny kurzem ČNB (${num(nw.rates.EUR ?? 0, 2)} Kč/€, ${num(nw.rates.USD ?? 0, 2)} Kč/$).`
                  : `Přepočteno z Kč kurzem ČNB (${num(rate, 2)} Kč/${cur === 'EUR' ? '€' : '$'}).`}
              </span>
            </div>
            <div className="col" style={{ gap: 8, minWidth: 0 }}>
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <span style={{ fontSize: 13, fontWeight: 700 }}>Vývoj za {range === 12 ? '12 měsíců' : '6 měsíců'}</span>
                <Segmented size="sm" value={range} onChange={setRange} options={[{ value: 6, label: '6 měs.' }, { value: 12, label: '1 rok' }]} />
              </div>
              <svg width="100%" height={230} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
                {[0.25, 0.5, 0.75].map((f) => <line key={f} x1={0} x2={W} y1={Y(mn + (mx - mn) * f)} y2={Y(mn + (mx - mn) * f)} style={{ stroke: 'var(--line)' }} />)}
                {layerPaths.map((l) => <path key={l.key} d={l.d} style={{ fill: `color-mix(in oklch, ${LAYERS[l.key].color} 55%, var(--surface))`, opacity: 0.9 }} />)}
                <path d={topLine} fill="none" style={{ stroke: 'var(--ink)', strokeWidth: 2 }} vectorEffect="non-scaling-stroke" />
              </svg>
              <div className="row" style={{ justifyContent: 'space-between', fontSize: 11, color: 'var(--ink-3)' }}>
                {nw.months.filter((_, i, a) => i % Math.ceil(a.length / 6) === 0 || i === a.length - 1).map((m) => (
                  <span key={m}>{monthShort[Number(m.slice(5)) - 1]}{m.endsWith('-01') || m === nw.months[0] ? ` ${m.slice(2, 4)}` : ''}</span>
                ))}
              </div>
            </div>
          </>
        )}
      </Card>

      {invAccounts.length === 0 ? (
        <Card>
          <Empty title="Zatím žádný investiční účet" action={<Link to="/ucty?form=new&type=inv"><Button variant="primary" icon={<Plus size={16} />}>Přidat investiční účet</Button></Link>}>
            Přidej investiční účet (ETF, penzijko, DIP…) a zadávej hodnotu portfolia – spočítá se výnos proti vkladům.
          </Empty>
        </Card>
      ) : (
        <div className={s.grid}>
          <Card>
            {invAccounts.length > 1 && (
              <div className="row wrap" style={{ gap: 6 }}>
                {invAccounts.map((a) => (
                  <button key={a.id} type="button" className={clsx(s.chip, a.id === sel?.id && s.chipOn)} onClick={() => setSelId(a.id)}>{a.name}</button>
                ))}
              </div>
            )}
            {sel && <AccountDetail account={sel} view={view} />}
          </Card>
          {sel && <Trades account={sel} view={view} />}
        </div>
      )}
    </>
  )
}

function AccountDetail({ account: a, view }: { account: Account; view?: InvestmentAccountView }) {
  const money = useMoney()
  const qc = useQueryClient()
  const { household } = useUi()
  const [date, setDate] = useState<string | null>(household.today)
  const [value, setValue] = useState<number | null>(null)
  const add = useMutation({
    mutationFn: () => api.post(`/api/investments/${a.id}/values`, { date, value }),
    onSuccess: () => (notifyOk('Hodnota uložena'), setValue(null), qc.invalidateQueries({ queryKey: ['investments'] }),
      qc.invalidateQueries({ queryKey: ['net-worth'] }), qc.invalidateQueries({ queryKey: ['accounts'] })),
    onError: notifyError,
  })
  const owners = a.joint ? household.members.map((m) => m.name).join(' a ') : household.members.find((m) => m.id === a.ownerMemberId)?.name
  const h = view?.history ?? []
  const N = h.length
  const vals = h.map((p) => p.value)
  const deps = h.map((p) => p.deposits)
  const imx = Math.max(...vals, ...deps, 1) * 1.04
  const imn = Math.min(...deps, ...vals) * 0.96
  const IX = (i: number) => (N > 1 ? (i / (N - 1)) * 640 : 320).toFixed(1)
  const IY = (v: number) => (195 - ((v - imn) / (imx - imn || 1)) * 185).toFixed(1)
  const vp = vals.map((v, i) => `${i ? 'L' : 'M'}${IX(i)} ${IY(v)}`).join('')
  const dp = deps.map((v, i) => `${i ? 'L' : 'M'}${IX(i)} ${IY(v)}`).join('')
  const gap = vp + [...deps].reverse().map((v, j) => `L${IX(N - 1 - j)} ${IY(v)}`).join('') + 'Z'
  const last = view?.value ?? a.balance
  const change = value != null && last ? value - last : null
  return (
    <>
      <div className="row" style={{ gap: 10 }}>
        <InstitutionBadge institution={a.institution} size={40} />
        <div className="col grow" style={{ gap: 2 }}>
          <span style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 22 }}>{a.name}</span>
          <span className="faint" style={{ fontSize: 12 }}>{a.institution.name} · {a.currency} · {owners}{view?.lastDate ? ` · hodnota zadána ${dateShort(view.lastDate)}` : ''}</span>
        </div>
        <Link to={`/ucty/${a.id}?form=edit`}><Button size="sm">Upravit účet</Button></Link>
      </div>
      <div className={s.stats}>
        <div><span>Hodnota</span><Money value={last} currency={a.currency} decimals={0} className={s.statV} /><span className="faint">≈ {money(a.balanceCzk)}</span></div>
        <div><span>Vloženo celkem</span><Money value={view?.deposits} currency={a.currency} decimals={0} className={s.statV} /><span className="faint">vklady a převody</span></div>
        <div><span>Zisk</span><Money value={view?.gain} currency={a.currency} decimals={0} sign className={s.statV} style={{ color: (view?.gain ?? 0) >= 0 ? 'var(--pos)' : 'var(--neg)' }} />
          <span className="faint">{view?.gainPct != null ? `${num(view.gainPct, 1)} % celkem` : '—'}</span></div>
        <div><span>Od minula</span><Money value={view?.changeSinceLast} currency={a.currency} decimals={0} sign className={s.statV}
          style={{ color: (view?.changeSinceLast ?? 0) >= 0 ? 'var(--pos)' : 'var(--neg)' }} /><span className="faint">{view?.prevDate ? `vs. ${dateShort(view.prevDate)}` : '—'}</span></div>
      </div>
      {N > 1 && (
        <div className="col" style={{ gap: 6 }}>
          <div className="row" style={{ gap: 16, fontSize: 12, color: 'var(--ink-2)' }}>
            <span className="row" style={{ gap: 6 }}><span style={{ width: 16, height: 3, background: 'var(--c3)' }} />Hodnota (ručně zadaná)</span>
            <span className="row" style={{ gap: 6 }}><span style={{ width: 16, borderTop: '2px dashed var(--ink-3)' }} />Vloženo celkem</span>
          </div>
          <svg width="100%" height={200} viewBox="0 0 640 200" preserveAspectRatio="none" style={{ overflow: 'visible' }}>
            <path d={gap} style={{ fill: 'color-mix(in oklch, var(--c3) 14%, transparent)' }} />
            <path d={dp} fill="none" strokeDasharray="5 4" style={{ stroke: 'var(--ink-3)', strokeWidth: 2 }} vectorEffect="non-scaling-stroke" />
            <path d={vp} fill="none" style={{ stroke: 'var(--c3)', strokeWidth: 2.5 }} vectorEffect="non-scaling-stroke" />
          </svg>
          <div className="row" style={{ justifyContent: 'space-between', fontSize: 11, color: 'var(--ink-3)' }}>
            {h.filter((_, i) => i % Math.ceil(N / 7) === 0 || i === N - 1).map((p) => <span key={p.date}>{dateShort(p.date)}</span>)}
          </div>
        </div>
      )}
      <div className={s.valueBox}>
        <span style={{ fontSize: 13, fontWeight: 800 }}>Zadat aktuální hodnotu portfolia</span>
        <div className={s.valueRow}>
          <Field label="Ke dni"><DateInput value={date} onChange={setDate} /></Field>
          <Field label={`Hodnota podle ${a.institution.name} (${a.currency})`}><NumberInput value={value} onChange={setValue} suffix={a.currency === 'EUR' ? '€' : a.currency === 'USD' ? '$' : 'Kč'} /></Field>
          <Button variant="primary" icon={<Check size={14} />} disabled={value == null || !date} loading={add.isPending} onClick={() => add.mutate()}>Uložit</Button>
        </div>
        <span className="muted" style={{ fontSize: 12 }}>
          {change != null ? `Změna proti ${view?.lastDate ? dateShort(view.lastDate) : 'minule'}: ${money(change, { currency: a.currency, decimals: 0, sign: true })} (${last ? `${change >= 0 ? '+' : '−'}${num(Math.abs((change / last) * 100), 1)} %` : '—'}). Graf vývoje a čisté jmění se přepočítají.`
            : 'Zadej hodnotu z aplikace brokera. Stahování cen z pozic připravujeme.'}
        </span>
      </div>
      {(view?.positions.length ?? 0) > 0 && (
        <div className="col" style={{ gap: 0 }}>
          <div className={clsx(s.pos, s.posHead)}><span>Pozice (z evidovaných obchodů)</span><span>Kusů</span><span>Cena</span><span>Hodnota</span><span>Podíl</span></div>
          {view!.positions.map((p) => (
            <div key={p.ticker} className={s.pos}>
              <span className="row" style={{ gap: 8, minWidth: 0 }}><b>{p.ticker}</b><span className="faint ellipsis">{p.name}</span></span>
              <span>{num(p.quantity, p.quantity % 1 ? 3 : 0)}</span>
              <span className="muted">{money(p.lastPrice, { currency: p.currency })}</span>
              <Money value={p.value} currency={p.currency} decimals={0} style={{ fontWeight: 700 }} />
              <span className="faint">{last ? pct((p.value / last) * 100) : '—'}</span>
            </div>
          ))}
          <div className={s.pos}><span className="row" style={{ gap: 8 }}><b>Hotovost</b><span className="faint">a nepokryté</span></span><span /><span />
            <Money value={view!.cash} currency={a.currency} decimals={0} style={{ fontWeight: 700 }} /><span /></div>
        </div>
      )}
    </>
  )
}

function Trades({ account: a, view }: { account: Account; view?: InvestmentAccountView }) {
  const money = useMoney()
  const qc = useQueryClient()
  const { household } = useUi()
  const [open, setOpen] = useState(false)
  const tickers = [...new Set((view?.positions ?? []).map((p) => p.ticker))]
  const [side, setSide] = useState<'Buy' | 'Sell'>('Buy')
  const [ticker, setTicker] = useState('')
  const [qty, setQty] = useState<number | null>(null)
  const [price, setPrice] = useState<number | null>(null)
  const [date, setDate] = useState<string | null>(household.today)
  const invalidate = () => (qc.invalidateQueries({ queryKey: ['investments'] }), qc.invalidateQueries({ queryKey: ['net-worth'] }))
  const add = useMutation({
    mutationFn: () => api.post('/api/investments/trades', { accountId: a.id, date, side, ticker, quantity: qty, price, currency: a.currency }),
    onSuccess: () => (notifyOk('Obchod uložen'), setOpen(false), setQty(null), invalidate()),
    onError: notifyError,
  })
  const del = useMutation({ mutationFn: (id: number) => api.del(`/api/investments/trades/${id}`), onSuccess: invalidate, onError: notifyError })
  const rate = household.rates[a.currency] ?? 1
  return (
    <Card pad={false} style={{ overflow: 'hidden' }}>
      <div className="row" style={{ padding: '16px 18px 12px' }}>
        <span style={{ fontSize: 15, fontWeight: 800, flex: 1 }}>Nákupy a prodeje</span>
        <Button size="sm" variant={open ? 'dark' : 'secondary'} icon={<Plus size={14} />} onClick={() => setOpen(!open)}>Přidat obchod</Button>
      </div>
      {open && (
        <div className={s.tradeForm}>
          <Segmented full size="sm" value={side} onChange={setSide} options={[{ value: 'Buy', label: 'Nákup' }, { value: 'Sell', label: 'Prodej' }]} />
          <div className="row wrap" style={{ gap: 6 }}>
            {tickers.map((t) => <button key={t} type="button" className={clsx(s.chip, t === ticker && s.chipOn)} onClick={() => setTicker(t)}>{t}</button>)}
            <TextInput value={ticker} placeholder="Ticker (VWCE)" onChange={(e) => setTicker(e.target.value.toUpperCase())} style={{ width: 130, height: 32 }} />
          </div>
          <div className="row" style={{ gap: 8 }}>
            <Field label="Kusů" className="grow"><NumberInput value={qty} onChange={setQty} decimals={4} /></Field>
            <Field label="Cena za kus" className="grow"><NumberInput value={price} onChange={setPrice} suffix={a.currency === 'EUR' ? '€' : a.currency === 'USD' ? '$' : 'Kč'} /></Field>
          </div>
          <Field label="Datum"><DateInput value={date} onChange={setDate} /></Field>
          <div className="row" style={{ justifyContent: 'space-between', fontSize: 13 }}>
            <span className="muted">Celkem</span>
            <b>{money((qty ?? 0) * (price ?? 0), { currency: a.currency })}{a.currency !== 'CZK' && ` ≈ ${money((qty ?? 0) * (price ?? 0) * rate)}`}</b>
          </div>
          <Button variant="dark" disabled={!ticker || !qty || !price || !date} loading={add.isPending} onClick={() => add.mutate()}>Uložit obchod</Button>
        </div>
      )}
      {(view?.trades ?? []).length === 0 && !open && <Empty title="Žádné obchody">Obchody jsou volitelné – stačí zadávat hodnotu portfolia.</Empty>}
      {(view?.trades ?? []).map((t) => (
        <div key={t.id} className={s.trade}>
          <div className={s.tradeRow}>
            <span className="faint" style={{ fontSize: 12 }}>{dateShort(t.date)}</span>
            <span className={s.side} style={{ background: `color-mix(in oklch, var(${t.side === 'Buy' ? '--c3' : '--c4'}) 16%, var(--surface))`, color: `var(${t.side === 'Buy' ? '--c3' : '--c4'})` }}>
              {t.side === 'Buy' ? 'Nákup' : 'Prodej'}
            </span>
            <span className="col" style={{ gap: 1, minWidth: 0 }}>
              <span style={{ fontSize: 14, fontWeight: 800 }}>{t.ticker} <span className="faint" style={{ fontSize: 12, fontWeight: 500 }}>{t.name}</span></span>
              <span className="faint" style={{ fontSize: 12 }}>{num(t.quantity, t.quantity % 1 ? 3 : 0)} ks × {money(t.price, { currency: t.currency })}</span>
            </span>
            <span className="col" style={{ alignItems: 'flex-end', gap: 1 }}>
              <Money value={t.total} currency={t.currency} decimals={2} sign style={{ fontSize: 14, fontWeight: 800 }} />
              {t.currency !== 'CZK' && <span className="faint" style={{ fontSize: 11 }}>≈ {money(Math.abs(t.total) * rate)}</span>}
            </span>
            <IconButton label="Smazat obchod" plain size="sm" onClick={() => del.mutate(t.id)}><Trash2 size={14} /></IconButton>
          </div>
          {t.linkedLabel && <span className="row" style={{ gap: 6, marginLeft: 58, fontSize: 11, color: 'var(--ink-2)' }}><Link2 size={12} color="var(--ink-3)" />{t.linkedLabel}</span>}
        </div>
      ))}
      <div className="faint" style={{ padding: '12px 18px', borderTop: '1px solid var(--line)', fontSize: 12, lineHeight: 1.5 }}>
        Obchody se nekategorizují a nezapočítávají do výdajů. Převod z běžného účtu na investiční je spárovaný s nákupem.
      </div>
    </Card>
  )
}
