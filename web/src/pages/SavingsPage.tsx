import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import clsx from 'clsx'
import { Bell, Calendar, ChevronLeft, ChevronRight, EyeOff, List, Repeat, Scissors, Sparkles, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { PageHeader } from '../components/AppShell'
import { MemberSwitch, Money, useMoney } from '../components/common'
import { Button, Card, Empty, Spinner, tint } from '../components/ui'
import { useAccounts } from '../lib/accounts'
import { api, notifyError, notifyOk, qs } from '../lib/api'
import { useCategories } from '../lib/categories'
import { count, dateShort, monthGenitive, monthLocative, monthNamesCap, monthShort, num, pct } from '../lib/format'
import type { SavingsOverview, SavingTip, SavingTipStatus } from '../lib/planning'
import { useUi } from '../state/ui'
import s from './SavingsPage.module.css'

function monthKey(iso: string, delta: number) {
  const [y, m] = iso.split('-').map(Number)
  const d = new Date(y, m - 1 + delta, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export default function SavingsPage() {
  const { household, member, confirmedOnly } = useUi()
  const qc = useQueryClient()
  const money = useMoney()
  const cats = useCategories()
  const { byId: accounts } = useAccounts()
  const nowKey = household.today.slice(0, 7)
  const [month, setMonth] = useState(nowKey)
  const q = useQuery({
    queryKey: ['savings', month, member, confirmedOnly],
    queryFn: () => api.get<SavingsOverview>(`/api/savings${qs({ month, member: member === 'all' ? undefined : member, confirmedOnly: confirmedOnly || undefined })}`),
  })
  const data = q.data
  const [cancel, setCancel] = useState<Record<number, boolean>>({})
  useEffect(() => {
    if (data) setCancel(Object.fromEntries(data.subscriptions.filter((x) => x.markedToCancel).map((x) => [x.recurringId, true])))
  }, [data])
  const saved = useMemo(() => Object.fromEntries((data?.subscriptions ?? []).map((x) => [x.recurringId, x.markedToCancel])), [data])
  const save = useMutation({
    mutationFn: () => api.post('/api/savings/cancel-marks', {
      marks: Object.fromEntries((data?.subscriptions ?? []).map((x) => [x.recurringId, !!cancel[x.recurringId]])),
    }),
    onSuccess: () => (notifyOk('Uloženo jako připomínka ke zrušení'), qc.invalidateQueries({ queryKey: ['savings'] }), qc.invalidateQueries({ queryKey: ['recurring'] })),
    onError: notifyError,
  })

  const [y, m] = month.split('-').map(Number)
  const subs = data?.subscriptions ?? []
  const recYear = subs.reduce((a, x) => a + x.yearlyCzk, 0)
  const selected = subs.filter((x) => cancel[x.recurringId])
  const simYear = selected.reduce((a, x) => a + x.yearlyCzk, 0)
  const savedN = subs.filter((x) => x.markedToCancel).length
  const same = subs.every((x) => !!cancel[x.recurringId] === !!saved[x.recurringId])
  const maxY = subs[0]?.yearlyCzk ?? 1
  const who = (ownerId?: number) => (ownerId ? household.members.find((mm) => mm.id === ownerId)?.name : 'společné')

  // Výhled: beze změn vs. po zrušení
  const base = data?.outlook ?? []
  const sim = base.map((v, i) => v + (simYear / 12) * (i + 1))
  const all = [...base, ...sim]
  const mx = Math.max(...all, 1) * 1.05
  const mn = Math.min(...base, 0) * 0.85
  const X = (i: number) => ((i / Math.max(1, base.length - 1)) * 400).toFixed(1)
  const Y = (v: number) => (180 - ((v - mn) / (mx - mn || 1)) * 170).toFixed(1)
  const bp = base.map((v, i) => `${i ? 'L' : 'M'}${X(i)} ${Y(v)}`).join('')
  const sp = sim.map((v, i) => `${i ? 'L' : 'M'}${X(i)} ${Y(v)}`).join('')
  const gap = sp + [...base].reverse().map((v, j) => `L${X(base.length - 1 - j)} ${Y(v)}`).join('') + 'Z'

  const saveLabel = same && savedN ? `Uloženo ke zrušení (${savedN})` : selected.length ? `Uložit ke zrušení (${selected.length})` : 'Vyber položky ke zrušení'
  const canSave = selected.length > 0 && !same || (!same && savedN > 0)

  const monthPicker = (
    <div className={s.month}>
      <button type="button" aria-label="Předchozí měsíc" onClick={() => setMonth(monthKey(month, -1))}><ChevronLeft size={16} /></button>
      <span className={s.monthLabel}>
        <Calendar size={16} color="var(--ink-3)" />
        <span className="col" style={{ gap: 0 }}>
          <span style={{ fontSize: 14, fontWeight: 700 }}>{monthNamesCap[m - 1]} {y}</span>
          <span className="faint" style={{ fontSize: 11 }}>vs. průměr 6 měsíců</span>
        </span>
      </span>
      <button type="button" aria-label="Další měsíc" disabled={month >= nowKey} onClick={() => setMonth(monthKey(month, 1))}><ChevronRight size={16} /></button>
    </div>
  )

  return (
    <>
      <PageHeader title="Kde ušetřit" subtitle="Výdaje pro radost a pravidelná předplatná. Simulace nic nevypovídá, jen ukáže dopad."
        tools={<>{monthPicker}<MemberSwitch /></>} />
      {q.isLoading || !data ? <Spinner center /> : (
        <>
          <AiTips month={month} />

          <div className={s.kpis}>
            <Card>
              <span className={s.kpiLabel}><span className={s.joyDot} />Pro radost · {monthNamesCap[m - 1].toLowerCase()}</span>
              <Money value={data.joy} className={s.big} />
              <span className="muted" style={{ fontSize: 13 }}>{pct(data.joyShare)} všech výdajů · <b style={{ color: 'var(--ink)' }}>{money(data.joyYear)}</b> za rok při tomto tempu</span>
            </Card>
            <Card>
              <span className={s.kpiLabel}><Repeat size={16} /> Pravidelné pro radost</span>
              <span className={s.big}><Money value={recYear} /> <span className={s.per}>/ rok</span></span>
              <span className="muted" style={{ fontSize: 13 }}>{count(subs.length, 'položka', 'položky', 'položek')} · {money(recYear / 12)} měsíčně</span>
            </Card>
            <Card className={s.callout}>
              <span className={s.kpiLabel} style={{ color: 'var(--ink)', fontWeight: 700 }}><Scissors size={18} /> Co kdybych zrušil</span>
              <span className={s.big}><Money value={simYear} /> <span className={s.per}>/ rok</span></span>
              <span style={{ fontSize: 13 }}>{selected.length ? `${count(selected.length, 'položka vybrána', 'položky vybrány', 'položek vybráno')} · ${money(simYear / 12)} měsíčně` : 'Zapni přepínač u předplatného, které bys zrušil'}</span>
            </Card>
          </div>

          <div className={s.grid}>
            <Card pad={false} className={s.subsCard}>
              <div className="row" style={{ padding: '18px 20px 12px', alignItems: 'baseline' }}>
                <h2 style={{ flex: 1 }}>Předplatná a pravidelné výdaje pro radost</h2>
                <span className="faint" style={{ fontSize: 12 }}>Seřazeno podle roční částky</span>
              </div>
              <div className={clsx(s.subRow, s.subHead)}><span>Položka</span><span style={{ textAlign: 'right' }}>Měsíčně</span><span>Ročně</span><span>Další platba</span><span style={{ textAlign: 'right' }}>Zrušit?</span></div>
              {subs.length === 0 && <Empty title="Žádná předplatná pro radost">Pravidelné platby v kategoriích „pro radost“ se tu objeví samy.</Empty>}
              {subs.map((x) => {
                const on = !!cancel[x.recurringId]
                const color = x.categoryId ? cats.colorOf(x.categoryId) : 'var(--joy)'
                return (
                  <button key={x.recurringId} type="button" className={clsx(s.subRow, on && s.subOn)} onClick={() => setCancel({ ...cancel, [x.recurringId]: !on })}>
                    <span className="row" style={{ gap: 12, minWidth: 0 }}>
                      <span className={s.avatar} style={{ background: tint(color, 18), color }}>{x.name[0]?.toUpperCase()}</span>
                      <span className="col grow" style={{ gap: 2 }}>
                        <span className="row" style={{ gap: 6, minWidth: 0 }}>
                          <span className="ellipsis" style={{ fontSize: 14, fontWeight: 700, textDecoration: on ? 'line-through' : undefined, color: on ? 'var(--ink-2)' : undefined }}>{x.name}</span>
                          {x.markedToCancel && <span className={s.saved}><Bell size={11} /> Ke zrušení</span>}
                        </span>
                        <span className="ellipsis faint" style={{ fontSize: 12 }}>{cats.nameOf(x.categoryId)} · {accounts.get(x.accountId)?.name} · {who(x.ownerMemberId)}</span>
                      </span>
                    </span>
                    <span className="col" style={{ alignItems: 'flex-end', gap: 1 }}>
                      <Money value={x.monthlyCzk} style={{ fontSize: 14, fontWeight: 700 }} />
                      {x.currency !== 'CZK' ? <span className="faint" style={{ fontSize: 11 }}>{money(Math.abs(x.amount), { currency: x.currency })} {x.frequency === 'Yearly' ? 'ročně' : 'měsíčně'}</span>
                        : x.frequency === 'Yearly' ? <span className="faint" style={{ fontSize: 11 }}>platba 1× ročně</span> : null}
                    </span>
                    <span className="col" style={{ gap: 5 }}>
                      <Money value={x.yearlyCzk} style={{ fontSize: 14, fontWeight: 600 }} />
                      <span className={s.bar}><span style={{ width: `${(x.yearlyCzk / maxY) * 100}%`, background: on ? 'var(--pos)' : 'var(--joy)' }} /></span>
                    </span>
                    <span className="muted" style={{ fontSize: 13 }}>{dateShort(x.nextDue)}</span>
                    <span className={clsx(s.toggle, on && s.toggleOn)}><span /></span>
                  </button>
                )
              })}
              <div className={s.foot}>
                <span className="faint grow" style={{ fontSize: 12, lineHeight: 1.5 }}>Ceny v cizí měně přepočteny kurzem ČNB. „Ke zrušení“ je jen připomínka, aplikace nic nevypovídá.</span>
                {selected.length > 0 && <Button variant="ghost" onClick={() => setCancel({})}>Zrušit výběr</Button>}
                <Button variant={canSave ? 'primary' : 'secondary'} icon={<Bell size={14} />} disabled={!canSave} loading={save.isPending} onClick={() => save.mutate()}>{saveLabel}</Button>
              </div>
            </Card>

            <div className="col" style={{ gap: 'var(--gap)' }}>
              <Card>
                <div className="row" style={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <h2>Výhled zůstatku</h2>
                  <span className="faint" style={{ fontSize: 12 }}>disponibilní účty · 12 měsíců</span>
                </div>
                <div className="row" style={{ gap: 16, fontSize: 12, color: 'var(--ink-2)' }}>
                  <span className="row" style={{ gap: 6 }}><span style={{ width: 16, height: 2, background: 'var(--ink-3)' }} />Beze změn</span>
                  <span className="row" style={{ gap: 6 }}><span style={{ width: 16, height: 3, background: 'var(--pos)' }} />Po zrušení</span>
                </div>
                <svg width="100%" height={190} viewBox="0 0 400 190" preserveAspectRatio="none" style={{ overflow: 'visible' }}>
                  <path d={gap} style={{ fill: 'color-mix(in oklch, var(--pos) 14%, transparent)' }} />
                  <path d={bp} fill="none" style={{ stroke: 'var(--ink-3)', strokeWidth: 2 }} vectorEffect="non-scaling-stroke" />
                  <path d={sp} fill="none" style={{ stroke: 'var(--pos)', strokeWidth: 2.5 }} vectorEffect="non-scaling-stroke" />
                </svg>
                <div className="row" style={{ justifyContent: 'space-between', fontSize: 11, color: 'var(--ink-3)' }}>
                  {[1, 4, 7, 10, 12].map((i) => <span key={i}>{monthShort[(m - 1 + i) % 12]}</span>)}
                </div>
                <div className={s.twoStats}>
                  <div><span className="faint" style={{ fontSize: 11 }}>Za 12 měsíců beze změn</span><Money value={base[base.length - 1]} style={{ fontSize: 16, fontWeight: 800 }} /></div>
                  <div style={{ background: 'color-mix(in oklch, var(--pos) 12%, var(--surface))' }}>
                    <span className="faint" style={{ fontSize: 11 }}>Po zrušení</span>
                    <Money value={sim[sim.length - 1]} style={{ fontSize: 16, fontWeight: 800, color: 'var(--pos)' }} />
                  </div>
                </div>
                <span className="faint" style={{ fontSize: 11 }}>Průměrná měsíční bilance posledních 3 měsíců {money(data.monthlyNet, { sign: true })}.</span>
              </Card>

              <Card>
                <div className="row" style={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <h2>Podíl pro radost</h2>
                  <span className="faint" style={{ fontSize: 12 }}>průměr {pct(data.averageShare, 1)}</span>
                </div>
                <div className={s.hist}>
                  <span className={s.avgLine} style={{ bottom: `${Math.min(100, data.averageShare * 2.4)}px` }} />
                  {data.history.map((h) => {
                    const cur = h.month === month
                    return (
                      <button key={h.month} type="button" className={s.histCol} onClick={() => setMonth(h.month)}>
                        <span style={{ fontSize: 11, fontWeight: 700, color: cur ? 'var(--ink)' : 'var(--ink-3)' }}>{num(h.share)} %</span>
                        <span className={s.histBar} style={{ height: `${Math.max(2, h.share * 2.4)}px`, background: cur ? 'var(--joy)' : 'color-mix(in oklch, var(--joy) 35%, var(--surface-2))' }} />
                        <span style={{ fontSize: 11, fontWeight: cur ? 800 : 500, color: cur ? 'var(--ink)' : 'var(--ink-3)' }}>{monthShort[Number(h.month.slice(5)) - 1]}</span>
                      </button>
                    )
                  })}
                </div>
                <div className="col" style={{ gap: 8, paddingTop: 12, borderTop: '1px solid var(--line)' }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink-2)' }}>Nejvíc radosti v {monthLocative[m - 1]}</span>
                  {data.topJoy.length === 0 && <span className="faint" style={{ fontSize: 13 }}>Žádné výdaje pro radost.</span>}
                  {data.topJoy.map((t) => {
                    const d = t.average > 0 ? t.amount / t.average - 1 : 0
                    return (
                      <div key={t.categoryId} className={s.topRow}>
                        <span style={{ width: 8, height: 8, borderRadius: 9, background: cats.colorOf(t.categoryId) }} />
                        <span className="ellipsis">{cats.nameOf(t.categoryId)}</span>
                        <Money value={t.amount} style={{ fontWeight: 700 }} />
                        <span style={{ fontSize: 12, fontWeight: 600, textAlign: 'right', color: d > 0.1 ? 'var(--neg)' : d < -0.1 ? 'var(--pos)' : 'var(--ink-3)' }}>
                          {t.average > 0 ? `${d >= 0 ? '+' : '−'}${num(Math.abs(d * 100))} %` : 'nové'}
                        </span>
                      </div>
                    )
                  })}
                  <span className="faint" style={{ fontSize: 11 }}>Změna proti průměru posledních 6 měsíců</span>
                </div>
              </Card>
            </div>
          </div>
          <div className={s.mobileBar}>
            <Button block size="lg" variant={canSave ? 'primary' : 'secondary'} icon={<Bell size={16} />} disabled={!canSave} onClick={() => save.mutate()}>{saveLabel}</Button>
          </div>
        </>
      )}
    </>
  )
}

type Archive = 'Hidden' | 'Rejected'

/** Rady od AI (přidává je AI přes MCP). Platí od svého měsíce dál, dokud je uživatel neskryje nebo neodmítne. */
function AiTips({ month }: { month: string }) {
  const { member } = useUi()
  const qc = useQueryClient()
  const money = useMoney()
  const navigate = useNavigate()
  const [arch, setArch] = useState<Archive | null>(null)
  const q = useQuery({ queryKey: ['saving-tips'], queryFn: () => api.get<SavingTip[]>('/api/savings/tips') })
  const setStatus = useMutation({
    mutationFn: ({ id, status }: { id: number; status: SavingTipStatus }) => api.post(`/api/savings/tips/${id}/status`, { status }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['saving-tips'] }),
    onError: notifyError,
  })

  const all = (q.data ?? []).filter((t) => member === 'all' || t.memberId == null || t.memberId === member)
  const active = all.filter((t) => t.status === 'Active' && t.since.slice(0, 7) <= month)
  const shown = arch ? all.filter((t) => t.status === arch) : active
  const nHidden = all.filter((t) => t.status === 'Hidden').length
  const nRejected = all.filter((t) => t.status === 'Rejected').length
  const pot = active.reduce((a, t) => a + t.monthlySaving, 0)
  const [y, m] = month.split('-').map(Number)
  const tipsLabel = (n: number) => count(n, 'rada', 'rady', 'rad')

  /** null = nová v tomto měsíci */
  const age = (t: SavingTip) => {
    if (!arch && t.since.slice(0, 7) === month) return null
    const [ty, tm] = t.since.split('-').map(Number)
    return `Od ${monthGenitive[tm - 1]}${ty !== y ? ` ${ty}` : ''}`
  }
  const savingText = (t: SavingTip) => t.savingLabel ?? (t.monthlySaving > 0 ? `≈ ${money(t.monthlySaving)} / měs.` : null)
  const paymentsLink = (t: SavingTip) =>
    t.transactionIds.length ? `/pohyby?rada=${t.id}` : t.search ? `/pohyby?hledat=${encodeURIComponent(t.search)}` : null
  const chip = (k: Archive, label: string, n: number, title: string) => (
    <button type="button" className={clsx(s.archChip, arch === k && s.archChipOn)} title={title} aria-pressed={arch === k}
      onClick={() => setArch(arch === k ? null : k)}>
      {label}<span className={s.archCount}>{n}</span>
    </button>
  )

  return (
    <Card>
      <div className={s.tipsHead}>
        <span className={s.tipsIcon}><Sparkles size={18} /></span>
        <div className={clsx('col grow', s.tipsTitle)}>
          <h2>{arch === 'Hidden' ? 'Skryté rady' : arch === 'Rejected' ? 'Odmítnuté rady' : `Rady od AI · ${monthNamesCap[m - 1]} ${y}`}</h2>
          <span className="faint" style={{ fontSize: 12 }}>
            {arch ? `${tipsLabel(nHidden + nRejected)} mimo hlavní seznam` : (
              <>
                {tipsLabel(active.length)} z vašich pohybů
                <span className={s.desktopOnly}> za posledních 12 měsíců · rady se přenášejí do dalších měsíců, dokud je neskryjete</span>
              </>
            )}
          </span>
        </div>
        {!arch && pot > 0 && (
          <div className={s.tipsPot}>
            <span className={clsx('faint', s.desktopOnly)} style={{ fontSize: 12 }}>Možná úspora</span>
            <span className="num pos">≈ {money(pot)} / měs.</span>
          </div>
        )}
        <div className={s.archChips}>
          {chip('Hidden', 'Skryté', nHidden, 'Rady, které nechcete vidět. AI je dál považuje za platné.')}
          {chip('Rejected', 'Odmítnuté', nRejected, 'Rady, které AI už nebude nabízet.')}
        </div>
      </div>
      {arch && (
        <div className={s.archNote}>
          <span className="grow muted">
            {arch === 'Hidden' ? 'Skryté rady AI dál považuje za platné, jen je nezobrazuje. Vrácená rada se znovu objeví v aktuálním měsíci.'
              : 'Tyto rady ani podobné nové už AI nenabízí.'}
          </span>
          <button type="button" className={s.linkBtn} onClick={() => setArch(null)}>Zpět na rady</button>
        </div>
      )}
      {q.isLoading ? <Spinner center /> : (
        <div className={s.tips}>
          {shown.map((t) => {
            const a = age(t)
            const sv = savingText(t)
            const link = paymentsLink(t)
            const busy = setStatus.isPending && setStatus.variables?.id === t.id
            return (
              <article key={t.id} className={clsx(s.tip, arch && s.tipArch)}>
                <div className={s.tipTags}>
                  <span className={clsx(s.tag, !a && s.tagNew)}>{a ?? 'Nová'}</span>
                  <span className={s.tag}>{t.topic}</span>
                  {t.status !== 'Active' && <span className={clsx(s.tag, s.tagOutline)}>{t.status === 'Hidden' ? 'Skrytá' : 'AI už nenabízí'}</span>}
                  <span className="grow" />
                  {sv && <span className={clsx('num', s.tipSaving, t.monthlySaving > 0 && 'pos')}>{sv}</span>}
                </div>
                <span className={s.tipTitle}>{t.title}</span>
                <span className={s.tipBody}>{t.body}</span>
                {t.evidence && <span className={s.tipEvidence}><List size={14} /><span>Vychází z: {t.evidence}</span></span>}
                <div className={s.tipActions}>
                  {link && <button type="button" className={s.linkBtn} onClick={() => navigate(link)}>Ukázat platby</button>}
                  <span className="grow" />
                  {t.status !== 'Active' && (
                    <Button size="sm" disabled={busy} onClick={() => setStatus.mutate({ id: t.id, status: 'Active' })}>Vrátit mezi rady</Button>
                  )}
                  {t.status === 'Active' && (
                    <Button size="sm" icon={<EyeOff size={14} />} disabled={busy} onClick={() => setStatus.mutate({ id: t.id, status: 'Hidden' })}>Skrýt</Button>
                  )}
                  {t.status !== 'Rejected' && (
                    <Button size="sm" icon={<X size={14} />} disabled={busy} className={s.mutedBtn}
                      onClick={() => setStatus.mutate({ id: t.id, status: 'Rejected' })}>Už nenabízet</Button>
                  )}
                </div>
              </article>
            )
          })}
          {shown.length === 0 && (
            <div className={s.tipsEmpty}>
              {arch ? 'Nic tu není.'
                : (q.data ?? []).length === 0
                  ? 'AI zatím žádné rady nepřidala. Připojte ji přes MCP (Nastavení) a požádejte ji, ať projde vaše pohyby a najde, kde ušetřit.'
                  : 'Pro tento měsíc nemá AI žádné další rady.'}
            </div>
          )}
        </div>
      )}
    </Card>
  )
}
