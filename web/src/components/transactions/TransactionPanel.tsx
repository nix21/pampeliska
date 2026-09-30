import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import clsx from 'clsx'
import {
  ArrowRight, Ban, Check, ChevronLeft, Link2, MoreHorizontal, Repeat, Scale, Sparkles, Split, Trash2, Undo2, Unlink, Wand2, X,
} from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { useAccounts } from '../../lib/accounts'
import { api, notifyError, notifyOk } from '../../lib/api'
import { needColor, useCategories } from '../../lib/categories'
import { currencySymbol, dateLong, dateShort, dayHeading, num, parseIso, relative } from '../../lib/format'
import {
  accountLabel, correctionBalance, equalShares, invalidateTx, isCategorizable, isExcludedTx, isTransferKind, kindLabel, shareOwner, sourceLabel, whoLabel,
} from '../../lib/transactions'
import type { CategoryKind, NeedType, TxDetail, TxRef, TxRow, TxUpdate } from '../../lib/types'
import { useMembers, useUi } from '../../state/ui'
import { CategoryChip, CategoryPicker, SplitEditor, useEffectiveNeed, type SplitPart } from '../category'
import { Money, useMoney } from '../common'
import { Button, Dialog, DropdownMenu, Empty, IconButton, Spinner, Textarea, tokenColor, type MenuItemDef } from '../ui'
import s from './TransactionPanel.module.css'

export interface TransactionPanelProps {
  id: number
  onClose: () => void
  /** `panel` = pravý panel na desktopu, `page` = celoobrazovkový detail na mobilu (s tlačítkem Zpět). */
  variant?: 'panel' | 'page'
  /** Text tlačítka Zpět v režimu `page`. */
  backLabel?: string
  /** Otevřít jiný pohyb (protistrana převodu, původní platba vratky). */
  onOpen?: (id: number) => void
}

/** Detail pohybu s úpravami (kategorie, rozdělení, typ výdaje, člen, převod, potvrzení). Znovupoužitelný na Výdajích a v Třídění. */
export function TransactionPanel(props: TransactionPanelProps) {
  return <PanelInner key={props.id} {...props} />
}

const detailKey = (id: number) => ['transactions', 'detail', id]

function PanelInner({ id, onClose, variant = 'panel', backLabel = 'Pohyby', onOpen }: TransactionPanelProps) {
  const q = useQuery({ queryKey: detailKey(id), queryFn: () => api.get<TxDetail>(`/api/transactions/${id}`) })
  const shell = (children: ReactNode) => (
    <aside className={clsx(s.panel, variant === 'page' && s.page)}>
      {variant === 'page' && (
        <div className={s.pageHead}>
          <button type="button" className={s.back} onClick={onClose}><ChevronLeft size={18} /> {backLabel}</button>
        </div>
      )}
      {children}
    </aside>
  )
  if (q.isLoading) return shell(<Spinner center />)
  if (!q.data) {
    return shell(
      <Empty title="Pohyb se nepodařilo načíst" action={<Button size="sm" onClick={onClose}>Zavřít</Button>}>
        {q.error instanceof Error ? q.error.message : 'Možná byl mezitím smazán.'}
      </Empty>,
    )
  }
  return <Detail d={q.data} variant={variant} onClose={onClose} backLabel={backLabel} onOpen={onOpen} />
}

function Detail({ d, variant, onClose, backLabel, onOpen }: { d: TxDetail; variant: 'panel' | 'page'; onClose: () => void; backLabel: string; onOpen?: (id: number) => void }) {
  const tx = d.tx
  const qc = useQueryClient()
  const { household } = useUi()
  const members = useMembers()
  const accounts = useAccounts()
  const cats = useCategories()
  const effNeed = useEffectiveNeed()
  const fm = useMoney()
  const account = accounts.byId.get(tx.accountId)

  const [draft, setDraft] = useState<SplitPart[] | null>(null)
  const [note, setNote] = useState(tx.note ?? '')
  const [pairing, setPairing] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const patch = useMutation({
    mutationFn: (u: TxUpdate) => api.patch<TxRow>(`/api/transactions/${tx.id}`, u),
    onSuccess: () => invalidateTx(qc),
    onError: notifyError,
  })
  const unpair = useMutation({
    mutationFn: () => api.post(`/api/transactions/${tx.id}/unpair`),
    onSuccess: () => (invalidateTx(qc), notifyOk('Převod rozpárován')),
    onError: notifyError,
  })
  const remove = useMutation({
    mutationFn: () => api.del(`/api/transactions/${tx.id}`),
    onSuccess: () => {
      qc.removeQueries({ queryKey: detailKey(tx.id) })
      invalidateTx(qc)
      notifyOk(tx.kind === 'Correction' ? 'Korekce smazána' : 'Pohyb smazán')
      onClose()
    },
    onError: notifyError,
  })

  const kind = tx.kind
  const excl = tx.excludeFromStats
  const unconfirmed = tx.status === 'Suggested'
  const serverSplit = tx.splits.length > 0
  const isSplit = serverSplit || draft !== null
  const abs = Math.abs(tx.amount)
  // Příchozí převod od člena může být příjem i vyrovnání výdaje (snižuje ho), proto obě větve kategorií
  const catKind: CategoryKind | undefined = tx.betweenMembers ? (tx.amount < 0 ? 'Expense' : undefined) : kind === 'Income' ? 'Income' : 'Expense'
  const canCat = isCategorizable(tx)
  const isTransfer = isTransferKind(kind)
  const canDelete = kind === 'Correction' || (d.batchLabel?.startsWith('ručně') ?? false)
  const foreign = tx.currency !== 'CZK'

  const serverParts: SplitPart[] = tx.splits.map((p) => ({ categoryId: p.categoryId, amount: Math.abs(p.amount), need: p.needOverride ?? null }))
  const parts = draft ?? serverParts
  const partsSum = Math.round(parts.reduce((a, p) => a + p.amount, 0) * 100) / 100
  const splitValid = parts.length >= 2 && parts.every((p) => p.categoryId != null && p.amount > 0) && Math.abs(partsSum - abs) < 0.005

  const startSplit = () => {
    const a = abs >= 100 ? Math.round((abs * 0.7) / 10) * 10 : Math.round(abs * 70) / 100
    setDraft([
      { categoryId: tx.categoryId ?? null, amount: a, need: tx.needOverride ?? null },
      { categoryId: null, amount: Math.round((abs - a) * 100) / 100, need: null },
    ])
  }
  const saveSplit = () => {
    const sign = Math.sign(tx.amount) || -1
    patch.mutate(
      { splits: parts.map((p) => ({ categoryId: p.categoryId!, amount: sign * p.amount, needOverride: p.need && p.need !== 'Inherit' ? p.need : null })) },
      { onSuccess: () => setDraft(null) },
    )
  }
  const cancelSplit = () => {
    if (serverSplit) patch.mutate({ splits: [] }, { onSuccess: () => setDraft(null) })
    else setDraft(null)
  }

  // ---------- hlavička ----------
  const who = whoLabel(tx.shares, members)
  const src = tx.categorySource
  const SrcIcon = src === 'Rule' ? Wand2 : src === 'Ai' ? Sparkles : src === 'Auto' ? Link2 : Check
  const srcText = src ? (src === 'Ai' && tx.aiConfidence != null ? `${sourceLabel[src]} · ${tx.aiConfidence} %` : sourceLabel[src]) : d.batchLabel ?? null
  const when = `${dayHeading(tx.date)} ${parseIso(tx.date).getFullYear()}${tx.time ? ` · ${tx.time.slice(0, 5)}` : ''}`
  const amountColor = isTransfer || isExcludedTx(tx, cats.isExcluded) || kind === 'Correction' ? 'var(--ink-2)' : tx.amount > 0 ? 'var(--pos)' : 'var(--ink)'

  const menu: MenuItemDef[] = []
  if ((kind === 'Expense' || kind === 'Income') && !isSplit) menu.push({ label: 'Spárovat jako převod', icon: <Link2 size={15} />, onSelect: () => setPairing(true) })
  if (canDelete) menu.push({ label: kind === 'Correction' ? 'Smazat korekci' : 'Smazat pohyb', icon: <Trash2 size={15} />, danger: true, onSelect: () => setConfirmDelete(true) })

  // ---------- akce ----------
  const actions: { label: string; icon: ReactNode; on?: boolean; onClick: () => void }[] = []
  if (canCat && !isSplit) actions.push({ label: 'Rozdělit', icon: <Split size={14} />, onClick: startSplit })
  if (kind === 'Expense' || kind === 'Income' || kind === 'Refund') {
    actions.push({ label: 'Pravidelná', icon: <Repeat size={14} />, on: tx.isRecurring, onClick: () => patch.mutate({ isRecurring: !tx.isRecurring }) })
    actions.push({ label: 'Nezapočítávat', icon: <Ban size={14} />, on: excl, onClick: () => patch.mutate({ excludeFromStats: !excl }) })
  }
  if (kind === 'Correction') actions.push({ label: 'Smazat korekci', icon: <Trash2 size={14} />, onClick: () => setConfirmDelete(true) })

  // ---------- typ výdaje a člen ----------
  const cat = tx.categoryId != null ? cats.byId.get(tx.categoryId) : undefined
  const need = effNeed(tx.categoryId, tx.needOverride)
  const overridden = !!tx.needOverride && tx.needOverride !== 'Inherit'
  const showNeed = (kind === 'Expense' || (tx.betweenMembers && tx.amount < 0)) && !isSplit
  const owner = shareOwner(tx.shares)
  const showMember = household.members.length > 1 && kind !== 'Correction' && !tx.betweenMembers
  const accountJoint = (account?.ratio.filter((r) => r.percent > 0).length ?? 0) > 1
  const setJoint = () => {
    if (accountJoint) patch.mutate({ setMember: true, memberId: null })
    else patch.mutate({ shares: equalShares(household.members) })
  }
  const memberHint = tx.sharesOverridden ? 'Přebito na platbě' : accountJoint ? 'Společný účet, člen per platba' : 'Podle vlastníka účtu'

  return (
    <aside className={clsx(s.panel, variant === 'page' && s.page)}>
      {variant === 'page' && (
        <div className={s.pageHead}>
          <button type="button" className={s.back} onClick={onClose}><ChevronLeft size={18} /> {backLabel}</button>
          <span style={{ flex: 1 }} />
          {menu.length > 0 && <DropdownMenu items={menu} trigger={<IconButton label="Další akce" plain><MoreHorizontal size={20} /></IconButton>} />}
        </div>
      )}

      <div className={s.head}>
        <div className={s.pills}>
          <span className={clsx(s.kindPill, (kind === 'Income' || kind === 'Refund') && s.kindPos, kind === 'InvestmentTransfer' && s.kindAccent)}>
            {tx.betweenMembers ? 'Převod mezi členy' : kindLabel[kind]}
          </span>
          <span className={clsx(s.statusPill, unconfirmed ? s.statusOpen : s.statusDone)}>{unconfirmed ? 'Nepotvrzeno' : 'Potvrzeno'}</span>
          {srcText && (
            <span className={s.src} title={d.appliedRule ?? undefined}>{src && <SrcIcon size={12} />} {srcText}</span>
          )}
          {variant === 'panel' && (
            <span className={s.headTools}>
              {menu.length > 0 && <DropdownMenu items={menu} trigger={<IconButton label="Další akce" plain size="sm"><MoreHorizontal size={16} /></IconButton>} />}
              <IconButton label="Zavřít detail" plain size="sm" onClick={onClose}><X size={16} /></IconButton>
            </span>
          )}
        </div>
        <span className={s.name}>{tx.counterparty}</span>
        {tx.message && tx.message !== tx.counterparty && <span className={s.message}>{tx.message}</span>}
        <div className={s.amountRow}>
          <Money value={tx.amount} currency={tx.currency} sign className={s.amount} style={{ color: amountColor, textDecoration: excl && kind !== 'Correction' ? 'line-through' : undefined }} />
          {foreign && (
            <span className={s.amountSub}>
              ≈ {fm(tx.amountCzk, { sign: true })} · kurz ČNB {num(d.cnbRate ?? tx.fxRate, 2)} ke dni platby
            </span>
          )}
        </div>
        <span className={s.when}>{when} · {accountLabel(account)} · {who}</span>
        {tx.suspectedDuplicateOfId && (
          <span className={s.warnNote}>Možná duplicita pohybu z {dateShort(d.suspectedDuplicateOf?.date)} – vyřeš ji v Třídění.</span>
        )}
      </div>

      {actions.length > 0 && (
        <div className={s.actions}>
          {actions.map((a) => (
            <button key={a.label} type="button" className={clsx(s.act, a.on && s.actOn)} aria-pressed={a.on} disabled={patch.isPending} onClick={a.onClick}>
              {a.icon} {a.label}
            </button>
          ))}
        </div>
      )}

      {isTransfer && (
        <TransferBlock d={d} onUnpair={() => unpair.mutate()} unpairing={unpair.isPending} onOpen={onOpen} />
      )}
      {!isTransfer && pairing && (
        <div className={s.box}>
          <div className={s.boxHead}>
            <span>Spárovat jako převod</span>
            <button type="button" className={s.link} onClick={() => setPairing(false)}>Zavřít</button>
          </div>
          <PairCandidates id={tx.id} />
        </div>
      )}

      {kind === 'Refund' && (
        <div className={s.refund}>
          <Undo2 size={16} color="var(--pos)" style={{ marginTop: 2, flexShrink: 0 }} />
          <div className="col" style={{ gap: 2 }}>
            {d.refundOf ? (
              <button type="button" className={s.refLink} onClick={() => onOpen?.(d.refundOf!.id)} disabled={!onOpen}>
                Vratka k platbě {d.refundOf.counterparty} · {dateShort(d.refundOf.date)} · {fm(d.refundOf.amount, { currency: d.refundOf.currency })}
              </button>
            ) : <span style={{ fontWeight: 700 }}>Vratka</span>}
            <span className="muted">Snižuje výdaj{cat ? ` v kategorii ${cat.name}` : ''}, není to příjem.</span>
          </div>
        </div>
      )}

      {kind === 'Correction' && <CorrectionBlock tx={tx} accountName={account?.name} />}

      {canCat && (
        <div className={s.section}>
          <span className={s.label}>Kategorie</span>
          {isSplit ? (
            <div className="col" style={{ gap: 10 }}>
              <SplitEditor total={tx.amount} currency={tx.currency} parts={parts} kind={catKind} onChange={setDraft} onUnsplit={patch.isPending ? undefined : cancelSplit} />
              <div className="row wrap">
                {draft && (
                  <Button variant="primary" size="sm" icon={<Check size={14} />} disabled={!splitValid} loading={patch.isPending} onClick={saveSplit}>
                    Uložit rozdělení
                  </Button>
                )}
                {draft && serverSplit && <Button variant="ghost" size="sm" onClick={() => setDraft(null)}>Vrátit změny</Button>}
              </div>
              {draft && !splitValid && (
                <span className="faint" style={{ fontSize: 12 }}>Každá část potřebuje kategorii a součet musí odpovídat částce platby.</span>
              )}
            </div>
          ) : (
            <CategoryPicker block value={tx.categoryId} kind={catKind} placeholder="Vyber kategorii"
              onChange={(cid) => cid !== tx.categoryId && patch.mutate({ categoryId: cid, setCategory: true })} />
          )}
          {d.aiReason && src === 'Ai' && (
            <span className={s.ai}><Sparkles size={12} /> {d.aiReason}</span>
          )}
          {src === 'Ai' && !isSplit && d.aiAlternatives.length > 0 && (
            <div className="row wrap" style={{ gap: 6 }}>
              <span className="faint" style={{ fontSize: 12 }}>Další návrhy:</span>
              {d.aiAlternatives.map((a) => (
                <button key={a.categoryId} type="button" className={s.alt} onClick={() => patch.mutate({ categoryId: a.categoryId, setCategory: true })}>
                  <CategoryChip id={a.categoryId} compact /> <span className="faint">{a.confidence} %</span>
                </button>
              ))}
            </div>
          )}
          {d.appliedRule && src === 'Rule' && <span className="faint" style={{ fontSize: 12 }}>Pravidlo: {d.appliedRule}</span>}
        </div>
      )}

      {(showNeed || showMember) && (
        <div className={clsx(s.twoCol, !(showNeed && showMember) && s.oneCol)}>
          {showNeed && (
            <div className={s.section}>
              <span className={s.label}>Typ výdaje</span>
              <VSeg<NeedType>
                label="Typ výdaje"
                value={need.need}
                onChange={(v) => patch.mutate({ needOverride: v, setNeed: true })}
                options={(['Need', 'Joy', 'None'] as NeedType[]).map((v) => ({
                  value: v,
                  label: v === 'Need' ? 'Nezbytné' : v === 'Joy' ? 'Pro radost' : 'Neoznačeno',
                  mark: <span className={s.vsegDot} style={{ background: needColor[v] }} />,
                }))}
              />
              <span className={s.hint}>
                {overridden ? (
                  <>přebito na platbě · <button type="button" className={s.link} onClick={() => patch.mutate({ needOverride: 'Inherit', setNeed: true })}>zdědit z kategorie</button></>
                ) : cat ? `zděděno z ${cat.inheritedFrom ?? cat.name}` : 'bez kategorie'}
              </span>
            </div>
          )}
          {showMember && (
            <div className={s.section}>
              <span className={s.label}>Člen</span>
              <VSeg<string>
                label="Člen"
                value={owner === null ? '' : String(owner)}
                onChange={(v) => (v === 'joint' ? setJoint() : patch.mutate({ setMember: true, memberId: Number(v) }))}
                options={[
                  ...household.members.map((m) => ({
                    value: String(m.id),
                    label: m.name,
                    mark: <span className={s.vsegAvatar} style={{ background: tokenColor(m.colorToken) }}>{m.initials}</span>,
                  })),
                  {
                    value: 'joint',
                    label: owner === 'joint' ? `Společné ${tx.shares.filter((x) => x.percent > 0).map((x) => Math.round(x.percent)).join(' : ')}` : 'Společné',
                    mark: <span className={s.vsegAvatar} style={{ background: 'var(--ink-3)' }}>SP</span>,
                  },
                ]}
              />
              <span className={s.hint}>
                {memberHint}
                {tx.sharesOverridden && (
                  <> · <button type="button" className={s.link} onClick={() => patch.mutate({ setMember: true, memberId: null })}>podle účtu</button></>
                )}
              </span>
            </div>
          )}
        </div>
      )}

      <div className={s.section}>
        <span className={s.label}>Poznámka</span>
        <Textarea rows={2} value={note} placeholder="Přidat poznámku…" onChange={(e) => setNote(e.target.value)}
          onBlur={() => note.trim() !== (tx.note ?? '') && patch.mutate({ note: note.trim() })} />
      </div>

      <div className={s.history}>
        {(d.rawText || d.counterpartyAccount) && (
          <span className={s.raw}>
            {d.rawText}
            {d.counterpartyAccount && <>{d.rawText ? ' · ' : ''}{d.counterpartyAccount}</>}
            {d.mcc && ` · MCC ${d.mcc}`}
          </span>
        )}
        {d.events.map((e, i) => (
          <div key={i} className={s.event}>
            <span className={s.eventDot} />
            <span style={{ flex: 1 }}>{e.text}{e.actor && !e.text.includes(e.actor) ? <span className="faint"> · {e.actor}</span> : null}</span>
            <span className="faint" style={{ whiteSpace: 'nowrap' }}>{relative(e.at)}</span>
          </div>
        ))}
        {d.batchLabel && <span className="faint" style={{ fontSize: 12 }}>Dávka: {d.batchLabel}</span>}
      </div>

      {unconfirmed && (
        <div className={s.confirmWrap}>
          {canCat && !tx.categoryId && !serverSplit && <span className={s.hint}>Před potvrzením vyber kategorii.</span>}
          <Button variant="primary" size="lg" block icon={<Check size={16} />} loading={patch.isPending}
            disabled={canCat && !tx.categoryId && !serverSplit}
            onClick={() => patch.mutate({ confirm: true })}>
            Potvrdit platbu
          </Button>
        </div>
      )}

      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete} title={kind === 'Correction' ? 'Smazat korekci zůstatku?' : 'Smazat pohyb?'}
        description={kind === 'Correction' ? 'Zůstatek účtu se přepočítá bez této korekce.' : 'Ručně přidaný pohyb se trvale odstraní.'}
        footer={(
          <>
            <Button variant="ghost" onClick={() => setConfirmDelete(false)}>Zrušit</Button>
            <Button variant="danger" icon={<Trash2 size={15} />} loading={remove.isPending} onClick={() => remove.mutate()}>Smazat</Button>
          </>
        )}>
        <span className="muted">{tx.counterparty} · {dateLong(tx.date)} · {fm(tx.amount, { currency: tx.currency, sign: true })}</span>
      </Dialog>
    </aside>
  )
}

// ---------- Segment (svisle na desktopu, vodorovně na mobilu) ----------

function VSeg<T extends string>({ options, value, onChange, label }: {
  options: { value: T; label: ReactNode; mark?: ReactNode }[]
  value: T
  onChange: (v: T) => void
  label: string
}) {
  return (
    <div role="radiogroup" aria-label={label} className={s.vseg}>
      {options.map((o) => (
        <button key={o.value} type="button" role="radio" aria-checked={o.value === value} className={clsx(s.vsegItem, o.value === value && s.vsegOn)}
          onClick={() => o.value !== value && onChange(o.value)}>
          {o.mark}
          <span className="ellipsis">{o.label}</span>
        </button>
      ))}
    </div>
  )
}

// ---------- Převod ----------

function TransferBlock({ d, onUnpair, unpairing, onOpen }: { d: TxDetail; onUnpair: () => void; unpairing: boolean; onOpen?: (id: number) => void }) {
  const tx = d.tx
  const accounts = useAccounts()
  const fm = useMoney()
  const pair = d.transferPair
  const self: TxRef = { id: tx.id, date: tx.date, accountId: tx.accountId, counterparty: tx.counterparty, amount: tx.amount, currency: tx.currency, amountCzk: tx.amountCzk }
  const out = tx.amount < 0 ? self : pair ?? null
  const inc = tx.amount < 0 ? pair ?? null : self
  const inv = tx.kind === 'InvestmentTransfer'

  // Kurzový rozdíl u převodu mezi měnami: hodnota příchozí strany v Kč minus hodnota odchozí strany v Kč.
  let fx: { used: number; cnb: number; diff: number; sym: string; date: string } | null = null
  if (out && inc && out.currency !== inc.currency && (out.currency === 'CZK' || inc.currency === 'CZK')) {
    const czk = out.currency === 'CZK' ? out : inc
    const cur = out.currency === 'CZK' ? inc : out
    const value = (x: TxRef) => (x.currency === 'CZK' ? Math.abs(x.amount) : Math.abs(x.amountCzk))
    fx = {
      used: Math.abs(czk.amount) / Math.abs(cur.amount),
      cnb: cur.id === tx.id && d.cnbRate ? d.cnbRate : Math.abs(cur.amountCzk) / Math.abs(cur.amount),
      diff: Math.round((value(inc) - value(out)) * 100) / 100,
      sym: currencySymbol[cur.currency] ?? cur.currency,
      date: cur.date,
    }
  }

  const side = (title: string, r: TxRef | null, dashed?: boolean) => (
    <button type="button" className={clsx(s.side, dashed && s.sideDashed)} disabled={!r || r.id === tx.id || !onOpen} onClick={() => r && onOpen?.(r.id)}>
      <span className={s.sideLabel}>{title}</span>
      <span className={s.sideAcct}>
        {r ? accountLabel(accounts.byId.get(r.accountId)) : tx.transferPairAccountId ? accountLabel(accounts.byId.get(tx.transferPairAccountId)) : 'Hledám protějšek…'}
      </span>
      <span className={s.sideAmt}>{r ? fm(r.amount, { currency: r.currency, sign: true }) : ''}</span>
    </button>
  )

  return (
    <div className={s.box}>
      <div className={s.boxHead}>
        <span>{inv ? 'Převod na investiční účet' : tx.betweenMembers ? 'Převod mezi členy' : pair ? 'Spárovaný převod' : 'Převod mezi účty'}</span>
        <span className={s.pairState} style={{ color: pair ? 'var(--pos)' : 'var(--warn)' }}>
          <Link2 size={14} /> {pair ? 'Spárováno' : 'Nespárováno'}
        </span>
      </div>
      <div className={s.sides}>
        {side('Z účtu', out, !out)}
        <span className={s.sideArrow}><ArrowRight size={16} /></span>
        {side('Na účet', inc, !inc)}
      </div>
      {fx && (
        <>
          <div className={s.fxGrid}>
            <div className={s.fx}><span className={s.sideLabel}>Použitý kurz</span><span>{num(fx.used, 2)} Kč/{fx.sym}</span></div>
            <div className={s.fx}><span className={s.sideLabel}>Kurz ČNB {dateShort(fx.date)}</span><span>{num(fx.cnb, 2)} Kč/{fx.sym}</span></div>
            <div className={s.fx}><span className={s.sideLabel}>Kurzový rozdíl</span><Money value={fx.diff} sign style={{ color: fx.diff < 0 ? 'var(--warn)' : 'var(--ink)' }} /></div>
          </div>
          <span className={s.hint} style={{ lineHeight: 1.5 }}>Kurzový rozdíl proti ČNB se nepočítá jako výdaj. Převod se nezapočítává do výdajů ani příjmů.</span>
        </>
      )}
      {inv && <span className={s.invNote}>Převod na investiční účet se nepočítá jako výdaj – hodnotu sleduješ v Investicích.</span>}
      {tx.betweenMembers && (
        <span className={s.hint} style={{ lineHeight: 1.5 }}>
          Peníze mezi členy: v pohledu člena se počítá jako {tx.amount < 0 ? 'výdaj' : 'příjem'} ve vybrané kategorii
          (příchozí převod v kategorii výdajů výdaj snižuje, třeba vyrovnání dovolené). V pohledu celé domácnosti se nezapočítává.
        </span>
      )}
      {!pair && <PairCandidates id={tx.id} />}
      {pair && (
        <div className="row">
          <Button size="sm" icon={<Unlink size={14} />} loading={unpairing} onClick={onUnpair}>Rozpárovat</Button>
        </div>
      )}
    </div>
  )
}

function PairCandidates({ id }: { id: number }) {
  const qc = useQueryClient()
  const accounts = useAccounts()
  const fm = useMoney()
  const q = useQuery({ queryKey: ['transactions', 'candidates', id], queryFn: () => api.get<TxRow[]>(`/api/transactions/${id}/transfer-candidates`) })
  const link = useMutation({
    mutationFn: (b: number) => api.post('/api/transactions/link', { a: id, b }),
    onSuccess: () => (invalidateTx(qc), notifyOk('Převod spárován')),
    onError: notifyError,
  })
  if (q.isLoading) return <Spinner />
  const list = q.data ?? []
  return (
    <div className="col" style={{ gap: 6 }}>
      <span className={s.hint}>{list.length ? 'Spárovat ručně s protějškem na jiném účtu:' : 'Na ostatních účtech není žádný vhodný protějšek (±5 dní, stejná částka).'}</span>
      {list.map((c) => (
        <div key={c.id} className={s.candidate}>
          <div className="col grow" style={{ gap: 1 }}>
            <span className="ellipsis" style={{ fontWeight: 700, fontSize: 13 }}>{accountLabel(accounts.byId.get(c.accountId))}</span>
            <span className="faint ellipsis" style={{ fontSize: 12 }}>{dateShort(c.date)} · {c.counterparty}</span>
          </div>
          <span className="num" style={{ fontWeight: 700 }}>{fm(c.amount, { currency: c.currency, sign: true })}</span>
          <Button size="sm" loading={link.isPending && link.variables === c.id} onClick={() => link.mutate(c.id)}>Spárovat</Button>
        </div>
      ))}
    </div>
  )
}

// ---------- Korekce ----------

function CorrectionBlock({ tx, accountName }: { tx: TxRow; accountName?: string }) {
  const bal = correctionBalance(tx.note)
  return (
    <div className={s.correction}>
      <span className="row" style={{ gap: 6, fontSize: 13, fontWeight: 700 }}><Scale size={16} /> Korekce zůstatku</span>
      <div className={s.fxGrid}>
        <div className={clsx(s.fx, s.fxSurface)}><span className={s.sideLabel}>Ke dni</span><span>{dateLong(tx.date)}</span></div>
        <div className={clsx(s.fx, s.fxSurface)}><span className={s.sideLabel}>Nový zůstatek</span>{bal != null ? <Money value={bal} currency={tx.currency} /> : <span>—</span>}</div>
        <div className={clsx(s.fx, s.fxSurface)}><span className={s.sideLabel}>Rozdíl</span><Money value={tx.amount} currency={tx.currency} sign style={{ color: tx.amount >= 0 ? 'var(--pos)' : 'var(--neg)' }} /></div>
      </div>
      <span className={s.hint} style={{ color: 'var(--ink-2)', lineHeight: 1.5 }}>
        Nezapočítává se do statistik. Vývoj zůstatku {accountName ? `účtu ${accountName}` : 'účtu'} se zpětně dopočítal od {dateShort(tx.date)}.
      </span>
    </div>
  )
}
