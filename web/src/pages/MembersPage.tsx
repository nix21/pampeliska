import { useQuery } from '@tanstack/react-query'
import { Plus } from 'lucide-react'
import { useState } from 'react'
import { AccountForm } from '../components/accounts/AccountForm'
import { PageHeader } from '../components/AppShell'
import { PeriodPicker } from '../components/common'
import { JointAccountsCard, MemberExpensesCard } from '../components/household/cards'
import { AddMemberCard, MemberCard } from '../components/household/members'
import { Button } from '../components/ui'
import { useAccounts } from '../lib/accounts'
import { api, qs } from '../lib/api'
import { periodIn, useIsMobile, type MembersStats } from '../lib/household'
import type { Account } from '../lib/types'
import { useUi } from '../state/ui'
import s from './MembersPage.module.css'

export default function MembersPage() {
  const { household, period, confirmedOnly } = useUi()
  const mobile = useIsMobile()
  const accounts = useAccounts().list
  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState<{ account?: Account } | null>(null)
  const stats = useQuery({
    queryKey: ['stats', 'members', period.value, confirmedOnly],
    queryFn: () => api.get<MembersStats>(`/api/stats/members${qs({ period: period.value, confirmedOnly: confirmedOnly || undefined })}`),
  })
  const periodText = periodIn(period, household.today)

  return (
    <>
      <PageHeader title="Členové" subtitle={`${household.name} · všichni členové vidí a upravují vše · jak se dělí společné účty`}
        actions={!mobile && <Button variant="primary" icon={<Plus size={16} />} onClick={() => setAdding((v) => !v)}>Přidat člena</Button>}
        tools={<PeriodPicker allowCompare={false} compact={mobile} />} />

      <div className={s.members}>
        {household.members.map((m) => (
          <MemberCard key={m.id} member={m} stat={stats.data?.members.find((x) => x.memberId === m.id)} accounts={accounts} periodText={periodText} />
        ))}
        {adding && <AddMemberCard onDone={() => setAdding(false)} />}
      </div>
      {mobile && !adding && (
        <button type="button" className={s.addMobile} onClick={() => setAdding(true)}><Plus size={16} /> Přidat člena</button>
      )}

      <div className={s.cards}>
        <JointAccountsCard accounts={accounts} onEdit={(a) => setForm({ account: a })} onAdd={() => setForm({})} />
        <MemberExpensesCard stats={stats.data} loading={stats.isLoading} periodText={periodText} />
      </div>

      <AccountForm open={!!form} account={form?.account} kind="Current" jointDefault onClose={() => setForm(null)} />
    </>
  )
}
