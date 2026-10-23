import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import clsx from 'clsx'
import { Calendar, Clock, Repeat, SlidersHorizontal, Trash2, X } from 'lucide-react'
import { useRef, useState, type ReactNode } from 'react'
import { PageHeader } from '../components/AppShell'
import { MemberSwitch, useMoney } from '../components/common'
import { FutureMonth, OneOffsCard, PastMonth, type Editor, type Scope } from '../components/prediction/MonthPanel'
import { PredictionChart, type ChartModel } from '../components/prediction/PredictionChart'
import s from '../components/prediction/prediction.module.css'
import { Evaluation, SnapshotList } from '../components/prediction/Snapshots'
import { useMediaQuery } from '../components/charts/hooks'
import { Card, Segmented, Spinner } from '../components/ui'
import { api, notifyError, notifyOk, qs } from '../lib/api'
import { count, num } from '../lib/format'
import { useIsMobile } from '../lib/household'
import { colorVar, emptyScenario, leafIndex, monthDiff, monthInfo, type Prediction, type Scenario } from '../lib/prediction'
import { useUi } from '../state/ui'

const HORIZONS = [6, 12, 24, 36]

export default function PredictionPage() {
  const { member, hidden } = useUi()
  const qc = useQueryClient()
  const money = useMoney()
  const mobile = useIsMobile()
  // Úzké okno: panel měsíce pod grafem místo vedle
  const narrow = useMediaQuery('(max-width: 1100px)')
  const memberId = member === 'all' ? undefined : member
  const [horizon, setHorizon] = useState(12)
  const [avg, setAvg] = useState(6)
  const [selRaw, setSel] = useState(1)
  const [hist, setHist] = useState(false)
  const [snapId, setSnapId] = useState<number | null>(null)
  const [scope, setScope] = useState<Scope>('from')
  const [compare, setCompare] = useState(true)
  const [resTyping, setResTyping] = useState<string>()
  const [confirmReset, setConfirmReset] = useState(false)

  const key = ['prediction', horizon, memberId ?? 'all', avg]
  const q = useQuery({
    queryKey: key, queryFn: () => api.get<Prediction>(`/api/prediction${qs({ horizon, member: memberId, avg })}`), placeholderData: (prev) => prev,
  })
  const data = q.data

  // Úpravy scénáře: optimisticky do cache, odpověď s přepočtem nahradí data (starší odpovědi se zahodí)
  const seq = useRef(0)
  const saveScenario = useMutation({
    mutationFn: (sc: Scenario) => api.put<Prediction>(`/api/prediction/scenario${qs({ horizon, member: memberId, avg })}`, sc),
    onMutate: (sc) => {
      qc.setQueryData<Prediction>(key, (old) => old && { ...old, scenario: sc })
      return ++seq.current
    },
    onSuccess: (d, _sc, n) => {
      qc.invalidateQueries({ queryKey: ['prediction'], refetchType: 'none' })
      if (n === seq.current) qc.setQueryData(key, d)
    },
    onError: (e) => (notifyError(e), qc.invalidateQueries({ queryKey: ['prediction'] })),
  })
  const save = (sc: Scenario) => saveScenario.mutate(sc)
  const setReserve = useMutation({
    mutationFn: (reserve: number) => api.put('/api/prediction/reserve', { reserve }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['prediction'] }),
    onError: notifyError,
  })
  const saveSnap = useMutation({
    mutationFn: (name: string) => api.post<{ id: number }>('/api/prediction/snapshots', { name, horizon, avg }),
    onSuccess: () => (notifyOk('Predikce uložena'), qc.invalidateQueries({ queryKey: ['prediction'] })),
    onError: notifyError,
  })
  const delSnap = useMutation({
    mutationFn: (id: number) => api.del(`/api/prediction/snapshots/${id}`),
    onSuccess: (_d, id) => {
      if (snapId === id) setSnapId(null)
      qc.invalidateQueries({ queryKey: ['prediction'] })
    },
    onError: notifyError,
  })

  const subtitle = data
    ? data.dataMonths > 0
      ? `Z pravidelných plateb a průměru výdajů za ${count(data.dataMonths, 'měsíc', 'měsíce', 'měsíců').replace('1 měsíc', 'poslední měsíc')}`
      : 'Z pravidelných plateb – na průměr výdajů zatím chybí uzavřený měsíc'
    : undefined
  const header = <PageHeader title="Predikce" subtitle={subtitle} tools={<MemberSwitch full={mobile} />} />
  if (q.isLoading || !data) return <>{header}<Spinner center /></>

  const sc: Scenario = { ...emptyScenario(), ...data.scenario }
  const H = data.months.length
  const P = hist ? 6 : 0
  const sel = Math.max(-P, Math.min(selRaw, H - 1))
  const isPast = sel < 0
  const R = data.reserve
  const snap = hist ? data.snapshots.find((x) => x.id === snapId) ?? null : null
  const pick = (i: number) => setSel(Math.max(-P, Math.min(i, H - 1)))
  const nav = { prev: sel > -P ? () => pick(sel - 1) : undefined, next: sel < H - 1 ? () => pick(sel + 1) : undefined }

  const S = data.months
  const last = S[H - 1]
  const diff = last.balance - last.baseBalance
  let minI = 0
  S.forEach((p, i) => { if (p.balance < S[minI].balance) minI = i })
  const firstLow = S.findIndex((p) => p.balance < R)
  const lowNote = firstLow >= 0
    ? `Pod rezervou ${monthInfo(S[firstLow].month).loc} · ${money(S[firstLow].balance)}`
    : `Nejníž ${monthInfo(S[minI].month).loc} · ${money(S[minI].balance)}`
  const avgNet = S.reduce((a, p) => a + p.income + p.expense, 0) / H
  const avgB = S.reduce((a, p) => a + p.baseIncome + p.baseExpense, 0) / H
  const activeOnes = data.oneOffs.filter((o) => !o.skipped)

  const chartModel: ChartModel = {
    data, P, sel, reserve: R, compare, hidden, onPick: pick,
    plan: snap?.plan ? { start: snap.plan.start, savedMonth: snap.savedOn.slice(0, 7), months: snap.plan.months } : null,
  }
  const editor: Editor = { data, scenario: sc, sel: Math.max(0, sel), member: memberId, hidden, reserve: R, scope, setScope, avg, setAvg, save, ...nav }

  const reserveInput = (
    <label className={s.reserve} title="Minimální zůstatek, pod který nechcete klesnout">
      <span className={s.legendRes} />Rezerva
      <span className={s.reserveBox}>
        <input inputMode="numeric" aria-label="Rezerva" value={resTyping ?? (hidden ? '•••' : num(R))}
          onChange={(e) => setResTyping(e.target.value)}
          onBlur={() => {
            if (resTyping === undefined) return
            const n = parseInt(resTyping.replace(/\D/g, ''), 10)
            setResTyping(undefined)
            if (!isNaN(n) && n !== R) setReserve.mutate(n)
          }}
          onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }} />
        <span>Kč</span>
      </span>
    </label>
  )
  const histButton = (
    <button type="button" className={clsx(s.histBtn, hist && s.histOn)}
      title={hist ? 'Skrýt historii a uložené predikce' : 'Zobrazit posledních 6 měsíců skutečnosti a uložené predikce'}
      onClick={() => (setHist(!hist), setSel(Math.max(0, selRaw)))}>
      <Clock size={14} /> {mobile ? 'Historie a uložené predikce' : 'Historie'}
    </button>
  )
  const horizonSeg = (
    <Segmented<number> full={mobile} size="sm" aria-label="Horizont" value={horizon} onChange={setHorizon}
      options={HORIZONS.map((h) => ({ value: h, label: `${h} měs.` }))} />
  )
  const endKpi = (
    <div className="col" style={{ gap: 4, flex: 1, minWidth: 0 }}>
      <span className={s.kpiLabel}>Disponibilní zůstatek · {monthInfo(last.month).full}</span>
      <div className={s.kpiValue}>
        <span className={s.big}>{money(last.balance)}</span>
        {Math.abs(diff) >= 1 && (
          <span className={clsx(s.diffPill, diff >= 0 ? s.diffPos : s.diffNeg)}>{money(diff, { sign: true })}{mobile ? '' : ' oproti výchozí'}</span>
        )}
      </div>
    </div>
  )

  const chartCard = mobile ? (
    <Card className={s.chartCard}>
      {endKpi}
      {histButton}
      {horizonSeg}
      <PredictionChart m={chartModel} height={160} mobile />
      {reserveInput}
      <span className={s.lowNote} style={{ color: firstLow >= 0 ? 'var(--neg)' : 'var(--pos)' }}>{lowNote}</span>
    </Card>
  ) : (
    <Card className={s.chartCard}>
      <div className="row" style={{ alignItems: 'flex-start', gap: 16 }}>
        {endKpi}
        <div className="row" style={{ gap: 8 }}>{histButton}{horizonSeg}</div>
      </div>
      <div className={s.legend}>
        <span><span className={s.legendLine} />Scénář</span>
        <button type="button" className={s.legendBtn} style={{ opacity: compare ? 1 : 0.45 }} onClick={() => setCompare(!compare)}
          title="Zobrazit / skrýt výchozí predikci bez úprav">
          <span className={s.legendBase} />Výchozí
        </button>
        <span><span className={s.legendDiamond} />Jednorázová platba</span>
        {snap && <span><span className={s.legendSnap} />Uložená: {snap.name}</span>}
        {reserveInput}
      </div>
      <PredictionChart m={chartModel} />
    </Card>
  )

  const evaluation = snap && (
    <Evaluation data={data} snap={snap} sel={sel} hidden={hidden} onClose={() => setSnapId(null)}
      onPick={(i) => { if (i >= -P && i < H) pick(i) }} />
  )
  const snapshots = hist && (
    <SnapshotList data={data} selected={snap?.id ?? null} onSelect={setSnapId} saving={saveSnap.isPending}
      onSave={(name) => saveSnap.mutate(name)} onDelete={(id) => delSnap.mutate(id)} />
  )
  const stats = (
    <div className={s.stats}>
      <Card>
        <span className={s.statLabel}>Průměrně zbývá měsíčně</span>
        <span className={s.statValue} style={{ color: avgNet >= 0 ? 'var(--pos)' : 'var(--neg)' }}>{money(avgNet, { sign: true })}</span>
        <span className={s.statSub}>{Math.abs(avgNet - avgB) >= 1 ? `výchozí ${money(avgB, { sign: true })}` : 'po všech platbách a spoření'}</span>
      </Card>
      <Card>
        <span className={s.statLabel}>Nejnižší zůstatek</span>
        <span className={s.statValue} style={{ color: S[minI].balance < R ? 'var(--neg)' : undefined }}>{money(S[minI].balance)}</span>
        <span className={s.statSub}>na konci: {monthInfo(S[minI].month).full.toLowerCase()}</span>
      </Card>
      <Card>
        <span className={s.statLabel}>Jednorázové platby</span>
        <span className={s.statValue}>{money(activeOnes.reduce((a, o) => a + o.amount, 0))}</span>
        <span className={s.statSub}>za {H} měsíců · {count(activeOnes.length, 'položka', 'položky', 'položek')}</span>
      </Card>
    </div>
  )

  const scenarioList = (
    <ScenarioList data={data} sc={sc} save={save} pick={pick} confirm={confirmReset} setConfirm={setConfirmReset} mobile={mobile} />
  )
  const monthPanel = isPast ? (
    <PastMonth ed={{ data, ...nav }} i={sel} snapshotName={snap?.name} plan={snap?.plan} />
  ) : (
    <>
      <FutureMonth ed={editor} />
      <OneOffsCard ed={editor} />
    </>
  )

  return (
    <>
      {header}
      {mobile || narrow ? (
        <div className={s.mobileStack}>
          {chartCard}
          {monthPanel}
          {evaluation}
          {snapshots}
          {!mobile && stats}
          {scenarioList}
        </div>
      ) : (
        <div className={s.layout}>
          <div className={s.left}>
            {chartCard}
            {evaluation}
            {snapshots}
            {stats}
            {scenarioList}
          </div>
          <div className={s.right}>{monthPanel}</div>
        </div>
      )}
    </>
  )
}

/** Seznam všech úprav scénáře s odebráním a „Odstranit vše“. */
function ScenarioList({ data, sc, save, pick, confirm, setConfirm, mobile }: {
  data: Prediction
  sc: Scenario
  save: (sc: Scenario) => void
  pick: (i: number) => void
  confirm: boolean
  setConfirm: (v: boolean) => void
  mobile: boolean
}) {
  const money = useMoney()
  const M0 = data.months[0].month
  const H = data.months.length
  const leaves = leafIndex(data.tree)
  const idx = (ym: string) => Math.max(0, Math.min(H - 1, monthDiff(M0, ym)))
  const items: { key: string; title: string; meta: string; eff: number; perMonth: boolean; icon: ReactNode; color: string; month: string; remove: () => void }[] = []
  for (const c of sc.changes) {
    const l = leaves.get(c.key)
    if (!l) continue
    // „Původně“ = výchozí částka v prvním celém měsíci, kdy úprava platí
    const i = Math.max(idx(c.from), Math.min(1, H - 1))
    const added = sc.added.find((a) => `a${a.id}` === c.key)
    const orig = added ? Math.round(added.amount * l.leaf.share) : l.leaf.base[i]
    const now = Math.round(c.amount * l.leaf.share)
    items.push({
      key: c.id, title: `${l.path}: ${money(Math.abs(orig))} → ${money(Math.abs(now))}`,
      meta: c.to != null ? `jen ${monthInfo(c.from).loc}` : `od ${monthInfo(c.from).gen} dál`, eff: now - orig, perMonth: c.to == null,
      icon: <SlidersHorizontal size={16} />, color: l.color, month: c.from,
      remove: () => save({ ...sc, changes: sc.changes.filter((x) => x !== c) }),
    })
  }
  for (const a of sc.added) {
    const share = leaves.get(`a${a.id}`)?.leaf.share ?? 1
    items.push({
      key: a.id, title: `Nová: ${a.name}`, meta: `pravidelně od ${monthInfo(a.from).gen}`, eff: Math.round(a.amount * share), perMonth: true,
      icon: <Repeat size={16} />, color: 'accent', month: a.from,
      remove: () => save({ ...sc, added: sc.added.filter((x) => x !== a), changes: sc.changes.filter((c) => c.key !== `a${a.id}`) }),
    })
  }
  for (const o of data.oneOffs.filter((x) => x.kind === 'scenario')) {
    items.push({
      key: o.key, title: o.name, meta: `jednorázově ${monthInfo(o.month).loc}`, eff: o.amount, perMonth: false, icon: <Calendar size={16} />,
      color: 'accent', month: o.month, remove: () => save({ ...sc, oneOffs: sc.oneOffs.filter((x) => `o${x.id}` !== o.key) }),
    })
  }
  for (const o of data.oneOffs.filter((x) => x.skipped)) {
    items.push({
      key: o.key, title: `Vynecháno: ${o.name}`, meta: monthInfo(o.month).full, eff: -o.amount, perMonth: false, icon: <X size={16} />,
      color: 'ink-3', month: o.month, remove: () => save({ ...sc, skips: sc.skips.filter((k) => k !== o.key) }),
    })
  }
  const n = items.length
  const label = count(n, 'úpravu', 'úpravy', 'úprav')
  if (mobile && !n) return null

  return (
    <Card pad={false} className={s.scen}>
      <div className={s.snapsHead}>
        <h2>Úpravy scénáře</h2>
        <span className="row" style={{ gap: 14 }}>
          <span className="faint" style={{ fontSize: 12 }}>{label}</span>
          {n > 0 && !confirm && (
            <button type="button" className={s.resetAll} onClick={() => setConfirm(true)}><Trash2 size={14} /> Odstranit vše</button>
          )}
        </span>
      </div>
      {confirm && n > 0 && (
        <div className={s.confirm}>
          <span>Odstranit {label} a vrátit se k výchozí predikci?</span>
          <span className="row" style={{ gap: 8 }}>
            <button type="button" className={s.smallBtn} onClick={() => setConfirm(false)}>Ponechat</button>
            <button type="button" className={clsx(s.smallBtn, s.smallDanger)} onClick={() => (save(emptyScenario()), setConfirm(false))}>Odstranit vše</button>
          </span>
        </div>
      )}
      {!n && (
        <div className={s.emptyNote}>Zatím žádné úpravy. Vyberte měsíc v grafu a změňte částky vpravo — změna platí od daného měsíce dál.</div>
      )}
      {items.map((x) => (
        <div key={x.key} className={s.scenRow}>
          <span className={s.scenIcon} style={{ background: `color-mix(in oklch, ${colorVar(x.color)} 16%, var(--surface))`, color: colorVar(x.color) }}>{x.icon}</span>
          <button type="button" className={s.scenText} onClick={() => pick(idx(x.month))}>
            <span className="ellipsis" style={{ fontSize: 14, fontWeight: 700 }}>{x.title}</span>
            <span className="faint" style={{ fontSize: 12 }}>{x.meta}</span>
          </button>
          <span className={s.scenEff} style={{ color: x.eff >= 0 ? 'var(--pos)' : 'var(--neg)' }}>{money(x.eff, { sign: true })}{x.perMonth ? '/měs' : ''}</span>
          <button type="button" className={s.iconBtn} aria-label="Odebrat úpravu" onClick={x.remove}><X size={16} /></button>
        </div>
      ))}
    </Card>
  )
}
