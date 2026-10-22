import clsx from 'clsx'
import { Clock, Save, Trash2, X } from 'lucide-react'
import { useState } from 'react'
import { count, dateLong } from '../../lib/format'
import { evaluated, kts, monthDiff, monthInfo, type Prediction, type Snapshot } from '../../lib/prediction'
import { useMoney } from '../common'
import { Card } from '../ui'
import s from './prediction.module.css'

const dvColor = (v: number) => (v >= 50 ? 'var(--pos)' : v <= -50 ? 'var(--neg)' : 'var(--ink-3)')

/** Vyhodnocení vybrané uložené predikce proti skutečnosti. */
export function Evaluation({ data, snap, sel, hidden, onPick, onClose }: {
  data: Prediction
  snap: Snapshot
  sel: number
  hidden: boolean
  onPick: (i: number) => void
  onClose: () => void
}) {
  const money = useMoney()
  const M0 = data.months[0].month
  const ev = evaluated(data, snap)
  const planMonths = snap.plan?.months ?? []
  const groups = new Map(data.groups.map((g) => [g.key, g]))
  const last = ev[ev.length - 1]
  const meta = `uloženo ${dateLong(snap.savedOn)} · ${count(snap.horizon, 'měsíc', 'měsíce', 'měsíců')} · ${ev.length ? `proběhlo ${ev.length} z ${snap.horizon}` : 'zatím nic neproběhlo'}`

  const devs: { key: string; name: string; color: string; v: number; meta: string }[] = []
  if (ev.length) {
    const keys = new Set(ev.flatMap((e) => [...Object.keys(e.plan.cats), ...Object.keys(e.act.cats)]))
    for (const k of keys) {
      const v = ev.reduce((a, e) => a + (e.act.cats[k] ?? 0) - (e.plan.cats[k] ?? 0), 0)
      if (Math.abs(v) < 300) continue
      const income = ev.reduce((a, e) => a + (e.plan.cats[k] ?? 0) + (e.act.cats[k] ?? 0), 0) > 0
      const g = groups.get(k)
      devs.push({
        key: k, name: g?.name ?? k, color: g?.color ?? 'ink-3', v,
        meta: k === 'o' ? 'jednorázové platby z plánu – skutečné jsou v kategoriích'
          : income ? (v < 0 ? 'příjmy nižší, než se čekalo' : 'příjmy vyšší, než se čekalo')
            : v < 0 ? 'utraceno víc, než se čekalo' : 'utraceno méně, než se čekalo',
      })
    }
    devs.sort((a, b) => Math.abs(b.v) - Math.abs(a.v))
  }
  const lastPlanIdx = planMonths.length ? monthDiff(M0, planMonths[planMonths.length - 1].month) : -1
  const endI = Math.min(lastPlanIdx, data.months.length - 1)
  const endPlan = endI >= 0 ? planMonths.find((pm) => pm.month === data.months[endI].month) : undefined
  const pct = last ? ((last.act.balance - last.plan.balance) / Math.max(1, Math.abs(last.plan.balance))) * 100 : 0

  return (
    <Card className={s.eval}>
      <div className={s.evalHead}>
        <span className={s.evalIcon}><Clock size={16} /></span>
        <div className="col" style={{ gap: 2, flex: 1, minWidth: 0 }}>
          <h2>Vyhodnocení · {snap.name}</h2>
          <span className="faint" style={{ fontSize: 12 }}>{meta}</span>
        </div>
        <button type="button" className={s.iconBtn} aria-label="Zavřít porovnání" onClick={onClose}><X size={16} /></button>
      </div>
      {!ev.length && planMonths[0] && (
        <span className="muted" style={{ fontSize: 13 }}>
          Vyhodnotí se po skončení {monthInfo(planMonths[0].month).gen}. Pak tu uvidíte predikci proti skutečnosti.
        </span>
      )}
      {last && (
        <>
          <div className={s.evalKpis}>
            <div><span>Predikce na konec {monthInfo(last.plan.month).genShort}</span><b>{money(last.plan.balance)}</b><span>uloženo {dateLong(snap.savedOn)}</span></div>
            <div><span>Skutečnost</span><b>{money(last.act.balance)}</b><span>{monthInfo(last.plan.month).full.toLowerCase()}</span></div>
            <div>
              <span>Odchylka</span>
              <b style={{ color: dvColor(last.act.balance - last.plan.balance) }}>{money(last.act.balance - last.plan.balance, { sign: true })}</b>
              <span>{pct >= 0 ? '+' : '−'}{Math.abs(Math.round(pct))} % zůstatku</span>
            </div>
          </div>
          <div className={s.evalGrid}>
            <div className="col" style={{ gap: 0 }}>
              <div className={clsx(s.evalRow, s.evalRowHead)}><span>Měsíc</span><span>Predikce</span><span>Skutečnost</span><span>Rozdíl</span></div>
              {ev.map((e) => {
                const i = monthDiff(M0, e.plan.month)
                const mi = monthInfo(e.plan.month)
                const d = e.act.balance - e.plan.balance
                return (
                  <button key={e.plan.month} type="button" className={clsx(s.evalRow, i === sel && s.evalRowOn)} onClick={() => onPick(i)}>
                    <span style={{ fontWeight: 700 }}>{mi.short} {String(mi.y).slice(2)}</span>
                    <span className="muted">{kts(e.plan.balance, hidden)}</span>
                    <span style={{ fontWeight: 700 }}>{kts(e.act.balance, hidden)}</span>
                    <span style={{ fontWeight: 800, color: dvColor(d) }}>{money(d, { sign: true })}</span>
                  </button>
                )
              })}
            </div>
            <div className="col" style={{ gap: 0 }}>
              <span className={s.evalSub}>Kde se to rozešlo</span>
              {!devs.length && <span className="faint" style={{ fontSize: 13, paddingTop: 6 }}>Kategorie odpovídají plánu.</span>}
              {devs.slice(0, 6).map((x) => (
                <div key={x.key} className={s.devRow}>
                  <div className="col" style={{ gap: 1, minWidth: 0 }}>
                    <span className={s.rowTitle} style={{ fontSize: 13, fontWeight: 700 }}>
                      <span className={s.dot8} style={{ background: `var(--${x.color})` }} /><span className="ellipsis">{x.name}</span>
                    </span>
                    <span className={s.oneMeta} style={{ paddingLeft: 15 }}>{x.meta}</span>
                  </div>
                  <span style={{ fontSize: 13, fontWeight: 800, color: dvColor(x.v) }}>{money(x.v, { sign: true })}</span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
      {endPlan && (
        <span className={s.evalFut}>
          Dopředu: na konci {monthInfo(endPlan.month).gen} uložená predikce čeká {money(endPlan.balance)}, aktuální scénář {money(data.months[endI].balance)}
          {' '}({money(data.months[endI].balance - endPlan.balance, { sign: true })}).
        </span>
      )}
    </Card>
  )
}

/** Seznam uložených predikcí s výběrem pro porovnání a uložení aktuální. */
export function SnapshotList({ data, selected, onSelect, onSave, onDelete, saving }: {
  data: Prediction
  selected: number | null
  onSelect: (id: number | null) => void
  onSave: (name: string) => void
  onDelete: (id: number) => void
  saving: boolean
}) {
  const money = useMoney()
  const [name, setName] = useState('')
  const [confirm, setConfirm] = useState<number | null>(null)
  const save = () => {
    onSave(name)
    setName('')
  }
  return (
    <Card pad={false} className={s.snaps}>
      <div className={s.snapsHead}>
        <h2>Uložené predikce</h2>
        <span className="faint" style={{ fontSize: 12 }}>vyberte jednu pro porovnání se skutečností</span>
      </div>
      {data.snapshots.map((sn) => {
        const on = sn.id === selected
        const ev = evaluated(data, sn)
        const last = ev[ev.length - 1]
        const d = last ? last.act.balance - last.plan.balance : 0
        return (
          <div key={sn.id} className={clsx(s.snapRow, on && s.snapOn)}>
            <button type="button" className={s.snapPick} aria-pressed={on} onClick={() => onSelect(on ? null : sn.id)}>
              <span className={clsx(s.radio, on && s.radioOn)} />
              <span className="col" style={{ gap: 2, minWidth: 0 }}>
                <span style={{ fontSize: 14, fontWeight: 700 }}>{sn.name}</span>
                <span className="faint" style={{ fontSize: 12 }}>
                  uloženo {dateLong(sn.savedOn)} · {sn.horizon} měs. · {ev.length ? `vyhodnoceno ${ev.length} měs.` : 'čeká na první měsíc'}
                </span>
              </span>
            </button>
            <span title="Odchylka skutečnosti od predikce k poslednímu uzavřenému měsíci" className={s.snapDev} style={{ color: last ? dvColor(d) : 'var(--ink-3)' }}>
              {last ? money(d, { sign: true }) : ''}
            </span>
            {confirm === sn.id ? (
              <span className="row" style={{ gap: 6 }}>
                <button type="button" className={s.smallBtn} onClick={() => setConfirm(null)}>Ponechat</button>
                <button type="button" className={clsx(s.smallBtn, s.smallDanger)} onClick={() => (onDelete(sn.id), setConfirm(null))}>Smazat</button>
              </span>
            ) : (
              <button type="button" className={s.iconBtn} aria-label="Smazat uloženou predikci" onClick={() => setConfirm(sn.id)}><Trash2 size={14} /></button>
            )}
          </div>
        )
      })}
      <div className={s.snapSave}>
        <div className={s.snapSaveRow}>
          <input className={s.input} value={name} placeholder="Název, např. Plán na podzim" aria-label="Název predikce"
            onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') save() }} />
          <button type="button" className={s.darkBtn} disabled={saving} onClick={save}><Save size={15} /> Uložit aktuální predikci</button>
        </div>
        <span className="faint" style={{ fontSize: 12, lineHeight: 1.45 }}>
          Uloží se aktuální scénář i dnešní zůstatek. Po každém uzavřeném měsíci uvidíte, jak se predikce trefila.
        </span>
      </div>
    </Card>
  )
}
