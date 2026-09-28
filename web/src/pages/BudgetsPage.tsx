import { Plus, Target } from 'lucide-react'
import { useEffect, useState, useSyncExternalStore } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { PageHeader } from '../components/AppShell'
import { AddBudgetDialog } from '../components/budgets/AddBudgetDialog'
import { Legend, MonthSwitcher } from '../components/budgets/BudgetBar'
import { BudgetDetail } from '../components/budgets/BudgetDetail'
import { BudgetSummary } from '../components/budgets/BudgetSummary'
import { MobileMonthly, MobileYearly, MonthlyTable, YearlyTable, type TableProps } from '../components/budgets/BudgetTable'
import { ConfirmedToggle, MemberSwitch } from '../components/common'
import { Button, Callout, Card, Empty, Segmented, Spinner } from '../components/ui'
import { isMonth, useBudgets, useLineTree, type BudgetOverview, type ColorBy } from '../lib/budgets'
import { useUi } from '../state/ui'
import s from './BudgetsPage.module.css'

const MOBILE = '(max-width: 767px)'
function useIsMobile() {
  return useSyncExternalStore(
    (cb) => {
      const m = matchMedia(MOBILE)
      m.addEventListener('change', cb)
      return () => m.removeEventListener('change', cb)
    },
    () => matchMedia(MOBILE).matches,
  )
}

const SUBTITLE = 'Rozpočty v Kč · výdaje v cizí měně se započítávají přepočtené kurzem ČNB ke dni platby'

function findLine(o: BudgetOverview | undefined, key: string | null) {
  if (!o || !key) return undefined
  const id = Number(key.slice(1))
  return (key[0] === 'y' ? o.yearly : key[0] === 'm' ? o.monthly : []).find((l) => l.categoryId === id)
}

/** Rozpočty: měsíční strom s čerpáním a tempem, roční rozpočty, detail s grafem a editorem limitu. Route /rozpocty. */
export default function BudgetsPage() {
  const { household, member, confirmedOnly } = useUi()
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()
  const location = useLocation()
  const mobile = useIsMobile()
  const [colorBy, setColorBy] = useState<ColorBy>('cat')
  const [adding, setAdding] = useState(false)

  const current = household.today.slice(0, 7)
  const raw = params.get('mesic')
  const month = isMonth(raw) && raw <= current ? raw : current
  const memberId = member === 'all' ? undefined : member
  const memberObj = memberId != null ? household.members.find((m) => m.id === memberId) ?? null : null

  const q = useBudgets(month, memberId, confirmedOnly)
  const data = q.data
  const { tops } = useLineTree(data?.monthly ?? [])

  const setParam = (key: string, value: string | null, push = false) =>
    setParams((p) => {
      const n = new URLSearchParams(p)
      if (value == null) n.delete(key)
      else n.set(key, value)
      return n
    }, { replace: !push })

  // Výběr: z URL (?k=m12 / y12); na desktopu jinak první hlavní řádek
  const selKey = params.get('k')
  const explicit = findLine(data, selKey)
  const fallbackKey = !mobile && data ? (tops[0] ? `m${tops[0].categoryId}` : data.yearly[0] ? `y${data.yearly[0].categoryId}` : null) : null
  const activeKey = explicit ? selKey : fallbackKey
  const selected = explicit ?? findLine(data, fallbackKey)

  const select = (key: string) => setParam('k', key, mobile)
  const back = () => (location.key !== 'default' ? navigate(-1) : setParam('k', null))

  useEffect(() => {
    if (mobile && explicit) window.scrollTo(0, 0)
  }, [mobile, explicit, selKey])

  const monthSub = !data || data.month !== month ? '…' : data.closed ? 'uzavřený měsíc' : `den ${data.day} z ${data.daysInMonth}`
  const switcher = (
    <MonthSwitcher month={month} current={current} sub={monthSub} onChange={(m) => setParam('mesic', m === current ? null : m)} />
  )

  const addDialog = (
    <AddBudgetDialog open={adding} onOpenChange={setAdding} member={memberObj} onCreated={(key) => setParam('k', key)} />
  )

  // Mobil: detail jako samostatná obrazovka
  if (mobile && data && explicit) {
    return (
      <div className={s.page}>
        <BudgetDetail line={explicit} overview={data} member={memberObj} month={month} onSelect={(k) => setParam('k', k, true)} onBack={back} mobile />
      </div>
    )
  }

  const header = (
    <PageHeader
      title="Rozpočty"
      subtitle={SUBTITLE}
      tools={<>
        {switcher}
        <MemberSwitch full={mobile} />
        <div className={s.desktopOnly}>
          <Segmented<ColorBy> aria-label="Barvy podle" value={colorBy} onChange={setColorBy} options={[
            { value: 'cat', label: 'Kategorie' },
            { value: 'need', label: 'Nezbytné / radost' },
          ]} />
        </div>
        <div className={s.desktopOnly}><ConfirmedToggle /></div>
        <Legend />
      </>}
    />
  )

  if (q.isError && !data) {
    return <div className={s.page}>{header}<Callout tone="danger">Rozpočty se nepodařilo načíst: {q.error instanceof Error ? q.error.message : String(q.error)}</Callout></div>
  }
  if (!data) return <div className={s.page}>{header}<Spinner center /></div>

  const empty = data.monthly.length === 0 && data.yearly.length === 0
  if (empty) {
    return (
      <div className={s.page}>
        {header}
        <Card>
          <Empty icon={<Target size={28} />} title="Zatím žádné rozpočty"
            action={<Button variant="dark" icon={<Plus size={16} />} onClick={() => setAdding(true)}>Přidat rozpočet</Button>}>
            Nastav limit pro kategorii – měsíční pro běžné výdaje, roční pro nepravidelné (dovolená, pojištění, dárky).
          </Empty>
        </Card>
        {addDialog}
      </div>
    )
  }

  const common: Omit<TableProps, 'lines' | 'pace'> = { selected: activeKey, onSelect: select, colorBy, member: memberObj, month, closed: data.closed }

  if (mobile) {
    return (
      <div className={s.page}>
        {header}
        <BudgetSummary overview={data} tops={tops} colorBy={colorBy} member={memberObj} mobile />
        {data.monthly.length > 0 && <MobileMonthly {...common} lines={data.monthly} pace={data.pace} />}
        {data.yearly.length > 0 && <MobileYearly {...common} lines={data.yearly} pace={data.yearPace} />}
        <Button variant="dashed" block icon={<Plus size={16} />} onClick={() => setAdding(true)}>Přidat rozpočet</Button>
        {addDialog}
      </div>
    )
  }

  return (
    <div className={s.page}>
      {header}
      <div className={s.content} style={{ opacity: q.isPlaceholderData ? 0.6 : 1 }}>
        <BudgetSummary overview={data} tops={tops} colorBy={colorBy} member={memberObj} />
        <div className={s.layout}>
          <div className={s.lists}>
            <MonthlyTable {...common} lines={data.monthly} pace={data.pace} onAdd={() => setAdding(true)} />
            {data.yearly.length > 0 && <YearlyTable {...common} lines={data.yearly} pace={data.yearPace} />}
          </div>
          {selected && <BudgetDetail line={selected} overview={data} member={memberObj} month={month} onSelect={select} />}
        </div>
      </div>
      {addDialog}
    </div>
  )
}
