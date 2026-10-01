import { PageHeader } from '../components/AppShell'
import { useIsMobile } from '../components/charts'
import { MemberSwitch, PeriodPicker } from '../components/common'
import {
  AccountsCard, BudgetsCard, ConditionsKpi, DisposableCard, EatersCard, InboxCard, KpiCards, MobileSpentCard, NeedsCard, NetWorthCard,
} from '../components/overview/cards'
import { EmptyDashboard } from '../components/overview/EmptyDashboard'
import { RecentTxCard } from '../components/overview/RecentTxCard'
import { SpendingCard } from '../components/overview/SpendingCard'
import { WatchCard } from '../components/overview/WatchCard'
import s from '../components/overview/overview.module.css'
import { Spinner } from '../components/ui'
import { useAccounts } from '../lib/accounts'
import { relative } from '../lib/format'
import { useBatches, useOverviewStats } from '../lib/stats'
import { useMembers, useUi } from '../state/ui'

const SOURCE = { Mcp: 'MCP', Manual: 'ruční zadání', EnableBanking: 'banku' } as const

/** Přehled (dashboard): zůstatek, jmění, KPI, kam peníze odlétají, rozpočty, hlídání účtů, poslední pohyby. */
export default function OverviewPage() {
  const { filterParams, member } = useUi()
  const members = useMembers()
  const mobile = useIsMobile()
  const accounts = useAccounts()
  const stats = useOverviewStats(filterParams).data
  const batch = useBatches().data?.[0]

  const name = member === 'all' ? '' : members.get(member)?.name ?? ''
  const subtitle = [
    member === 'all' ? 'Všechny účty · všichni členové' : `Účty a platby: ${name}, včetně podílu na společných`,
    batch && `poslední import ${relative(batch.createdAt)} přes ${SOURCE[batch.source]}`,
  ].filter(Boolean).join(' · ')

  const empty = !accounts.isLoading && accounts.list.reduce((sum, a) => sum + (a.transactionCount ?? 0), 0) === 0

  return (
    <>
      <PageHeader title="Přehled" subtitle={subtitle}
        tools={<><PeriodPicker compact={mobile} /><MemberSwitch full={mobile} /></>} />
      {accounts.isLoading ? <Spinner center /> : empty ? <EmptyDashboard /> : mobile ? (
        <div className={s.mobileStack}>
          <DisposableCard mobile />
          <MobileSpentCard stats={stats} />
          <InboxCard mobile />
          <SpendingCard stats={stats} mobile />
          <NeedsCard stats={stats} mobile />
          <BudgetsCard mobile />
          <WatchCard />
          <EatersCard stats={stats} mobile />
          <RecentTxCard mobile />
        </div>
      ) : (
        <>
          <div className={s.grid}>
            <DisposableCard className={s.s7} />
            <NetWorthCard className={s.s5} />
            <KpiCards stats={stats} className={s.s3} />
            <ConditionsKpi className={s.s3} />
          </div>
          <div className={s.grid}>
            <SpendingCard stats={stats} className={s.s8} />
            <div className={s.s4Stack}>
              <NeedsCard stats={stats} />
              <InboxCard />
            </div>
            <BudgetsCard className={s.s4} />
            <EatersCard stats={stats} className={s.s4} />
            <WatchCard className={s.s4} />
            <RecentTxCard className={s.s8} />
            <AccountsCard className={s.s4} />
          </div>
        </>
      )}
    </>
  )
}
