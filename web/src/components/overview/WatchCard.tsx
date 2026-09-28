import { useAccounts } from '../../lib/accounts'
import { count, dateShort, monthNames, num, parseIso } from '../../lib/format'
import { accountWeight, useConditions, useForecast, usePayday, type ConditionStatus } from '../../lib/stats'
import { useUi } from '../../state/ui'
import { useMoney } from '../common'
import { Card } from '../ui'
import { Label, MoreLink, SectionHead } from './parts'
import s from './overview.module.css'

const joinCs = (xs: string[]) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} a ${xs[xs.length - 1]}`)

/** „Hlídání účtů“: co doplnit před výplatou (výhled pravidelných plateb) a plnění podmínek bank. */
export function WatchCard({ className }: { className?: string }) {
  const { member, household, hidden } = useUi()
  const money = useMoney()
  const { list, byId } = useAccounts()
  const payday = usePayday(member).data
  const days = payday?.payday ? Math.round((parseIso(payday.payday).getTime() - parseIso(household.today).getTime()) / 86_400_000) : 30
  const forecast = useForecast(Math.max(7, days)).data ?? []
  const conditions = useConditions(member).data

  const visible = new Set(list.filter((a) => !a.archived && accountWeight(a, member) > 0).map((a) => a.id))
  const fc = forecast.filter((f) => visible.has(f.accountId))
  const low = fc.filter((f) => f.low)
  const ok = fc.filter((f) => !f.low && byId.get(f.accountId)?.kind === 'Current').map((f) => byId.get(f.accountId)?.name ?? '')
  const untilLabel = payday?.payday ? `před výplatou ${dateShort(payday.payday)}` : 'v příštích 30 dnech'

  return (
    <Card className={className}>
      <SectionHead title="Hlídání účtů"><MoreLink to="/ucty" chevron={false}>Účty</MoreLink></SectionHead>
      <div className="col" style={{ gap: 0 }}>
        <Label faint style={{ paddingBottom: 6 }}>Doplnit {untilLabel}</Label>
        {low.map((f) => {
          const a = byId.get(f.accountId)
          return (
            <div key={f.accountId} className={s.watchRow}>
              <span className={s.dot10} style={{ background: 'var(--neg)' }} />
              <div className="col" style={{ gap: 1, minWidth: 0 }}>
                <span className="ellipsis" style={{ fontSize: 14, fontWeight: 700 }}>{a?.name ?? 'Účet'}</span>
                <span className="faint" style={{ fontSize: 12, lineHeight: 1.35 }}>
                  Klesne na {money(f.min, { currency: f.currency })} {dateShort(f.minDate)}{f.limit != null && ` · limit ${money(f.limit, { currency: f.currency })}`}
                </span>
              </div>
              <div className={s.amountCol}>
                <span className="num" style={{ fontSize: 14, fontWeight: 800, color: 'var(--neg)' }}>+{money(f.topUp, { currency: f.currency })}</span>
                {f.topUpBy && <span className="faint" style={{ fontSize: 11, whiteSpace: 'nowrap' }}>do {dateShort(f.topUpBy)}</span>}
              </div>
            </div>
          )
        })}
        {low.length === 0 && <span className={s.watchOk}>Všechny účty vystačí do výplaty</span>}
        {ok.length > 0 && low.length > 0 && (
          <span className={s.watchNote}>{joinCs(ok)} vystačí do další výplaty i s pravidelnými platbami.</span>
        )}
      </div>
      {conditions && conditions.total > 0 && (
        <div className={s.conditions}>
          <div className={s.rowBetween}>
            <Label faint>Podmínky účtů · {monthNames[parseIso(conditions.items[0].periodEnd).getMonth()]}</Label>
            <span className="faint" style={{ fontSize: 12 }}>{conditions.daysLeft > 0 ? `zbývá ${count(conditions.daysLeft, 'den', 'dny', 'dní')}` : 'poslední den'}</span>
          </div>
          {conditions.items.map((c) => <ConditionRow key={c.conditionId} c={c} accountName={byId.get(c.accountId)?.name ?? '?'} currency={byId.get(c.accountId)?.currency ?? 'CZK'} hidden={hidden} />)}
        </div>
      )}
    </Card>
  )
}

function ConditionRow({ c, accountName, currency, hidden }: { c: ConditionStatus; accountName: string; currency: string; hidden: boolean }) {
  const money = useMoney()
  const met = c.state === 'Met'
  const p = c.target > 0 ? Math.min(1, c.current / c.target) : 1
  const fg = met ? 'var(--pos)' : p >= 0.55 ? 'var(--warn)' : 'var(--neg)'
  const cards = c.type === 'CardCount'
  const label = c.type === 'IncomingSum' ? `Příchozí platby ≥ ${money(c.target, { currency })}` : cards ? `Plateb kartou ≥ ${num(c.target)}` : `Průměrný zůstatek ≥ ${money(c.target, { currency })}`
  const progress = cards ? `${num(c.current)} / ${num(c.target)}` : `${hidden ? '•••' : num(c.current)} / ${money(c.target, { currency })}`
  const missing = cards ? count(Math.ceil(c.missing), 'platba', 'platby', 'plateb') : money(c.missing, { currency })
  const status = met ? `Splněno${c.benefit ? ` · ${c.benefit}` : ''}` : `Chybí ${missing} do ${dateShort(c.periodEnd)}${c.benefit ? ` · jinak ${c.benefit}` : ''}`
  return (
    <div className="col" style={{ gap: 5 }}>
      <div className="row" style={{ alignItems: 'baseline', fontSize: 13 }}>
        <span className="ellipsis" style={{ flex: 1, fontWeight: 700 }}>{accountName}</span>
        <span className="num" style={{ fontWeight: 800, color: fg }}>{progress}</span>
      </div>
      <span style={{ fontSize: 13, color: 'var(--ink-2)', marginTop: -3 }}>{label}</span>
      <div className={s.condBar}><span style={{ width: `${Math.round(p * 100)}%`, background: fg }} /></div>
      <span style={{ fontSize: 12, lineHeight: 1.35, color: met ? 'var(--ink-3)' : 'var(--ink-2)' }}>{status}</span>
    </div>
  )
}
