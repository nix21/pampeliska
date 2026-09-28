import clsx from 'clsx'
import { ChevronDown, Search, X } from 'lucide-react'
import { useMemo, useRef, useState, type ReactNode } from 'react'
import { useCategories, needColor, needLabel, needShort, type CategoryNode } from '../lib/categories'
import { money, num, parseAmount } from '../lib/format'
import type { CategoryKind, NeedType } from '../lib/types'
import s from './category.module.css'
import { Popover, PopoverClose } from './ui'

/** Barevná tečka kategorie. */
export function CategoryDot({ id, size = 10 }: { id?: number | null; size?: number }) {
  const { colorOf } = useCategories()
  return <span className={s.dot} style={{ width: size, height: size, background: colorOf(id) }} />
}

/** „Supermarkety · Jídlo“ s tečkou. */
export function CategoryChip({ id, compact, empty = 'Nezařazeno' }: { id?: number | null; compact?: boolean; empty?: string }) {
  const { byId } = useCategories()
  const c = id != null ? byId.get(id) : undefined
  const parent = c?.parentId ? byId.get(c.parentId) : undefined
  return (
    <span className={s.chip}>
      <CategoryDot id={id} />
      <span className="ellipsis">{c ? c.name : empty}</span>
      {!compact && parent && <span className={s.chipParent}>· {parent.name}</span>}
    </span>
  )
}

/** Štítek typu výdaje. `inherited` = odvozený z kategorie (čárkovaný). */
export function NeedChip({ need, inherited, short, onClick }: { need: NeedType; inherited?: boolean; short?: boolean; onClick?: () => void }) {
  const El = onClick ? 'button' : 'span'
  return (
    <El type={onClick ? 'button' : undefined} onClick={onClick}
      className={clsx(s.need, inherited && s.needInherited, onClick && s.needButton)}
      title={inherited ? `${needLabel[need]} (zděděno z kategorie)` : needLabel[need]}>
      <span className={s.needDot} style={{ background: needColor[need] }} />
      {short ? needShort[need] : needLabel[need]}
    </El>
  )
}

/** Efektivní typ výdaje pohybu/části: přebitý, jinak z kategorie. */
export function useEffectiveNeed() {
  const { byId } = useCategories()
  return (categoryId?: number | null, override?: NeedType | null): { need: NeedType; inherited: boolean } => {
    if (override && override !== 'Inherit') return { need: override, inherited: false }
    const c = categoryId != null ? byId.get(categoryId) : undefined
    return { need: c?.effectiveNeed ?? 'None', inherited: true }
  }
}

/** Seznam kategorií s hledáním a hlavními skupinami (panel „Vyberte kategorii“). */
export function CategoryList({ value, onSelect, kind, exclude, allowTop = true }: {
  value?: number | null
  onSelect: (c: CategoryNode) => void
  kind?: CategoryKind
  exclude?: Set<number>
  allowTop?: boolean
}) {
  const { list, children } = useCategories()
  const [q, setQ] = useState('')
  const norm = (x: string) => x.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()
  const filtered = useMemo(() => {
    const items = list.filter((c) => (!kind || c.kind === kind) && !exclude?.has(c.id))
    if (!q.trim()) return null
    const n = norm(q)
    return items.filter((c) => norm(c.path).includes(n)).slice(0, 12)
  }, [list, q, kind, exclude])
  const tops = (children.get(undefined) ?? []).filter((c) => (!kind || c.kind === kind) && !exclude?.has(c.id))
  const renderSub = (c: CategoryNode): ReactNode[] =>
    (children.get(c.id) ?? []).filter((x) => !exclude?.has(x.id)).flatMap((ch) => [
      <button key={ch.id} type="button" className={clsx(s.subChip, value === ch.id && s.subChipOn)} onClick={() => onSelect(ch)}>
        <span className={s.dot} style={{ width: 8, height: 8, background: `color-mix(in oklch, var(--${ch.color}) ${ch.depth > 1 ? 50 : 75}%, var(--surface))` }} />
        {ch.depth > 1 ? `${ch.name}` : ch.name}
      </button>,
      ...renderSub(ch),
    ])
  return (
    <div className={s.list}>
      <label className={s.search}>
        <Search size={15} color="var(--ink-3)" />
        <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Hledat ve stromu kategorií" />
        {q && <button type="button" onClick={() => setQ('')} aria-label="Vymazat"><X size={14} /></button>}
      </label>
      <div className={s.listBody}>
        {filtered ? (
          filtered.length === 0 ? <span className="faint" style={{ fontSize: 13, padding: 8 }}>Nic nenalezeno</span> : filtered.map((c) => (
            <button key={c.id} type="button" className={clsx(s.row, value === c.id && s.rowOn)} onClick={() => onSelect(c)}>
              <span className={s.dot} style={{ background: `var(--${c.color})` }} />
              <span className="ellipsis">{c.path}</span>
            </button>
          ))
        ) : tops.map((t) => (
          <div key={t.id} className={s.group}>
            <button type="button" className={clsx(s.groupHead, value === t.id && s.rowOn)} disabled={!allowTop && (children.get(t.id)?.length ?? 0) > 0}
              onClick={() => onSelect(t)}>
              <span className={s.dot} style={{ background: `var(--${t.color})` }} />
              {t.name}
            </button>
            <div className={s.subs}>{renderSub(t)}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

/** Tlačítko s vybranou kategorií, které otevře CategoryList v popoveru. */
export function CategoryPicker({ value, onChange, kind, placeholder = 'Vyber kategorii', exclude, size = 'md', block }: {
  value?: number | null
  onChange: (id: number) => void
  kind?: CategoryKind
  placeholder?: string
  exclude?: Set<number>
  size?: 'sm' | 'md'
  block?: boolean
}) {
  const [open, setOpen] = useState(false)
  const { byId } = useCategories()
  const c = value != null ? byId.get(value) : undefined
  return (
    <Popover open={open} onOpenChange={setOpen} width={360} trigger={
      <button type="button" className={clsx(s.picker, size === 'sm' && s.pickerSm, block && s.pickerBlock)}>
        {c ? <CategoryChip id={c.id} /> : <span className="faint">{placeholder}</span>}
        <ChevronDown size={15} color="var(--ink-3)" />
      </button>
    }>
      <CategoryList value={value} kind={kind} exclude={exclude} onSelect={(x) => { onChange(x.id); setOpen(false) }} />
      <PopoverClose className="sr-only">Zavřít</PopoverClose>
    </Popover>
  )
}

// ---------- Rozdělení platby ----------

export interface SplitPart {
  categoryId: number | null
  /** Kladná částka (absolutní hodnota v měně pohybu). */
  amount: number
  need?: NeedType | null
}

const NEED_CYCLE: NeedType[] = ['Need', 'Joy', 'None']

/**
 * Editor rozdělení: pruh s táhly, u každé části kategorie, typ výdaje, Kč a %. Změna jedné části dopočítá ostatní
 * (poslední část bere zbytek). Částky jsou kladné – znaménko přidá volající podle platby.
 */
export function SplitEditor({ total, currency, parts, onChange, kind }: {
  total: number
  currency: string
  parts: SplitPart[]
  onChange: (parts: SplitPart[]) => void
  kind?: CategoryKind
}) {
  const { colorOf } = useCategories()
  const effNeed = useEffectiveNeed()
  const barRef = useRef<HTMLDivElement>(null)
  const abs = Math.abs(total)
  const step = abs >= 1000 ? 10 : currency === 'CZK' ? 1 : 0.01
  const round = (v: number) => Math.round(v / step) * step
  const sum = parts.reduce((a, p) => a + p.amount, 0)
  const diff = Math.round((abs - sum) * 100) / 100

  const setAmount = (i: number, v: number) => {
    const next = parts.map((p) => ({ ...p }))
    next[i].amount = Math.max(0, Math.min(abs, v))
    // Zbytek rozdělí na ostatní části v poměru jejich dosavadních částek
    const others = next.filter((_, j) => j !== i)
    const rest = abs - next[i].amount
    const otherSum = others.reduce((a, p) => a + p.amount, 0)
    others.forEach((p, k) => {
      p.amount = k === others.length - 1 ? 0 : round(otherSum > 0 ? (p.amount / otherSum) * rest : rest / others.length)
    })
    const last = others[others.length - 1]
    if (last) last.amount = Math.round((rest - others.slice(0, -1).reduce((a, p) => a + p.amount, 0)) * 100) / 100
    onChange(next)
  }

  const drag = (i: number) => (e: React.PointerEvent) => {
    const el = barRef.current
    if (!el) return
    e.preventDefault()
    const rect = el.getBoundingClientRect()
    const before = parts.slice(0, i).reduce((a, p) => a + p.amount, 0)
    const pair = parts[i].amount + parts[i + 1].amount
    const move = (ev: PointerEvent) => {
      const x = Math.max(0, Math.min(1, (ev.clientX - rect.left) / rect.width)) * abs
      const a = Math.max(step, Math.min(pair - step, round(x - before)))
      const next = parts.map((p) => ({ ...p }))
      next[i].amount = Math.round(a * 100) / 100
      next[i + 1].amount = Math.round((pair - a) * 100) / 100
      onChange(next)
    }
    const up = () => (window.removeEventListener('pointermove', move), window.removeEventListener('pointerup', up))
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  let acc = 0
  return (
    <div className={s.split}>
      <div className={s.splitHead}>
        <span style={{ fontWeight: 700, fontSize: 13 }}>Rozdělení platby</span>
        <span style={{ fontSize: 12, fontWeight: 700, color: diff === 0 ? 'var(--pos)' : 'var(--neg)' }}>
          {diff === 0 ? `✓ Součet sedí · ${money(abs, { currency })}` : diff > 0 ? `Zbývá rozdělit ${money(diff, { currency })}` : `Přebývá ${money(-diff, { currency })}`}
        </span>
      </div>
      <div ref={barRef} className={s.splitBar}>
        {parts.map((p, i) => {
          const left = (acc / abs) * 100
          acc += p.amount
          return (
            <div key={i} className={s.splitSeg} style={{ left: `${left}%`, width: `${(p.amount / abs) * 100}%`, background: colorOf(p.categoryId) }}>
              {i < parts.length - 1 && <span className={s.handle} onPointerDown={drag(i)} role="separator" aria-label="Posunout předěl" />}
            </div>
          )
        })}
      </div>
      {parts.map((p, i) => {
        const n = p.need && p.need !== 'Inherit' ? { need: p.need, inherited: false } : effNeed(p.categoryId, null)
        return (
          <div key={i} className={s.splitRow}>
            <CategoryPicker value={p.categoryId} kind={kind} size="sm" block onChange={(id) => onChange(parts.map((x, j) => (j === i ? { ...x, categoryId: id } : x)))} />
            <NeedChip need={n.need} inherited={n.inherited} short
              onClick={() => onChange(parts.map((x, j) => (j === i ? { ...x, need: NEED_CYCLE[(NEED_CYCLE.indexOf(n.need) + 1) % 3] } : x)))} />
            <AmountBox value={p.amount} suffix={currency === 'CZK' ? 'Kč' : currency} onChange={(v) => setAmount(i, v)} />
            <AmountBox value={abs ? Math.round((p.amount / abs) * 1000) / 10 : 0} suffix="%" narrow onChange={(v) => setAmount(i, round((v / 100) * abs))} />
            {parts.length > 2 ? (
              <button type="button" className={s.remove} aria-label="Odebrat část" onClick={() => {
                const rest = parts.filter((_, j) => j !== i)
                rest[rest.length - 1] = { ...rest[rest.length - 1], amount: rest[rest.length - 1].amount + p.amount }
                onChange(rest)
              }}><X size={14} /></button>
            ) : <span style={{ width: 28 }} />}
          </div>
        )
      })}
      <button type="button" className={s.addPart} onClick={() => {
        const idx = parts.reduce((m, p, i) => (p.amount > parts[m].amount ? i : m), 0)
        const half = round(parts[idx].amount / 2)
        const next = parts.map((p, i) => (i === idx ? { ...p, amount: p.amount - half } : p))
        onChange([...next, { categoryId: null, amount: half }])
      }}>+ Přidat část</button>
    </div>
  )
}

function AmountBox({ value, onChange, suffix, narrow }: { value: number; onChange: (v: number) => void; suffix: string; narrow?: boolean }) {
  const [text, setText] = useState<string | null>(null)
  return (
    <span className={clsx(s.amountBox, narrow && s.amountNarrow)}>
      <input inputMode="decimal" value={text ?? num(value, Number.isInteger(value) ? 0 : 2)}
        onFocus={(e) => (setText(num(value, Number.isInteger(value) ? 0 : 2)), e.currentTarget.select())}
        onChange={(e) => {
          setText(e.target.value)
          const v = parseAmount(e.target.value)
          if (v != null) onChange(Math.abs(v))
        }}
        onBlur={() => setText(null)} />
      <span>{suffix}</span>
    </span>
  )
}
