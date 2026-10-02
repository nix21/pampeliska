import { useMutation, useQueryClient } from '@tanstack/react-query'
import clsx from 'clsx'
import { MoreHorizontal, Pencil, UserMinus } from 'lucide-react'
import { useState } from 'react'
import { api, notifyError, notifyOk } from '../../lib/api'
import { count, pct, relative } from '../../lib/format'
import { MEMBER_COLORS, type MemberInput, type MemberStat } from '../../lib/household'
import type { Account, Member, MemberRole } from '../../lib/types'
import { useUi } from '../../state/ui'
import { shortBank } from '../accounts/helpers'
import { useMoney } from '../common'
import { Avatar, Button, Dialog, DropdownMenu, Field, IconButton, Segmented, TextInput, tokenColor } from '../ui'
import s from './household.module.css'

const invalidateMembers = (qc: ReturnType<typeof useQueryClient>) => {
  for (const k of [['household'], ['members'], ['me'], ['mcp-connections']]) qc.invalidateQueries({ queryKey: k })
}

const validEmail = (e: string) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e.trim())

/** Karta člena: role, příjmy/výdaje za období, účty. */
export function MemberCard({ member: m, stat, accounts, periodText }: {
  member: Member
  stat?: MemberStat
  accounts: Account[]
  periodText: string
}) {
  const { me } = useUi()
  const fmt = useMoney()
  const [editing, setEditing] = useState(false)
  const [removing, setRemoving] = useState(false)
  const isMe = me.memberId === m.id
  const invited = m.status === 'Invited'
  const role = isMe ? 'Ty' : invited ? 'Pozván' : 'Člen'
  const empty = !stat || (invited && stat.income === 0 && stat.expense === 0)
  const own = accounts.filter((a) => !a.joint && a.ownerMemberId === m.id)
  const joint = accounts.filter((a) => a.joint && (a.ratio.length === 0 || a.ratio.some((r) => r.memberId === m.id && r.percent > 0)))

  return (
    <section className={s.memberCard}>
      <div className={s.memberHead}>
        <Avatar name={m.name} color={m.colorToken} size={52} />
        <div className="col grow" style={{ gap: 2 }}>
          <span className={s.memberName}>{m.name}</span>
          <span className={clsx(s.memberMail, s.desktop)}>
            {m.email}{m.role === 'Owner' ? ' · vlastník' : ''}{invited ? ' · zatím se nepřihlásil' : m.lastLoginAt && !isMe ? ` · naposledy ${relative(m.lastLoginAt)}` : ''}
          </span>
          <span className={clsx(s.memberMail, s.mobile)}>{role} · {count(own.length + joint.length, 'účet', 'účty', 'účtů')}</span>
        </div>
        <span className={clsx(s.role, invited && s.roleInvited, s.desktop)}>{role}</span>
        <DropdownMenu
          trigger={<IconButton label={`Možnosti – ${m.name}`} plain size="sm"><MoreHorizontal size={18} /></IconButton>}
          items={[
            { label: 'Upravit člena', icon: <Pencil size={15} />, onSelect: () => setEditing(true) },
            ...(!isMe ? [{ label: 'Odebrat z domácnosti', icon: <UserMinus size={15} />, danger: true, onSelect: () => setRemoving(true) }] : []),
          ]}
        />
      </div>

      <div className={s.stats}>
        {empty ? (
          <>
            <Stat label={`Příjmy ${periodText}`} value="—" faint />
            <Stat label={`Výdaje ${periodText}`} value="—" faint />
          </>
        ) : (
          <>
            <Stat label={`Příjmy ${periodText}`} value={fmt(stat!.income)} color="var(--pos)" />
            <Stat label={`Výdaje ${periodText}`} value={fmt(stat!.expense)} />
            <Stat label="Podíl na příjmech" value={pct(stat!.incomeShare)} />
            <Stat label="Podíl na výdajích" value={pct(stat!.expenseShare)} />
          </>
        )}
      </div>
      {!empty && stat!.jointExpense > 0 && (
        <span className="faint" style={{ fontSize: 12, marginTop: -6 }}>
          vlastní {fmt(stat!.ownExpense)} · podíl ze společných {fmt(stat!.jointExpense)}
        </span>
      )}

      <div className={clsx('col', s.desktop)} style={{ gap: 6 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink-2)' }}>Účty</span>
        {own.length + joint.length === 0 ? (
          <span className="faint" style={{ fontSize: 12 }}>{invited ? 'Po přihlášení si může přidat vlastní účty.' : 'Zatím žádný účet.'}</span>
        ) : (
          <div className="row wrap" style={{ gap: 6 }}>
            {[...own, ...joint].map((a) => (
              <span key={a.id} className={clsx(s.acctChip, a.joint && s.acctChipJoint)} title={a.joint ? 'Společný účet' : 'Vlastní účet'}>
                {a.name}
                <span className="faint" style={{ fontWeight: 500 }}>
                  {shortBank(a)}{a.currency !== 'CZK' ? ` · ${a.currency}` : ''}
                </span>
              </span>
            ))}
          </div>
        )}
      </div>

      {editing && <MemberDialog member={m} onClose={() => setEditing(false)} />}
      {removing && <RemoveMemberDialog member={m} onClose={() => setRemoving(false)} />}
    </section>
  )
}

function Stat({ label, value, color, faint }: { label: string; value: string; color?: string; faint?: boolean }) {
  return (
    <div className={s.stat}>
      <span className={s.statLabel}>{label}</span>
      <span className={s.statValue} style={{ color: faint ? 'var(--ink-3)' : color }}>{value}</span>
    </div>
  )
}

function ColorPicker({ value, onChange, colors }: { value: string; onChange: (c: string) => void; colors: string[] }) {
  return (
    <div className="row wrap" style={{ gap: 8 }} role="radiogroup" aria-label="Barva">
      {colors.map((c) => (
        <button key={c} type="button" role="radio" aria-checked={value === c} aria-label={`Barva ${c}`} className={clsx(s.swatch, value === c && s.swatchOn)}
          style={{ background: tokenColor(c) }} onClick={() => onChange(c)} />
      ))}
    </div>
  )
}

/** Přidání člena: jméno + e-mail pro přihlášení Googlem. */
export function AddMemberCard({ onDone }: { onDone: () => void }) {
  const { household } = useUi()
  const qc = useQueryClient()
  const used = new Set(household.members.map((m) => m.colorToken))
  const free = MEMBER_COLORS.filter((c) => !used.has(c))
  const colors = (free.length >= 5 ? free : MEMBER_COLORS).slice(0, 6)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [color, setColor] = useState(colors[0])
  const add = useMutation({
    mutationFn: () => api.post<Member>('/api/members', { name: name.trim(), email: email.trim(), colorToken: color } satisfies MemberInput),
    onSuccess: (m) => {
      notifyOk(`${m.name} přidán(a). Přihlásí se Googlem na ${m.email}.`)
      invalidateMembers(qc)
      onDone()
    },
    onError: notifyError,
  })
  const valid = name.trim().length > 0 && validEmail(email)
  return (
    <section className={s.addCard}>
      <span style={{ fontSize: 15, fontWeight: 800 }}>Nový člen</span>
      <label className={s.addLabel}>Jméno
        <TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder="Např. Honza" autoFocus style={{ fontWeight: 700 }} />
      </label>
      <label className={s.addLabel}>E-mail pro přihlášení Googlem
        <TextInput type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="jmeno@gmail.com" style={{ fontWeight: 500 }} />
      </label>
      <div className="row" style={{ gap: 6 }}>
        <span style={{ fontSize: 12, color: 'var(--ink-3)', marginRight: 4 }}>Barva</span>
        <ColorPicker value={color} onChange={setColor} colors={colors} />
      </div>
      <span className="faint" style={{ fontSize: 12, lineHeight: 1.45 }}>
        Pošli mu odkaz na Pampelišku – přihlásí se Google účtem na tento e-mail. Všichni členové vidí a upravují vše.
      </span>
      <div className="row">
        <Button variant="dark" className="grow" disabled={!valid} loading={add.isPending} onClick={() => add.mutate()}>Přidat člena</Button>
        <Button variant="ghost" onClick={onDone}>Zrušit</Button>
      </div>
    </section>
  )
}

function MemberDialog({ member: m, onClose }: { member: Member; onClose: () => void }) {
  const qc = useQueryClient()
  const [name, setName] = useState(m.name)
  const [email, setEmail] = useState(m.email)
  const [color, setColor] = useState(m.colorToken)
  const [role, setRole] = useState<MemberRole>(m.role)
  const save = useMutation({
    mutationFn: () => api.put<Member>(`/api/members/${m.id}`, { name: name.trim(), email: email.trim(), colorToken: color, role } satisfies MemberInput),
    onSuccess: () => {
      notifyOk('Člen uložen')
      invalidateMembers(qc)
      onClose()
    },
    onError: notifyError,
  })
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title="Upravit člena" description="Změna e-mailu změní i Google účet, kterým se člen přihlašuje."
      footer={<>
        <span style={{ flex: 1 }} />
        <Button variant="secondary" onClick={onClose}>Zrušit</Button>
        <Button variant="primary" disabled={!name.trim() || !validEmail(email)} loading={save.isPending} onClick={() => save.mutate()}>Uložit</Button>
      </>}>
      <Field label="Jméno"><TextInput value={name} onChange={(e) => setName(e.target.value)} /></Field>
      <Field label="E-mail (Google)"><TextInput type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
      <div className="col" style={{ gap: 6 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink-2)' }}>Barva</span>
        <ColorPicker value={color} onChange={setColor} colors={MEMBER_COLORS} />
      </div>
      <div className="col" style={{ gap: 6 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink-2)' }}>Role</span>
        <Segmented<MemberRole> value={role} onChange={setRole} options={[{ value: 'Member', label: 'Člen' }, { value: 'Owner', label: 'Vlastník' }]} />
        <span className="faint" style={{ fontSize: 12 }}>Vlastník může navíc smazat všechna data domácnosti.</span>
      </div>
    </Dialog>
  )
}

function RemoveMemberDialog({ member: m, onClose }: { member: Member; onClose: () => void }) {
  const qc = useQueryClient()
  const remove = useMutation({
    mutationFn: () => api.del(`/api/members/${m.id}`),
    onSuccess: () => {
      notifyOk(`${m.name} odebrán(a) z domácnosti`)
      invalidateMembers(qc)
      onClose()
    },
    onError: notifyError,
  })
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title={`Odebrat ${m.name}?`}
      footer={<>
        <span style={{ flex: 1 }} />
        <Button variant="secondary" onClick={onClose}>Zpět</Button>
        <Button variant="danger" loading={remove.isPending} onClick={() => remove.mutate()}>Odebrat</Button>
      </>}>
      <span className="muted" style={{ fontSize: 14 }}>
        {m.name} ({m.email}) se už nebude moct přihlásit. Člen s vlastními účty nebo podíly na platbách odebrat nejde – nejdřív účty převeď na jiného člena.
      </span>
    </Dialog>
  )
}
