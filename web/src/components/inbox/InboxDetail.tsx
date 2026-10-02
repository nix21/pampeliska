import clsx from 'clsx'
import { ArrowLeftRight, Check, ChevronLeft, ChevronRight, EyeOff, Plus, Sparkles, Split, Wand2 } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { useAccounts } from '../../lib/accounts'
import { accountLabel } from '../../lib/transactions'
import { needColor, useCategories } from '../../lib/categories'
import { dateLong, num, parseIso, weekdays } from '../../lib/format'
import { categoryKindFor, effective, merchantKey, txMember, type InboxDraft, type InboxItem } from '../../lib/inbox'
import type { NeedType } from '../../lib/types'
import { useUi } from '../../state/ui'
import { CategoryList, SplitEditor, useEffectiveNeed } from '../category'
import { Money } from '../common'
import { Button, IconButton, Pill, Popover, tokenColor } from '../ui'
import { DuplicateBlock } from './InboxBits'
import s from './inbox.module.css'

export interface InboxDetailProps {
  item: InboxItem
  draft?: InboxDraft
  setDraft: (d: InboxDraft) => void
  onConfirm: () => void
  onSkip?: () => void
  onPrev?: () => void
  onNext?: () => void
  onExclude: () => void
  onResolveDuplicate: (keep: boolean) => void
  busy?: boolean
  /** Mobil: rozbalený detail uvnitř karty (bez hlavičky, kompaktní). */
  inline?: boolean
}

interface Opt {
  id: number
  conf?: number
  rule?: boolean
}

const NEEDS: { value: NeedType; label: string }[] = [
  { value: 'Need', label: 'Nezbytné' },
  { value: 'Joy', label: 'Pro radost' },
  { value: 'None', label: 'Neoznačeno' },
]

/** Detail platby ve frontě: návrh AI, výběr kategorie / rozdělení, typ výdaje, člen, pravidlo a potvrzení. */
export function InboxDetail({ item, draft, setDraft, onConfirm, onSkip, onPrev, onNext, onExclude, onResolveDuplicate, busy, inline }: InboxDetailProps) {
  const tx = item.tx
  const d = draft ?? {}
  const eff = effective(item, draft)
  const { byId, colorOf, nameOf } = useCategories()
  const effNeed = useEffectiveNeed()
  const accounts = useAccounts()
  const { household } = useUi()
  const acc = accounts.byId.get(tx.accountId)
  const pairAcc = tx.transferPairAccountId != null ? accounts.byId.get(tx.transferPairAccountId) : undefined
  const kind = categoryKindFor(tx)
  const abs = Math.abs(tx.amount)
  const set = (patch: Partial<InboxDraft>) => setDraft({ ...d, ...patch })

  // Nabídka kategorií: návrh + alternativy AI (+ ručně vybraná)
  const opts: Opt[] = []
  const push = (o: Opt) => !opts.some((x) => x.id === o.id) && byId.has(o.id) && opts.push(o)
  if (tx.categoryId != null) {
    push({ id: tx.categoryId, conf: tx.categorySource === 'Ai' ? tx.aiConfidence : tx.categorySource === 'Rule' ? 100 : undefined, rule: tx.categorySource === 'Rule' })
  }
  item.alternatives.forEach((a) => push({ id: a.categoryId, conf: a.confidence || undefined }))
  if (eff.categoryId != null && !opts.some((o) => o.id === eff.categoryId)) opts.unshift({ id: eff.categoryId })
  const showConfNote = !eff.isSplit && (tx.categorySource === 'Ai' || item.alternatives.some((a) => a.confidence > 0))

  const pickCategory = (id: number) => set({ categoryId: id === (tx.categoryId ?? null) && tx.splits.length === 0 ? undefined : id })

  const startSplit = () => {
    const c1 = eff.categoryId ?? item.alternatives[0]?.categoryId ?? null
    const c2 = opts.find((o) => o.id !== c1)?.id ?? null
    const a = tx.currency === 'CZK' ? Math.round(abs * 0.7) : Math.round(abs * 70) / 100
    set({ splits: [{ categoryId: c1, amount: a }, { categoryId: c2, amount: Math.round((abs - a) * 100) / 100 }] })
  }
  const unsplit = () => {
    const first = eff.splits[0]?.categoryId ?? null
    if (tx.splits.length) set({ splits: [], categoryId: first })
    else set({ splits: undefined, categoryId: first === (tx.categoryId ?? null) ? undefined : first })
  }

  const needInfo = effNeed(eff.categoryId, eff.need)
  const cat = eff.categoryId != null ? byId.get(eff.categoryId) : undefined
  const needOverridden = !!eff.need && eff.need !== 'Inherit'
  const needHint: ReactNode = eff.categoryId == null && !needOverridden ? 'Po výběru kategorie se zdědí'
    : needOverridden ? <>Přebito na této platbě · <button type="button" className={s.hintBtn} onClick={() => set({ need: tx.needOverride ? 'Inherit' : undefined })}>zdědit</button></>
    : `Zděděno z kategorie ${cat?.inheritedFrom ?? cat?.name ?? ''}`

  const members = household.members
  const memberNow = eff.member
  const origMember = txMember(tx)
  const memHint = d.member !== undefined || tx.sharesOverridden ? 'Přebito na této platbě'
    : acc?.joint ? 'Společný účet, člen se určuje per platba' : 'Podle vlastníka účtu'
  const memOpts = [
    ...members.map((m) => ({ value: m.id as number | 'shared', label: m.name, ini: m.initials, color: tokenColor(m.colorToken) })),
    { value: 'shared' as const, label: 'Společné', ini: members.slice(0, 2).map((m) => m.initials[0]).join(''), color: 'var(--ink-3)' },
  ]

  const key = merchantKey(tx.counterparty)
  const ruleText = `${key.length >= 3 ? `Obchodník obsahuje „${key.toUpperCase()}“` : 'Stejný protiúčet'} → ${nameOf(eff.categoryId)}`

  const isExpense = tx.amount < 0

  const needSeg = isExpense && !eff.isSplit && (
    <div className={inline ? s.hseg : s.vseg} role="radiogroup" aria-label="Typ výdaje">
      {NEEDS.map((o) => (
        <button key={o.value} type="button" role="radio" aria-checked={needInfo.need === o.value}
          className={clsx(s.segItem, needInfo.need === o.value && s.segOn)} onClick={() => set({ need: o.value })}>
          <span className={s.dot} style={{ background: needColor[o.value] }} />{o.label}
        </button>
      ))}
    </div>
  )
  // Převod mezi členy patří vždy vlastníkovi účtu
  const memberSeg = members.length > 1 && !tx.betweenMembers && (
    <div className={inline ? s.hseg : s.vseg} role="radiogroup" aria-label="Člen">
      {memOpts.map((o) => (
        <button key={String(o.value)} type="button" role="radio" aria-checked={memberNow === o.value}
          className={clsx(s.segItem, memberNow === o.value && s.segOn)}
          onClick={() => set({ member: o.value === origMember ? undefined : o.value })}>
          <span className={s.miniAvatar} style={{ background: o.color }}>{o.ini}</span>
          <span className="ellipsis">{o.label}</span>
        </button>
      ))}
    </div>
  )

  const optionChips = (
    <div className={s.options}>
      {opts.map((o) => (
        <button key={o.id} type="button" className={clsx(s.option, !eff.isSplit && eff.categoryId === o.id && s.optionOn)}
          onClick={() => pickCategory(o.id)} title={byId.get(o.id)?.path}>
          <span className={s.dot} style={{ background: colorOf(o.id) }} />
          <span className="ellipsis">{byId.get(o.id)?.name}</span>
          {o.conf != null && (
            <span className={s.optionConf} title={o.rule ? 'Pravidlo' : 'Jistota AI'}>
              {o.rule ? <Wand2 size={11} /> : <Sparkles size={11} />}{o.conf} %
            </span>
          )}
        </button>
      ))}
      <PickCategory kind={kind} value={eff.categoryId} onSelect={pickCategory} />
    </div>
  )

  const categorySection = eff.isSplit ? (
    <SplitEditor total={tx.amount} currency={tx.currency} parts={eff.splits} kind={kind} onChange={(p) => set({ splits: p })} onUnsplit={unsplit} />
  ) : inline ? (
    <>
      {showConfNote && <span className={s.note}>Návrhy AI · % = jak moc si je AI jistá</span>}
      {optionChips}
    </>
  ) : (
    <>
      {optionChips}
      {tx.kind !== 'Refund' && <button type="button" className={s.linkBtn} onClick={startSplit}><Split size={16} /> Rozdělit platbu do více kategorií</button>}
    </>
  )

  const rule = eff.offerRule && (
    <button type="button" className={clsx(s.rule, eff.ruleOn && s.ruleOn, inline && s.ruleInline)} onClick={() => set({ rule: !eff.ruleOn })}
      role="checkbox" aria-checked={eff.ruleOn}>
      <span className={clsx(s.box, eff.ruleOn && s.boxOn)}>{eff.ruleOn && <Check size={13} strokeWidth={3} />}</span>
      {inline ? <span style={{ fontSize: 13 }}>Vytvořit pravidlo · {ruleText}</span> : (
        <span className="col" style={{ gap: 3, fontSize: 13 }}>
          <span style={{ fontWeight: 700 }}>Vytvořit pravidlo</span>
          <span className="muted">{ruleText}</span>
          <span className="faint" style={{ fontSize: 12 }}>Použije se i na starší platby, které tomu odpovídají</span>
        </span>
      )}
    </button>
  )

  const reason = item.aiReason ? (
    <div className={s.reason}><Sparkles size={16} /><span>{item.aiReason}</span></div>
  ) : tx.categorySource === 'Rule' && item.rule ? (
    <div className={s.reason}><Wand2 size={16} /><span>Zařazeno pravidlem: {item.rule}</span></div>
  ) : null

  const confirmLabel = inline ? 'Potvrdit' : 'Potvrdit a další'
  const confirmTitle = eff.canConfirm ? undefined : eff.isSplit ? 'Doplň kategorie a součet částí' : 'Nejdřív vyber kategorii'

  if (inline) {
    return (
      <div className={clsx(s.detail, s.inline)}>
        {tx.suspectedDuplicateOfId != null && <DuplicateBlock item={item} onResolve={onResolveDuplicate} busy={busy} />}
        {reason}
        {categorySection}
        {needSeg}
        {memberSeg}
        {rule}
        <div className={s.actions}>
          <Button variant="primary" size="lg" icon={<Check size={16} />} loading={busy} disabled={!eff.canConfirm} title={confirmTitle} onClick={onConfirm}>{confirmLabel}</Button>
          {!eff.isSplit && tx.kind !== 'Refund' && <Button size="lg" icon={<Split size={16} />} onClick={startSplit}>Rozdělit</Button>}
          <IconButton label={tx.excludeFromStats ? 'Znovu započítávat' : 'Nezapočítávat'} className={clsx(tx.excludeFromStats && s.eyeOn)} style={{ width: 48, height: 48 }} onClick={onExclude}>
            <EyeOff size={16} />
          </IconButton>
        </div>
      </div>
    )
  }

  const dateText = `${weekdays[parseIso(tx.date).getDay()]} ${dateLong(tx.date)}`
  return (
    <div className={s.detail}>
      <div className={s.head}>
        <div className={s.headMeta}>
          <span className="faint ellipsis" style={{ fontSize: 12, flex: 1 }}>
            {dateText}{acc ? ` · ${accountLabel(acc)}` : ''}
          </span>
          <button type="button" className={s.navBtn} aria-label="Předchozí platba" disabled={!onPrev} onClick={onPrev}><ChevronLeft size={16} /></button>
          <button type="button" className={s.navBtn} aria-label="Další platba" disabled={!onNext} onClick={onNext}><ChevronRight size={16} /></button>
        </div>
        <span className={s.name}>{tx.counterparty || 'Bez protistrany'}</span>
        <div className="row wrap" style={{ alignItems: 'baseline' }}>
          <Money className={s.amount} value={tx.amount} currency={tx.currency} />
          {tx.currency !== 'CZK' && (
            <span className="faint" style={{ fontSize: 14 }}>≈ <Money value={tx.amountCzk} />{tx.fxRate ? ` · kurz ČNB ${num(tx.fxRate, 2)}` : ''}</span>
          )}
        </div>
        {(item.rawText || tx.message) && <span className={s.raw}>{item.rawText ?? tx.message}</span>}
        {tx.excludeFromStats && <span><Pill tone="neutral" icon={<EyeOff size={11} />}>Nezapočítává se do statistik</Pill></span>}
        {tx.betweenMembers && (
          <span>
            <Pill tone="neutral" icon={<ArrowLeftRight size={11} />}>
              Převod mezi členy{pairAcc ? ` ${tx.amount < 0 ? '→' : '←'} ${pairAcc.name}` : ''} · počítá se jen v pohledu člena
            </Pill>
          </span>
        )}
      </div>

      {tx.suspectedDuplicateOfId != null && <DuplicateBlock item={item} onResolve={onResolveDuplicate} busy={busy} />}
      {reason}

      <div className={s.section}>
        <div className={s.sectionHead}>
          <span className={s.label}>Kategorie</span>
          {showConfNote && <span className={s.note}><Sparkles size={11} /> % = jistota AI u návrhu</span>}
        </div>
        {categorySection}
      </div>

      {(needSeg || memberSeg) && (
        <div className={s.twoCols}>
          {needSeg ? (
            <div className="col">
              <span className={s.label}>Typ výdaje</span>
              {needSeg}
              <span className={s.hint}>{needHint}</span>
            </div>
          ) : <span />}
          {memberSeg && (
            <div className="col">
              <span className={s.label}>Člen</span>
              {memberSeg}
              <span className={s.hint}>{memHint}</span>
            </div>
          )}
        </div>
      )}

      {rule}

      <div className={s.actions}>
        <Button variant="primary" size="lg" icon={<Check size={16} />} loading={busy} disabled={!eff.canConfirm} title={confirmTitle} onClick={onConfirm}>{confirmLabel}</Button>
        {onSkip && <Button size="lg" onClick={onSkip}>Přeskočit</Button>}
        <IconButton label={tx.excludeFromStats ? 'Znovu započítávat' : 'Nezapočítávat'} className={clsx(tx.excludeFromStats && s.eyeOn)} style={{ width: 46, height: 46 }} onClick={onExclude}>
          <EyeOff size={16} />
        </IconButton>
      </div>
    </div>
  )
}

/** Čárkovaný čip „Vybrat kategorii“ – otevře celý strom kategorií. */
function PickCategory({ kind, value, onSelect }: { kind?: 'Expense' | 'Income'; value: number | null; onSelect: (id: number) => void }) {
  const [open, setOpen] = useState(false)
  return (
    <Popover open={open} onOpenChange={setOpen} width={360} align="start" trigger={
      <button type="button" className={clsx(s.option, s.optionOther)}><Plus size={14} /> Vybrat kategorii</button>
    }>
      <CategoryList value={value} kind={kind} onSelect={(c) => (onSelect(c.id), setOpen(false))} />
    </Popover>
  )
}
