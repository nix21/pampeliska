import clsx from 'clsx'
import { ChevronLeft, ChevronRight, Minus, Plus } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { count, dateShort, num } from '../../lib/format'
import {
  colorVar, monthDiff, monthInfo, newId, type PredNode, type Prediction, type Scenario, type ScenarioChange,
} from '../../lib/prediction'
import { useMoney } from '../common'
import { Card, Segmented } from '../ui'
import s from './prediction.module.css'

export type Scope = 'from' | 'only'

/** Stav a operace editoru měsíce sdílené stránkou. */
export interface Editor {
  data: Prediction
  scenario: Scenario
  /** Vybraný budoucí měsíc (index 0…H−1) */
  sel: number
  member?: number
  hidden: boolean
  reserve: number
  scope: Scope
  setScope: (v: Scope) => void
  /** Z kolika posledních uzavřených měsíců je průměr */
  avg: number
  setAvg: (v: number) => void
  save: (sc: Scenario) => void
  prev?: () => void
  next?: () => void
}

const AVERAGES = [6, 3, 1]
const parseNum = (v: string) => parseInt(v.replace(/\D/g, ''), 10) || 0
const tint = (token: string, depth: number) => (depth === 0 ? colorVar(token) : `color-mix(in oklch, ${colorVar(token)} 50%, transparent)`)

/** Hodnota položky v měsíci i bez ohledu na scénář (u nové pravidelné platby její částka od měsíce). */
function defaultValue(ed: Editor, node: PredNode, i: number) {
  const leaf = node.leaf!
  if (node.key.startsWith('a')) {
    const a = ed.scenario.added.find((x) => `a${x.id}` === node.key)
    return a && monthDiff(a.from, ed.data.months[i].month) >= 0 ? Math.round(a.amount * leaf.share) : 0
  }
  return leaf.base[i]
}

/** Hodnota položky v měsíci i podle seznamu úprav (platí poslední odpovídající). */
function valueWith(ed: Editor, node: PredNode, i: number, changes: ScenarioChange[]) {
  const month = ed.data.months[i].month
  let v: number | null = null
  for (const c of changes) {
    if (c.key === node.key && c.from <= month && (c.to == null || month <= c.to)) v = Math.round(c.amount * node.leaf!.share)
  }
  return v ?? defaultValue(ed, node, i)
}

/** Úprava položky ve vybraném měsíci na hodnotu v (se znaménkem, v pohledu člena jeho část). */
function apply(ed: Editor, changes: ScenarioChange[], node: PredNode, v: number, only: boolean) {
  const month = ed.data.months[ed.sel].month
  const rest = changes.filter((c) => !(c.key === node.key && c.from === month && (only ? c.to === month : c.to == null)))
  if (v === valueWith(ed, node, ed.sel, rest)) return rest
  const share = node.leaf!.share || 1
  return [...rest, { id: newId(), key: node.key, from: month, to: only ? month : null, amount: Math.round(v / share) }]
}

function leavesOf(ed: Editor, n: PredNode): PredNode[] {
  if (n.leaf) {
    if (n.key.startsWith('a')) {
      const a = ed.scenario.added.find((x) => `a${x.id}` === n.key)
      if (!a || a.from > ed.data.months[ed.sel].month) return []
    }
    return [n]
  }
  return (n.children ?? []).flatMap((c) => leavesOf(ed, c))
}

/** Budoucí měsíc: příjmy, výdaje, zůstatek a úpravy částek po kategoriích. */
export function FutureMonth({ ed }: { ed: Editor }) {
  const money = useMoney()
  const [open, setOpen] = useState<Record<string, boolean>>({})
  const [typing, setTyping] = useState<Record<string, string>>({})
  const { data, sel, scenario } = ed
  const M = monthInfo(data.months[sel].month)
  const month = data.months[sel].month
  const Sm = data.months[sel]
  const net = Sm.income + Sm.expense
  const baseNet = Sm.baseIncome + Sm.baseExpense
  const only = ed.scope === 'only'

  const parents: string[] = []
  const walkP = (n: PredNode) => {
    if (n.children) {
      parents.push(n.key)
      n.children.forEach(walkP)
    }
  }
  data.tree.forEach(walkP)
  const anyOpen = parents.some((k) => open[k])

  const setAmt = (node: PredNode, v: number) => ed.save({ ...scenario, changes: apply(ed, scenario.changes, node, v, only) })
  const setTotal = (node: PredNode, mag: number) => {
    const ls = leavesOf(ed, node)
    const cur = ls.map((l) => Math.abs(valueWith(ed, l, sel, scenario.changes)))
    const tot = cur.reduce((a, b) => a + b, 0)
    const nv = ls.map((_, i) => (tot > 0 ? Math.round((cur[i] * mag) / tot / 10) * 10 : i === 0 ? mag : 0))
    let big = 0
    cur.forEach((v, i) => { if (v > cur[big]) big = i })
    nv[big] = Math.max(0, nv[big] + mag - nv.reduce((a, b) => a + b, 0))
    let ch = scenario.changes
    ls.forEach((l, i) => { ch = apply(ed, ch, l, l.leaf!.sign * nv[i], only) })
    ed.save({ ...scenario, changes: ch })
  }

  const rows: ReactNode[] = []
  const visit = (n: PredNode, d: number) => {
    const ls = leavesOf(ed, n)
    if (!ls.length) return
    const isP = !n.leaf
    const isOpen = !!open[n.key]
    const cur = ls.reduce((a, l) => a + l.leaf!.value[sel], 0)
    const sgn = ls[0].leaf!.sign
    const mag = Math.abs(cur)
    let note: ReactNode = n.leaf?.note ?? ''
    let noteColor = 'var(--ink-3)'
    let edge = false
    let here = false
    let onReset: (() => void) | null = null
    if (isP) {
      const kids = (n.children ?? []).filter((c) => leavesOf(ed, c).length).length
      const chg = ls.filter((l) => l.leaf!.value[sel] !== defaultValue(ed, l, sel)).length
      const hereL = scenario.changes.filter((c) => c.from === month && ls.some((l) => l.key === c.key))
      note = `${count(kids, 'položka', 'položky', 'položek')}${chg && !ed.hidden ? ` · upraveno ${chg}` : ''}`
      if (chg) noteColor = 'var(--warn)'
      if (hereL.length) {
        edge = true
        onReset = () => ed.save({ ...scenario, changes: scenario.changes.filter((c) => !hereL.includes(c)) })
      }
    } else {
      const mine = scenario.changes.filter((c) => c.key === n.key)
      const hereC = mine.filter((c) => c.from === month).pop()
      const app = mine.filter((c) => c.from <= month && (c.to == null || month <= c.to)).pop()
      const added = scenario.added.find((x) => `a${x.id}` === n.key)
      if (added) {
        note = `přidáno od ${monthInfo(added.from).gen}`
        noteColor = 'var(--warn)'
      }
      if (hereC) {
        const without = valueWith(ed, n, sel, scenario.changes.filter((c) => c !== hereC))
        note = `${hereC.to != null ? `jen ${M.loc}` : `od ${M.gen} dál`} · původně ${money(Math.abs(without))}`
        noteColor = 'var(--ink)'
        edge = here = true
        onReset = () => ed.save({ ...scenario, changes: scenario.changes.filter((c) => c !== hereC) })
      } else if (app) {
        note = `změněno od ${monthInfo(app.from).gen} · původně ${money(Math.abs(defaultValue(ed, n, sel)))}`
        noteColor = 'var(--warn)'
      }
    }
    const ref = Math.max(mag, Math.abs(ls.reduce((a, l) => a + defaultValue(ed, l, sel), 0)))
    const stp = ref >= 10000 ? 1000 : ref >= 2000 ? 500 : 100
    const commitN = (v: number) => (isP ? setTotal(n, v) : setAmt(n, sgn * v))
    const typed = typing[n.key]
    const commit = () => {
      if (typed === undefined) return
      setTyping((t) => Object.fromEntries(Object.entries(t).filter(([k]) => k !== n.key)))
      commitN(parseNum(typed))
    }
    rows.push(
      <div key={n.key} className={clsx(s.row, d === 0 ? s.row0 : s.rowSub, edge && s.rowEdge, here && s.rowHere)}>
        <div className={s.rowName} style={{ paddingLeft: d * 16, cursor: isP ? 'pointer' : 'default' }}
          onClick={isP ? () => setOpen((o) => ({ ...o, [n.key]: !isOpen })) : undefined}>
          <span className={s.chev} style={{ transform: `rotate(${isOpen ? 90 : 0}deg)` }}>{isP && <ChevronRight size={14} />}</span>
          <div className={s.rowText}>
            <span className={s.rowTitle} style={{ fontSize: d === 0 ? 14 : d === 1 ? 13 : 12, fontWeight: d === 0 ? 800 : d === 1 ? 700 : 600 }}>
              <span className={s.dot8} style={{ background: tint(n.color, d) }} />
              <span className="ellipsis">{n.name}</span>
            </span>
            <span className={s.rowNote} style={{ color: noteColor }}>
              {note}
              {onReset && <button type="button" className={s.reset} onClick={(e) => { e.stopPropagation(); onReset() }}>vrátit</button>}
            </span>
          </div>
        </div>
        <div className={s.rowCtl} style={{ paddingLeft: d * 16 }}>
          <button type="button" className={s.step} aria-label="Méně" onClick={() => commitN(Math.max(0, mag - stp))}><Minus size={16} /></button>
          <label className={clsx(s.amt, here && s.amtHere)}>
            <input
              inputMode="numeric"
              aria-label={`${n.name} – částka`}
              value={typed !== undefined ? typed : ed.hidden ? '•••' : num(mag)}
              onChange={(e) => setTyping((t) => ({ ...t, [n.key]: e.target.value }))}
              onBlur={commit}
              onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }}
              style={{ color: sgn > 0 ? 'var(--pos)' : 'var(--ink)', fontWeight: isP ? 800 : 700 }}
            />
            <span>Kč</span>
          </label>
          <button type="button" className={s.step} aria-label="Více" onClick={() => commitN(mag + stp)}><Plus size={16} /></button>
        </div>
      </div>,
    )
    if (isP && isOpen) n.children!.forEach((c) => visit(c, d + 1))
  }
  data.tree.forEach((n) => visit(n, 0))

  return (
    <Card pad={false} className={s.panel}>
      <div className={s.panelHead}>
        <MonthNav ed={ed} title={M.full} sub={sel === 0 ? `zbytek měsíce od ${dateShort(data.today)}` : undefined} />
        <div className={s.tiles}>
          <div><span>Příjmy</span><b style={{ color: 'var(--pos)' }}>{money(Sm.income)}</b></div>
          <div><span>Výdaje</span><b>{money(Sm.expense)}</b></div>
          <div><span>Na konci měsíce</span><b style={{ color: Sm.balance < ed.reserve ? 'var(--neg)' : undefined }}>{money(Sm.balance)}</b></div>
        </div>
        {Math.round(net) !== Math.round(baseNet) && (
          <span className={s.netLine}>Bilance měsíce {money(net, { sign: true })} · výchozí {money(baseNet, { sign: true })}</span>
        )}
        <div className={s.scopeRow}>
          <span>Změny platí</span>
          <Segmented<Scope> full size="sm" aria-label="Rozsah změn" value={ed.scope} onChange={ed.setScope}
            options={[{ value: 'from', label: `Od ${M.genShort} dál` }, { value: 'only', label: `Jen ${M.loc}` }]} />
        </div>
        <div className={s.scopeRow}>
          <span>Průměr za</span>
          <Segmented<number> full size="sm" aria-label="Průměr za" value={ed.avg} onChange={ed.setAvg}
            options={AVERAGES.map((n) => ({ value: n, label: count(n, 'měsíc', 'měsíce', 'měsíců') }))} />
        </div>
      </div>
      <div className={s.treeHead}>
        <span>Kategorie</span>
        <button type="button" onClick={() => setOpen(anyOpen ? {} : Object.fromEntries(parents.map((k) => [k, true])))}>
          {anyOpen ? 'Sbalit vše' : 'Rozbalit vše'}
        </button>
      </div>
      {rows.length ? rows : <div className={s.emptyNote}>Zatím nejsou data pro predikci. Naimportujte výpisy nebo založte pravidelné platby.</div>}
    </Card>
  )
}

export function MonthNav({ ed, title, sub }: { ed: Pick<Editor, 'prev' | 'next'>; title: string; sub?: ReactNode }) {
  return (
    <div className={s.monthNav}>
      <button type="button" aria-label="Předchozí měsíc" disabled={!ed.prev} onClick={ed.prev}><ChevronLeft size={16} /></button>
      <div className={s.monthNavTitle}>
        <h2>{title}</h2>
        {sub && <span>{sub}</span>}
      </div>
      <button type="button" aria-label="Další měsíc" disabled={!ed.next} onClick={ed.next}><ChevronRight size={16} /></button>
    </div>
  )
}

const PRESETS: [string, 'out' | 'in', 'once' | 'rec'][] = [
  ['Dovolená', 'out', 'once'], ['Dárky', 'out', 'once'], ['Servis auta', 'out', 'once'], ['Nové auto', 'out', 'once'], ['Prémie', 'in', 'once'],
  ['Nájem garáže', 'out', 'rec'],
]

/** Jednorázové platby vybraného měsíce a přidání nové (jednorázové nebo pravidelné od měsíce). */
export function OneOffsCard({ ed }: { ed: Editor }) {
  const money = useMoney()
  const { data, sel, scenario } = ed
  const month = data.months[sel].month
  const M = monthInfo(month)
  const [draft, setDraft] = useState({ name: '', amt: '', dir: 'out' as 'out' | 'in', kind: 'once' as 'once' | 'rec' })
  const ones = data.oneOffs.filter((o) => o.month === month)
  const n = parseNum(draft.amt)
  const add = () => {
    if (!n) return
    const amount = (draft.dir === 'in' ? 1 : -1) * n
    const memberId = ed.member ?? null
    if (draft.kind === 'once') {
      const name = draft.name.trim() || (draft.dir === 'in' ? 'Jednorázový příjem' : 'Jednorázový výdaj')
      ed.save({ ...scenario, oneOffs: [...scenario.oneOffs, { id: newId(), month, name, amount, memberId }] })
    } else {
      ed.save({ ...scenario, added: [...scenario.added, { id: newId(), name: draft.name.trim() || 'Nová pravidelná platba', amount, from: month, memberId }] })
    }
    setDraft((d) => ({ ...d, name: '', amt: '' }))
  }
  const toggleSkip = (key: string, skip: boolean) =>
    ed.save({ ...scenario, skips: skip ? [...scenario.skips, key] : scenario.skips.filter((k) => k !== key) })

  return (
    <Card className={s.ones}>
      <h2 className={s.onesTitle}>Jednorázově {M.loc}</h2>
      {!ones.length && <span className="faint" style={{ fontSize: 13 }}>Žádné jednorázové platby</span>}
      <div className="col" style={{ gap: 0 }}>
        {ones.map((o) => (
          <div key={o.key} className={s.oneRow} style={{ opacity: o.skipped ? 0.5 : 1 }}>
            <div className="col" style={{ gap: 1, minWidth: 0 }}>
              <span className={s.oneName} style={{ textDecoration: o.skipped ? 'line-through' : undefined }}>{o.name}</span>
              <span className={s.oneMeta}>{o.source}</span>
            </div>
            <span className={s.oneAmt} style={{ color: o.amount > 0 ? 'var(--pos)' : undefined, textDecoration: o.skipped ? 'line-through' : undefined }}>
              {money(o.amount, { sign: true })}
            </span>
            <button type="button" className={s.oneAct} onClick={() => o.kind === 'scenario'
              ? ed.save({ ...scenario, oneOffs: scenario.oneOffs.filter((x) => `o${x.id}` !== o.key) })
              : toggleSkip(o.key, !o.skipped)}>
              {o.kind === 'scenario' ? 'Odebrat' : o.skipped ? 'Vrátit' : 'Vynechat'}
            </button>
          </div>
        ))}
      </div>
      <div className={s.draft}>
        <div className={s.presets}>
          {PRESETS.map(([l, dir, kind]) => (
            <button key={l} type="button" onClick={() => setDraft((d) => ({ ...d, name: l, dir, kind }))}>{l}</button>
          ))}
        </div>
        <div className={s.draftInputs}>
          <input className={s.input} value={draft.name} placeholder="Název, např. Dovolená" aria-label="Název"
            onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))} />
          <label className={s.inputAmt}>
            <input inputMode="numeric" placeholder="0" aria-label="Částka" value={draft.amt}
              onChange={(e) => setDraft((d) => ({ ...d, amt: e.target.value }))} onKeyDown={(e) => { if (e.key === 'Enter') add() }} />
            <span>Kč</span>
          </label>
        </div>
        <Segmented<'out' | 'in'> size="sm" aria-label="Směr" value={draft.dir} onChange={(dir) => setDraft((d) => ({ ...d, dir }))}
          options={[{ value: 'out', label: 'Výdaj' }, { value: 'in', label: 'Příjem' }]} />
        <Segmented<'once' | 'rec'> full size="sm" aria-label="Opakování" value={draft.kind} onChange={(kind) => setDraft((d) => ({ ...d, kind }))}
          options={[{ value: 'once', label: `Jen ${M.loc}` }, { value: 'rec', label: `Každý měsíc od ${M.genShort}` }]} />
        <button type="button" className={clsx(s.addBtn, n > 0 && s.addBtnOn)} disabled={!n} onClick={add}>
          <Plus size={16} /> {draft.kind === 'once' ? `Přidat ${M.loc}` : `Přidat pravidelnou od ${M.gen}`}
        </button>
      </div>
    </Card>
  )
}

/** Uzavřený měsíc: skutečnost po kategoriích proti uložené predikci (nebo průměru). */
export function PastMonth({ ed, i, snapshotName, plan }: {
  ed: Pick<Editor, 'data' | 'prev' | 'next'>
  i: number
  snapshotName?: string
  plan?: { months: { month: string; balance: number; cats: Record<string, number>; ones: { name: string; amount: number }[] }[] } | null
}) {
  const money = useMoney()
  const { data } = ed
  const h = data.history
  const a = h[h.length + i]
  const pl = plan?.months.find((x) => x.month === a.month)
  // Průměr ze stejných měsíců, ze kterých počítá predikce
  const recent = h.slice(-Math.max(1, data.dataMonths))
  const groups = new Map(data.groups.map((g) => [g.key, g]))
  const keys = [...new Set([...Object.keys(a.cats), ...Object.keys(pl?.cats ?? {})])]
  const avg = (k: string) => recent.reduce((s2, m) => s2 + (m.cats[k] ?? 0), 0) / recent.length
  const dvColor = (v: number) => (v >= 50 ? 'var(--pos)' : v <= -50 ? 'var(--neg)' : 'var(--ink-3)')
  const cats = keys.map((k) => {
    const av = a.cats[k] ?? 0
    const ref = pl ? pl.cats[k] ?? 0 : avg(k)
    return { k, g: groups.get(k), av, ref, dv: av - ref }
  }).filter((c) => Math.round(c.av) || Math.round(c.ref)).sort((x, y) => Math.abs(y.dv) - Math.abs(x.dv))
  const M = monthInfo(a.month)

  return (
    <Card pad={false} className={s.panel}>
      <div className={s.panelHead}>
        <MonthNav ed={ed} title={M.full} sub="Skutečnost · uzavřený měsíc" />
        <div className={s.tiles}>
          <div><span>Příjmy</span><b style={{ color: 'var(--pos)' }}>{money(a.income)}</b></div>
          <div><span>Výdaje</span><b>{money(a.expense)}</b></div>
          <div><span>Na konci měsíce</span><b>{money(a.balance)}</b></div>
        </div>
        {pl && (
          <div className={s.planText}>
            Predikce „{snapshotName}“ čekala na konci měsíce {money(pl.balance)}. Skutečnost se liší o {money(a.balance - pl.balance, { sign: true })}.
          </div>
        )}
      </div>
      <div className={clsx(s.pastRow, s.pastHead)}><span>Kategorie</span><span>Skutečnost</span><span>{pl ? 'Plán' : 'Průměr'}</span><span>Rozdíl</span></div>
      {cats.map((c) => (
        <div key={c.k} className={s.pastRow}>
          <span className={s.rowTitle}><span className={s.dot8} style={{ background: colorVar(c.g?.color ?? 'ink-3') }} /><span className="ellipsis">{c.g?.name ?? c.k}</span></span>
          <span className={s.pastAct}>{money(Math.abs(c.av))}</span>
          <span className="faint">{money(Math.abs(c.ref))}</span>
          <span style={{ fontWeight: 800, color: dvColor(c.dv) }}>{Math.abs(c.dv) < 50 ? '—' : money(c.dv, { sign: true })}</span>
        </div>
      ))}
      {a.ones.length > 0 && (
        <>
          <div className={s.treeHead}><span>Jednorázové platby</span></div>
          {a.ones.map((o) => {
            const inPlan = pl?.ones.find((p) => p.name === o.name)
            return (
              <div key={o.name} className={s.oneRow} style={{ padding: '8px 20px' }}>
                <div className="col" style={{ gap: 1 }}>
                  <span className={s.oneName}>{o.name}</span>
                  {pl && <span className={s.oneMeta} style={{ color: inPlan ? undefined : 'var(--neg)', fontWeight: 600 }}>
                    {inPlan ? `v plánu ${money(Math.abs(inPlan.amount))}` : 'nebylo v plánu'}
                  </span>}
                </div>
                <span className={s.oneAmt} style={{ color: o.amount > 0 ? 'var(--pos)' : undefined }}>{money(o.amount, { sign: true })}</span>
              </div>
            )
          })}
        </>
      )}
      <div className={s.pastFoot}>Uzavřené měsíce nejde upravovat. Pro úpravy vyberte budoucí měsíc.</div>
    </Card>
  )
}
