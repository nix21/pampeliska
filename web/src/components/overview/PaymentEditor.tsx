import { useMutation, useQuery } from '@tanstack/react-query'
import { Check, Scissors, Wand2 } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAccounts } from '../../lib/accounts'
import { api, notifyError } from '../../lib/api'
import { useCategories } from '../../lib/categories'
import { useInvalidateAfterTxChange } from '../../lib/stats'
import type { NeedType, Share, TxDetail, TxRow, TxUpdate } from '../../lib/types'
import { useUi } from '../../state/ui'
import { CategoryPicker, SplitEditor, useEffectiveNeed, type SplitPart } from '../category'
import { Button, Pill, Segmented, tokenColor } from '../ui'
import s from './editor.module.css'

const NEED_OPTS: { value: NeedType; label: string; color: string }[] = [
  { value: 'Need', label: 'Nezbytné', color: 'var(--need)' },
  { value: 'Joy', label: 'Pro radost', color: 'var(--joy)' },
  { value: 'None', label: 'Neoznačeno', color: 'var(--none)' },
]

const partsOf = (tx: TxRow): SplitPart[] | null =>
  tx.splits.length ? tx.splits.map((p) => ({ categoryId: p.categoryId, amount: Math.abs(p.amount), need: p.needOverride ?? null })) : null

/** Úprava platby přímo v seznamu: kategorie / rozdělení, typ výdaje, člen, pravidlo, potvrzení. */
export function PaymentEditor({ tx, onClose }: { tx: TxRow; onClose: () => void }) {
  const cats = useCategories()
  const effNeed = useEffectiveNeed()
  const { household } = useUi()
  const { byId } = useAccounts()
  const account = byId.get(tx.accountId)
  const detail = useQuery({ queryKey: ['tx', tx.id], queryFn: () => api.get<TxDetail>(`/api/transactions/${tx.id}`) }).data
  const invalidate = useInvalidateAfterTxChange()
  const patch = useMutation({
    mutationFn: (u: TxUpdate) => api.patch<TxRow>(`/api/transactions/${tx.id}`, u),
    onSuccess: () => invalidate(),
    onError: notifyError,
  })
  const [draft, setDraft] = useState<SplitPart[] | null>(() => partsOf(tx))
  const [ruleDone, setRuleDone] = useState(false)

  const abs = Math.abs(tx.amount)
  const sign = tx.amount < 0 ? -1 : 1
  const round = (v: number) => (tx.currency === 'CZK' ? Math.round(v) : Math.round(v * 100) / 100)
  const splitSum = draft?.reduce((a, p) => a + p.amount, 0) ?? 0
  const splitValid = !!draft && draft.length >= 2 && draft.every((p) => p.categoryId != null && p.amount > 0) && Math.abs(splitSum - abs) < 0.005
  const splitDirty = JSON.stringify(draft) !== JSON.stringify(partsOf(tx))

  const override = tx.needOverride && tx.needOverride !== 'Inherit' ? tx.needOverride : null
  const need = effNeed(tx.categoryId, tx.needOverride).need
  const members = household.members
  const single = tx.shares.length === 1 && tx.shares[0].percent === 100
  const memberValue = single ? String(tx.shares[0].memberId) : 'joint'
  const memberName = (id: number) => members.find((m) => m.id === id)?.name ?? '?'
  const edited = tx.categorySource === 'Manual' || !!override || tx.sharesOverridden
  const source = tx.categorySource === 'Rule' ? `Pravidlo${detail?.appliedRule ? ` · ${detail.appliedRule}` : ''}`
    : tx.categorySource === 'Ai' ? `AI · jistota ${tx.aiConfidence ?? '?'} %`
      : tx.categorySource === 'Manual' ? 'Zařazeno ručně'
        : tx.categorySource === 'Auto' ? 'Automaticky'
          : detail?.batchLabel ?? (tx.batchId ? 'Import' : 'Ruční zadání')

  const setMember = (v: string) => {
    if (v !== 'joint') return patch.mutate({ memberId: Number(v), setMember: true })
    if (account?.joint) return patch.mutate({ setMember: true, memberId: null })
    const base = Math.floor(100 / members.length)
    const shares: Share[] = members.map((m, i) => ({ memberId: m.id, percent: base + (i === 0 ? 100 - base * members.length : 0) }))
    patch.mutate({ shares })
  }

  const startSplit = () => {
    const b = round(abs * 0.3)
    setDraft([{ categoryId: tx.categoryId ?? null, amount: round(abs - b) }, { categoryId: null, amount: b }])
  }
  const saveSplit = () =>
    draft && patch.mutate({ splits: draft.map((p) => ({ categoryId: p.categoryId!, amount: round(sign * p.amount), needOverride: p.need ?? null })) })
  const cancelSplit = () => {
    if (tx.splits.length) patch.mutate({ splits: [] }, { onSuccess: () => setDraft(null) })
    else setDraft(null)
  }

  return (
    <div className={s.editor} onClick={(e) => e.stopPropagation()}>
      <div className={s.chips}>
        <Pill>{source}</Pill>
        {tx.status === 'Suggested' && <Pill tone="dashed">Nepotvrzeno</Pill>}
        {edited && <Pill tone="accent" style={{ background: 'var(--accent-soft)', color: 'var(--ink)' }}>Upraveno ručně</Pill>}
        <span className={s.raw} title={detail?.rawText ?? undefined}>{detail?.rawText ?? tx.message ?? tx.counterparty}</span>
      </div>

      <div className={s.grid}>
        <div className="col" style={{ gap: 8, minWidth: 0 }}>
          <span className={s.fieldLabel}>Kategorie</span>
          {draft ? (
            <>
              <SplitEditor total={tx.amount} currency={tx.currency} parts={draft} onChange={setDraft} kind="Expense" />
              <div className="row wrap">
                <Button variant="dark" size="sm" disabled={!splitValid || !splitDirty} loading={patch.isPending} onClick={saveSplit}>Uložit rozdělení</Button>
                <span style={{ flex: 1 }} />
                <button type="button" className={s.textBtn} onClick={cancelSplit}>Zrušit rozdělení</button>
              </div>
            </>
          ) : (
            <>
              <CategoryPicker value={tx.categoryId} kind="Expense" block placeholder="Vyberte kategorii"
                onChange={(id) => id !== tx.categoryId && patch.mutate({ categoryId: id, setCategory: true })} />
              <button type="button" className={s.textBtn} onClick={startSplit}><Scissors size={15} /> Rozdělit platbu do více kategorií</button>
            </>
          )}
        </div>
        <div className="col" style={{ gap: 14, minWidth: 0 }}>
          <div className="col" style={{ gap: 6 }}>
            <span className={s.fieldLabel}>Typ výdaje</span>
            {draft ? (
              <span className={s.hint} style={{ lineHeight: 1.45 }}>U rozdělené platby se typ bere z kategorie každé části.</span>
            ) : (
              <>
                <Segmented full size="sm" value={need === 'Inherit' ? 'None' : need} onChange={(v) => patch.mutate({ needOverride: v, setNeed: true })}
                  options={NEED_OPTS.map((o) => ({ value: o.value, label: <><span className={s.dot} style={{ background: o.color }} />{o.label}</> }))} />
                <span className={s.hint}>
                  {override ? <>Přebito na této platbě · <button type="button" className={s.inlineBtn} onClick={() => patch.mutate({ needOverride: null, setNeed: true })}>zdědit z kategorie</button></>
                    : `Zděděno z kategorie ${cats.nameOf(tx.categoryId)}`}
                </span>
              </>
            )}
          </div>
          {members.length > 1 && (
            <div className="col" style={{ gap: 6 }}>
              <span className={s.fieldLabel}>Člen</span>
              <Segmented full size="sm" value={memberValue} onChange={setMember}
                options={[
                  ...members.map((m) => ({ value: String(m.id), label: <><span className={s.dot} style={{ background: tokenColor(m.colorToken) }} />{m.name}</> })),
                  { value: 'joint', label: <><span className={s.dot} style={{ background: 'var(--ink-3)' }} />Společné</> },
                ]} />
              <span className={s.hint}>
                {single
                  ? tx.sharesOverridden ? 'Nastaveno ručně' : `Podle karty plátce · ${account?.name ?? ''}`
                  : `Dělí se ${tx.shares.map((x) => `${memberName(x.memberId)} ${x.percent} %`).join(' : ')}${tx.sharesOverridden ? ' · ručně' : ' · podle nastavení účtu'}`}
                {tx.sharesOverridden && <> · <button type="button" className={s.inlineBtn} onClick={() => patch.mutate({ setMember: true, memberId: null })}>podle účtu</button></>}
              </span>
            </div>
          )}
        </div>
      </div>

      {ruleDone && (
        <div className={s.ruleDone}>
          <Check size={15} color="var(--pos)" />
          <span>Pravidlo uloženo: platby „{tx.counterparty}“ → {cats.nameOf(tx.categoryId)}. Najdete ho v Pravidlech.</span>
        </div>
      )}

      <div className={s.actions}>
        <Button icon={<Wand2 size={15} />} disabled={ruleDone || !!draft || tx.categoryId == null}
          title={tx.categoryId == null ? 'Nejdřív vyberte kategorii' : `Obchodník obsahuje „${tx.counterparty}“ → ${cats.nameOf(tx.categoryId)}`}
          onClick={() => patch.mutate({ createRule: true }, { onSuccess: () => setRuleDone(true) })}>
          {ruleDone ? 'Pravidlo vytvořeno' : 'Vytvořit pravidlo'}
        </Button>
        <Link to={`/pohyby?id=${tx.id}`} className={s.link}>Otevřít v Pohybech</Link>
        <span style={{ flex: 1 }} />
        {tx.status === 'Suggested' && (
          <Button variant="primary" icon={<Check size={15} />} disabled={tx.categoryId == null && tx.splits.length === 0}
            onClick={() => patch.mutate({ confirm: true })}>Potvrdit platbu</Button>
        )}
        <Button variant="dark" onClick={onClose}>Hotovo</Button>
      </div>
    </div>
  )
}
