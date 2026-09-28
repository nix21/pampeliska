import { useQuery } from '@tanstack/react-query'
import clsx from 'clsx'
import { Archive, ChevronDown, ChevronRight, Pencil, Plus } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { AccountDetail } from '../components/accounts/AccountDetail'
import { AccountForm } from '../components/accounts/AccountForm'
import { accountMembers, belongsTo, shortBank, syncText } from '../components/accounts/helpers'
import { PageHeader } from '../components/AppShell'
import { InstitutionBadge, MemberSwitch, Money, Sparkline, useMoney } from '../components/common'
import { Button, Card, Empty, Skeleton, tokenColor } from '../components/ui'
import { groupLabel } from '../lib/accounts'
import { api } from '../lib/api'
import { count, dateLong, num } from '../lib/format'
import { useIsMobile } from '../lib/household'
import type { Account, AccountGroup, AccountKind, Member } from '../lib/types'
import { useMembers, useUi } from '../state/ui'
import s from './AccountsPage.module.css'

const GROUPS: AccountGroup[] = ['Current', 'Savings', 'Foreign', 'Investment']

function parseKind(v: string | null): AccountKind {
  const k = (v ?? '').toLowerCase()
  if (k.startsWith('sav') || k === 'sporici') return 'Savings'
  if (k.startsWith('inv')) return 'Investment'
  return 'Current'
}

export default function AccountsPage() {
  const { household, member } = useUi()
  const members = useMembers()
  const fmt = useMoney()
  const mobile = useIsMobile()
  const nav = useNavigate()
  const { id: idParam } = useParams()
  const [params, setParams] = useSearchParams()
  // Otevřená korekce patří konkrétnímu účtu (při přepnutí účtu se zavře)
  const [korFor, setKorFor] = useState<number | null>(null)
  const [showArchived, setShowArchived] = useState(false)

  const all = useQuery({ queryKey: ['accounts', 'with-archived'], queryFn: () => api.get<Account[]>('/api/accounts?archived=true') })
  const list = useMemo(() => all.data ?? [], [all.data])
  const active = useMemo(() => list.filter((a) => !a.archived), [list])
  const archived = useMemo(() => list.filter((a) => a.archived), [list])
  const visible = useMemo(() => (member === 'all' ? active : active.filter((a) => belongsTo(a, member))), [active, member])

  const routeId = idParam ? Number(idParam) : undefined
  const selId = routeId ?? (mobile ? undefined : visible[0]?.id)
  const sel = list.find((a) => a.id === selId)

  const korOpen = korFor != null && korFor === selId
  const setKorOpen = (v: boolean) => setKorFor(v && selId != null ? selId : null)

  // Formulář: ?form=new[&type=…] / ?form=edit (vybraný účet)
  const form = params.get('form')
  const formKind = parseKind(params.get('type'))
  const savedId = useRef<number | null>(null)
  const closeForm = () => {
    // Nový účet: rovnou na jeho detail (bez ?form)
    if (savedId.current != null) {
      nav(`/ucty/${savedId.current}`, { replace: true })
      savedId.current = null
      return
    }
    const p = new URLSearchParams(params)
    p.delete('form')
    p.delete('type')
    setParams(p, { replace: true })
  }
  const openForm = (mode: 'new' | 'edit') => {
    const p = new URLSearchParams(params)
    p.set('form', mode)
    setParams(p)
  }
  const select = (a: Account) => nav(`/ucty/${a.id}`)

  const sumGroup = (g: AccountGroup) => visible.filter((a) => a.group === g).reduce((x, a) => x + a.balanceCzk, 0)
  const ofGroup = (g: AccountGroup) => visible.filter((a) => a.group === g)
  const savings = ofGroup('Savings')
  const foreign = ofGroup('Foreign')
  const totals = [
    { label: 'Běžné účty', value: fmt(sumGroup('Current')), note: ofGroup('Current').length ? `${count(ofGroup('Current').length, 'účet', 'účty', 'účtů')} v Kč` : 'žádný účet' },
    {
      label: 'Spořicí', value: fmt(sumGroup('Savings')),
      note: savings.length === 1 ? [savings[0].institution.name, savings[0].interestRate != null ? `${num(savings[0].interestRate, 1)} % p. a.` : null].filter(Boolean).join(' · ')
        : savings.length ? count(savings.length, 'účet', 'účty', 'účtů') : 'žádný účet',
    },
    { label: 'Cizí měny', value: `≈ ${fmt(sumGroup('Foreign'))}`, note: foreign.map((a) => fmt(a.balance, { currency: a.currency })).join(' · ') || '—' },
    { label: 'Investice', value: `≈ ${fmt(sumGroup('Investment'))}`, note: 'Detail v Investicích a jmění' },
  ]
  const grand = visible.filter((a) => a.group !== 'Investment').reduce((x, a) => x + a.balanceCzk, 0)

  const mobileDetail = mobile && !!sel
  const subtitle = `Zůstatky v měně účtu, souhrny přepočtené na Kč kurzem ČNB${household.ratesDate ? ` k ${dateLong(household.ratesDate)}` : ''}`

  return (
    <>
      {mobileDetail ? (
        <PageHeader title="Účty" back="/ucty"
          actions={<Button variant="secondary" icon={<Pencil size={16} />} onClick={() => openForm('edit')}>Upravit</Button>} />
      ) : (
        <PageHeader title="Účty" subtitle={subtitle}
          actions={!mobile && <Button variant="primary" icon={<Plus size={16} />} onClick={() => openForm('new')}>Přidat účet</Button>}
          tools={household.members.length > 1 ? <MemberSwitch full={mobile} /> : undefined} />
      )}

      {all.isLoading ? (
        <Skeleton height={320} />
      ) : active.length === 0 && !archived.length ? (
        <Card>
          <Empty title="Zatím žádné účty" action={<Button variant="primary" icon={<Plus size={16} />} onClick={() => openForm('new')}>Přidat účet</Button>}>
            Přidej běžné, spořicí i investiční účty. Pohyby pak do nich nahraje Claude přes MCP nebo je zadáš ručně.
          </Empty>
        </Card>
      ) : mobileDetail ? (
        <AccountDetail account={sel!} onEdit={() => openForm('edit')} korOpen={korOpen} setKorOpen={setKorOpen} />
      ) : (
        <>
          <div className={s.totals}>
            {totals.map((t) => (
              <div key={t.label} className={s.total}>
                <span className={s.totalLabel}>{t.label}</span>
                <span className={s.totalValue}>{t.value}</span>
                <span className={s.totalNote}>{t.note}</span>
              </div>
            ))}
          </div>
          <div className={s.grand}>
            <span style={{ fontSize: 13, color: 'var(--ink-2)' }}>Celkem na účtech</span>
            <span className={s.grandValue}>{fmt(grand)}</span>
            <span className="faint" style={{ fontSize: 12 }}>bez investic · investice ≈ {fmt(sumGroup('Investment'))}</span>
          </div>

          <div className={s.layout}>
            <div className="col" style={{ gap: 12, minWidth: 0 }}>
              <section className={s.list}>
                {GROUPS.map((g) => {
                  const rows = ofGroup(g)
                  if (!rows.length) return null
                  return (
                    <div key={g} className={s.group}>
                      <div className={s.groupHead}><span>{groupLabel[g]}</span><span className="num">≈ {fmt(sumGroup(g))}</span></div>
                      <div className={s.groupRows}>
                        {rows.map((a) => <AccountRow key={a.id} a={a} on={a.id === selId} members={members} onSelect={() => select(a)} />)}
                      </div>
                    </div>
                  )
                })}
                {visible.length === 0 && <Empty title="Žádný účet">Vybraný člen nemá vlastní ani společné účty.</Empty>}
              </section>
              {mobile && (
                <button type="button" className={s.addMobile} onClick={() => openForm('new')}><Plus size={16} /> Přidat účet</button>
              )}
              {archived.length > 0 && (
                <div className={s.archived}>
                  <button type="button" className={s.archivedToggle} onClick={() => setShowArchived((v) => !v)} aria-expanded={showArchived}>
                    <Archive size={15} /> Archivované účty ({archived.length}) {showArchived ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                  </button>
                  {showArchived && (
                    <section className={s.list}>
                      {archived.map((a) => <AccountRow key={a.id} a={a} on={a.id === selId} members={members} onSelect={() => select(a)} />)}
                    </section>
                  )}
                </div>
              )}
            </div>

            {!mobile && sel && (
              <aside className={s.detailPanel}>
                <AccountDetail account={sel} onEdit={() => openForm('edit')} korOpen={korOpen} setKorOpen={setKorOpen} />
              </aside>
            )}
          </div>
        </>
      )}

      <AccountForm
        open={form === 'new' || (form === 'edit' && !!sel)}
        account={form === 'edit' ? sel : undefined}
        kind={formKind}
        onClose={closeForm}
        onSaved={(a) => { if (form === 'new') savedId.current = a.id }}
        onBalanceAction={() => setKorOpen(true)}
      />
    </>
  )
}

function AccountRow({ a, on, members, onSelect }: { a: Account; on: boolean; members: Map<number, Member>; onSelect: () => void }) {
  const owners = accountMembers(a, members)
  return (
    <button type="button" className={clsx(s.row, on && s.rowOn, a.archived && s.rowArchived)} onClick={onSelect} aria-current={on || undefined}>
      <InstitutionBadge institution={a.institution} size={40} />
      <span className={s.rowMain}>
        <span className={s.rowTitle}>
          <span className={s.rowName}>{a.name}</span>
          <span className={clsx(s.cur, s.desktopOnly)}>{a.currency}</span>
          <span className={clsx(s.owners, s.desktopOnly)}>
            {owners.map((m) => <span key={m.id} className={s.ownerDot} style={{ background: tokenColor(m.colorToken) }} title={m.name}>{m.initials}</span>)}
          </span>
        </span>
        <span className={clsx(s.rowSub, s.desktopOnly)}>{a.institution.name} · {syncText(a)}</span>
        <span className={clsx(s.rowSub, s.mobileOnly)}>
          <span className={s.owners}>
            {owners.map((m) => <span key={m.id} className={s.ownerDot} style={{ background: tokenColor(m.colorToken) }}>{m.initials}</span>)}
          </span>
          <span style={{ paddingLeft: 4 }}>{shortBank(a)} · {a.currency}</span>
        </span>
      </span>
      <span className={s.desktopOnly}><Sparkline values={a.sparkline} width={70} height={28} /></span>
      <span className={s.rowBal}>
        <Money value={a.balance} currency={a.currency} className={s.rowBalValue} />
        {a.currency !== 'CZK' && <span className={s.rowCzk}>≈ <Money value={a.balanceCzk} /></span>}
      </span>
    </button>
  )
}
