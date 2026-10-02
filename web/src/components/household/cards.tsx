import { Pencil } from 'lucide-react'
import type { Account } from '../../lib/types'
import { useCategories } from '../../lib/categories'
import { num } from '../../lib/format'
import type { MembersStats } from '../../lib/household'
import { useUi } from '../../state/ui'
import { InstitutionBadge, useMoney } from '../common'
import { Button, Card, Empty, Skeleton, tokenColor } from '../ui'
import s from './household.module.css'

/** Společné účty a poměr, podle kterého se platby připíšou členům. Úprava otevře formulář účtu. */
export function JointAccountsCard({ accounts, onEdit, onAdd }: { accounts: Account[]; onEdit: (a: Account) => void; onAdd: () => void }) {
  const { household } = useUi()
  const fmt = useMoney()
  const joint = accounts.filter((a) => a.joint)
  const members = household.members
  return (
    <Card>
      <div className="col" style={{ gap: 3 }}>
        <span className={s.cardTitle}>Společné účty · komu se platba připíše</span>
        <span className="faint" style={{ fontSize: 12 }}>
          U vlastních účtů se člen určuje podle vlastníka. U společných podle poměru – na konkrétní platbě nebo pravidlem ho jde přebít.
        </span>
      </div>
      {joint.length === 0 && (
        <Empty title="Žádný společný účet" action={<Button variant="secondary" size="sm" onClick={onAdd}>Přidat společný účet</Button>}>
          Společný účet má víc členů a platby se dělí podle poměru.
        </Empty>
      )}
      {joint.map((a) => {
        const ratio = a.ratio.length ? a.ratio : members.map((m) => ({ memberId: m.id, percent: 100 / members.length }))
        const parts = ratio.filter((r) => r.percent > 0).map((r) => ({ ...r, m: members.find((x) => x.id === r.memberId) }))
        return (
          <div key={a.id} className={s.joint}>
            <div className="row" style={{ gap: 10 }}>
              <InstitutionBadge institution={a.institution} name={a.name} size={28} />
              <div className="col grow" style={{ gap: 1 }}>
                <span style={{ fontSize: 14, fontWeight: 700 }} className="ellipsis">{a.name}</span>
                <span className="faint" style={{ fontSize: 12 }}>{a.institution.name} · {a.currency} · {fmt(a.balance, { currency: a.currency })}</span>
              </div>
              <Button variant="ghost" size="sm" icon={<Pencil size={14} />} onClick={() => onEdit(a)}>
                <span className={s.desktopInline}>Upravit poměr</span><span className={s.mobileInline}>Upravit</span>
              </Button>
            </div>
            <div className={s.jointLegend}>
              {parts.map((p) => (
                <span key={p.memberId} className="row" style={{ gap: 6 }}>
                  <span className={s.legendSwatch} style={{ background: tokenColor(p.m?.colorToken) }} />
                  {p.m?.name ?? '?'} <b className="num">{num(p.percent, Number.isInteger(p.percent) ? 0 : 1)} %</b>
                </span>
              ))}
            </div>
            <div className={s.splitBar}>
              {parts.map((p) => <span key={p.memberId} style={{ flex: p.percent, background: tokenColor(p.m?.colorToken) }} />)}
            </div>
            <span className="faint" style={{ fontSize: 11 }}>
              {a.cardToHolder ? 'Platby kartou jdou držiteli karty, převody, inkasa a trvalé příkazy se dělí podle poměru.' : 'Každá platba se rozdělí podle poměru.'}
            </span>
          </div>
        )
      })}
    </Card>
  )
}

/** Výdaje podle hlavních kategorií rozdělené na členy (skládané pruhy). */
export function MemberExpensesCard({ stats, loading, periodText }: { stats?: MembersStats; loading: boolean; periodText: string }) {
  const { household } = useUi()
  const cats = useCategories()
  const fmt = useMoney()
  const rows = (stats?.byCategory ?? []).filter((c) => c.total > 0).slice(0, 8)
  const max = Math.max(1, ...rows.map((r) => r.total))
  return (
    <Card>
      <div className="row wrap" style={{ alignItems: 'baseline', justifyContent: 'space-between', gap: 6 }}>
        <span className={s.cardTitle}>Výdaje podle členů · {periodText}</span>
        <span className="faint" style={{ fontSize: 12 }}>včetně podílu ze společných</span>
      </div>
      <div className="row wrap" style={{ gap: 14, fontSize: 12, color: 'var(--ink-2)' }}>
        {household.members.map((m) => (
          <span key={m.id} className="row" style={{ gap: 6 }}><span className={s.legendSwatch} style={{ background: tokenColor(m.colorToken) }} />{m.name}</span>
        ))}
      </div>
      {loading && <Skeleton height={180} />}
      {!loading && rows.length === 0 && <span className="faint" style={{ fontSize: 13, padding: '12px 0' }}>V tomto období zatím žádné výdaje.</span>}
      {rows.map((r) => (
        <div key={r.categoryId} className={s.catRow}>
          <span className="row" style={{ gap: 6, minWidth: 0 }}>
            <span style={{ width: 8, height: 8, borderRadius: 9, flexShrink: 0, background: cats.colorOf(r.categoryId) }} />
            <span className="ellipsis">{cats.nameOf(r.categoryId)}</span>
          </span>
          <div className={s.catBar} style={{ width: `${(r.total / max) * 100}%` }}
            title={household.members.map((m) => `${m.name}: ${fmt(r.byMember[String(m.id)] ?? 0)}`).join(' · ')}>
            {household.members.map((m) => {
              const v = r.byMember[String(m.id)] ?? 0
              return v > 0 ? <span key={m.id} style={{ flex: v, background: tokenColor(m.colorToken) }} /> : null
            })}
          </div>
          <span className="num" style={{ textAlign: 'right', fontWeight: 700 }}>{fmt(r.total)}</span>
        </div>
      ))}
    </Card>
  )
}
