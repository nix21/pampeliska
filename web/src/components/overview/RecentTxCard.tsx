import { useQuery } from '@tanstack/react-query'
import clsx from 'clsx'
import { ArrowLeftRight, ChevronDown, Repeat, Sparkles } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAccounts } from '../../lib/accounts'
import { api, qs } from '../../lib/api'
import { needLabel, useCategories } from '../../lib/categories'
import { count, dateShort, pct } from '../../lib/format'
import { needVar } from '../../lib/stats'
import type { TxPage, TxRow } from '../../lib/types'
import { useMembers, useUi } from '../../state/ui'
import { useEffectiveNeed } from '../category'
import { useMoney } from '../common'
import { Card } from '../ui'
import { MoreLink, NeedPill, SectionHead } from './parts'
import s from './overview.module.css'

const isTransfer = (t: TxRow) => t.kind === 'Transfer' || t.kind === 'InvestmentTransfer'

/** „Poslední pohyby“ – nejnovější pohyby (filtr člena), rozdělené platby jdou rozbalit. */
export function RecentTxCard({ mobile, className }: { mobile?: boolean; className?: string }) {
  const { member, confirmedOnly } = useUi()
  const members = useMembers()
  const { byId } = useAccounts()
  const cats = useCategories()
  const effNeed = useEffectiveNeed()
  const money = useMoney()
  const [open, setOpen] = useState<number | null>(null)
  const navigate = useNavigate()
  const take = mobile ? 5 : 7
  const params = { member: member === 'all' ? undefined : member, take, sort: 'DateDesc' }
  const q = useQuery({ queryKey: ['transactions', 'recent', params], queryFn: () => api.get<TxPage>(`/api/transactions${qs(params)}`) })
  const items = q.data?.items ?? []

  const who = (t: TxRow) => (t.shares.length > 1 ? 'společná' : members.get(t.shares[0]?.memberId ?? -1)?.name ?? '')
  const meta = (t: TxRow) => {
    const acc = byId.get(t.accountId)?.name ?? 'Účet'
    if (isTransfer(t) && t.transferPairAccountId) return `${acc} → ${byId.get(t.transferPairAccountId)?.name ?? '?'}`
    return [acc, who(t), t.isRecurring && 'pravidelná'].filter(Boolean).join(' · ')
  }

  const activate = (t: TxRow) => (t.splits.length ? setOpen(open === t.id ? null : t.id) : navigate(`/pohyby?id=${t.id}`))

  return (
    <Card className={className} style={{ gap: mobile ? 0 : 6 }}>
      <SectionHead title="Poslední pohyby"><MoreLink to="/pohyby" chevron={false}>{mobile ? 'Vše' : 'Všechny pohyby'}</MoreLink></SectionHead>
      <div style={{ height: mobile ? 8 : 6 }} />
      {q.data && items.length === 0 && <span className="faint" style={{ fontSize: 13 }}>Zatím žádné pohyby.</span>}
      {items.map((t) => {
        const split = t.splits.length > 0
        const transfer = isTransfer(t)
        const unconf = t.status === 'Suggested'
        const isOpen = split && open === t.id
        const foreign = t.currency !== 'CZK'
        const n = effNeed(t.categoryId, t.needOverride)
        const needShown = t.kind === 'Expense' && n.need !== 'None' && n.need !== 'Inherit'
        const parts = t.splits.map((p, i) => ({ key: i, color: cats.colorOf(p.categoryId), value: Math.abs(p.amountCzk), p }))
        const amount = (
          <div className={s.amountCol}>
            <span className="num" style={{ fontSize: 14, fontWeight: 700, color: t.amount > 0 ? 'var(--pos)' : transfer ? 'var(--ink-3)' : 'var(--ink)' }}>
              {foreign ? money(t.amount, { currency: t.currency, sign: t.amount > 0 }) : money(t.amountCzk, { sign: t.amount > 0 })}
            </span>
            {foreign && <span className={s.faintNum}>≈ {money(t.amountCzk)}</span>}
          </div>
        )
        const miniBar = (w: number, h: number) => (
          <span className={s.miniBar} style={{ width: w, height: h }}>{parts.map((p) => <span key={p.key} style={{ flex: p.value, background: p.color }} />)}</span>
        )
        return (
          <div key={t.id} className={s.txWrap}>
              <div className={clsx(mobile ? s.txRowMobile : s.txRow, s.clickable)} style={{ opacity: unconf && confirmedOnly ? 0.35 : transfer ? 0.75 : 1 }}
                role="button" tabIndex={0} title={split ? undefined : 'Otevřít v Pohybech'}
                onClick={() => activate(t)} onKeyDown={(e) => e.key === 'Enter' && activate(t)}>
                {!mobile && <span className={s.txDate}>{dateShort(t.date)}</span>}
                <div className="col" style={{ gap: mobile ? 4 : 2, minWidth: 0 }}>
                  <div className="row" style={{ gap: mobile ? 6 : 8, minWidth: 0 }}>
                    <span className="ellipsis" style={{ fontWeight: 600, fontSize: 14 }}>{t.counterparty}</span>
                    {unconf && !confirmedOnly && (mobile ? <span className={s.unconfDot} title="Nepotvrzeno" /> : <span className={s.unconfPill}>Nepotvrzeno</span>)}
                    {!mobile && unconf && t.categorySource === 'Ai' && t.aiConfidence != null && (
                      <span className={s.aiPill}><Sparkles size={11} /> AI {t.aiConfidence} %</span>
                    )}
                    {!mobile && t.isRecurring && <span title="Pravidelná platba" style={{ display: 'flex', color: 'var(--ink-3)' }}><Repeat size={13} /></span>}
                  </div>
                  {mobile ? (
                    <div className="row" style={{ gap: 6, fontSize: 12, color: 'var(--ink-3)', minWidth: 0 }}>
                      {split ? <>{miniBar(30, 6)}<span>Rozděleno · {count(parts.length, 'část', 'části', 'částí')}</span></>
                        : transfer ? <span>Převod · mimo statistiky</span>
                          : <><span className={s.dot7} style={{ background: cats.colorOf(t.categoryId) }} /><span className="ellipsis">{cats.nameOf(t.categoryId)}</span></>}
                      <span style={{ whiteSpace: 'nowrap' }}>· {dateShort(t.date)}</span>
                    </div>
                  ) : <span className="faint ellipsis" style={{ fontSize: 12 }}>{meta(t)}</span>}
                </div>
                {!mobile && (
                  <div className="row" style={{ gap: 8, minWidth: 0 }}>
                    {split ? (
                      <>
                        {miniBar(44, 8)}
                        <span style={{ fontSize: 13, color: 'var(--ink-2)', whiteSpace: 'nowrap' }}>Rozděleno · {count(parts.length, 'část', 'části', 'částí')}</span>
                        <ChevronDown size={18} color="var(--ink-3)" style={{ transform: isOpen ? 'rotate(180deg)' : undefined, transition: 'transform .18s' }} />
                      </>
                    ) : transfer ? (
                      <><ArrowLeftRight size={15} color="var(--ink-3)" /><span className="faint" style={{ fontSize: 13 }}>Převod · mimo statistiky</span></>
                    ) : (
                      <>
                        <span className={s.dot8} style={{ background: cats.colorOf(t.categoryId) }} />
                        <span className="ellipsis" style={{ fontSize: 13 }}>{cats.nameOf(t.categoryId)}</span>
                        {needShown && <NeedPill label={needLabel[n.need]} color={needVar(n.need)} />}
                      </>
                    )}
                  </div>
                )}
                {amount}
              </div>
              {isOpen && (
                <div className={mobile ? s.splitOpenMobile : s.splitOpen}>
                  {parts.map(({ key, p, color, value }) => {
                    const pn = effNeed(p.categoryId, p.needOverride)
                    return (
                      <div key={key} className={mobile ? s.splitPartMobile : s.splitPart}>
                        <span className={s.dot8} style={{ background: color }} />
                        <span className="ellipsis">{cats.nameOf(p.categoryId)}</span>
                        {!mobile && <NeedPill label={needLabel[pn.need === 'Inherit' ? 'None' : pn.need]} color={needVar(pn.need)} />}
                        <span className={s.faintNum} style={{ textAlign: 'right' }}>{pct((value / (Math.abs(t.amountCzk) || 1)) * 100)}</span>
                        <span className={s.strongNum} style={{ textAlign: 'right' }}>{money(-value)}</span>
                      </div>
                    )
                  })}
                </div>
              )}
          </div>
        )
      })}
    </Card>
  )
}
