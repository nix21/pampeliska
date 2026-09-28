import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import clsx from 'clsx'
import { Ban, Check, Repeat, Trash2, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useAccounts } from '../../lib/accounts'
import { api, notifyError, notifyOk } from '../../lib/api'
import { needColor } from '../../lib/categories'
import { count, dateShort, money } from '../../lib/format'
import {
  conditionValid, defaultValue, FIELDS, fieldLabel, opLabel, opsFor, sourceLabel,
  type RuleCondition, type RuleDto, type RuleField, type RuleInput, type RuleLogic, type RuleOp, type RuleTestResult,
} from '../../lib/rules'
import type { NeedType } from '../../lib/types'
import { useUi } from '../../state/ui'
import { useDebounced } from '../categories/hooks'
import { invalidateData } from '../categories/model'
import { CategoryPicker } from '../category'
import { commonStyles } from '../common'
import { Button, Checkbox, Dialog, Segmented, Select, TextInput } from '../ui'
import s from './rules.module.css'

export interface RuleDraft {
  conditions: RuleCondition[]
  logic: RuleLogic
  categoryId: number | null
  needOverride: NeedType | null
  memberId: number | null
  excludeFromStats: boolean
  markRecurring: boolean
}

const fromDto = (r?: RuleDto): RuleDraft => r
  ? {
    conditions: r.conditions.map((c) => ({ ...c })), logic: r.logic, categoryId: r.categoryId, needOverride: r.needOverride ?? null,
    memberId: r.memberId ?? null, excludeFromStats: r.excludeFromStats, markRecurring: r.markRecurring,
  }
  : { conditions: [{ field: 'Merchant', op: 'Contains', value: '' }], logic: 'And', categoryId: null, needOverride: null, memberId: null, excludeFromStats: false, markRecurring: false }

const toInput = (d: RuleDraft): RuleInput => ({
  conditions: d.conditions.map((c) => ({ ...c, value: c.value.trim() })),
  logic: d.logic,
  categoryId: d.categoryId,
  needOverride: d.needOverride,
  setNeed: true,
  memberId: d.memberId,
  setMember: true,
  excludeFromStats: d.excludeFromStats,
  markRecurring: d.markRecurring,
})

type NeedChoice = 'inherit' | 'Need' | 'Joy'

/** Editor pravidla: podmínky, akce, živý test na historii a uložení (volitelně i zpětné použití). */
export function RuleEditor({ rule, mobile, onSaved, onDeleted }: {
  /** undefined = nové pravidlo */
  rule?: RuleDto
  mobile: boolean
  onSaved: (id: number) => void
  onDeleted: () => void
}) {
  const qc = useQueryClient()
  const { household } = useUi()
  const accounts = useAccounts()
  const [draft, setDraft] = useState<RuleDraft>(() => fromDto(rule))
  const [apply, setApply] = useState(true)
  const [saved, setSaved] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const edit = (fn: (d: RuleDraft) => RuleDraft) => {
    setDraft(fn)
    setSaved(false)
  }
  const setCond = (i: number, patch: Partial<RuleCondition>) =>
    edit((d) => ({ ...d, conditions: d.conditions.map((c, j) => (j === i ? { ...c, ...patch } : c)) }))

  // ---- Živý test na historii ----
  const testDraft = useDebounced(draft, 400)
  const testInput = useMemo(() => {
    const input = toInput(testDraft)
    return { ...input, conditions: input.conditions!.filter(conditionValid) }
  }, [testDraft])
  const test = useQuery({
    queryKey: ['rule-test', rule?.id ?? 'new', testInput],
    queryFn: () => api.post<RuleTestResult>('/api/rules/test', { draft: { ...testInput, categoryId: testInput.categoryId ?? undefined }, ruleId: rule?.id ?? null }),
    enabled: testInput.conditions.length > 0,
    placeholderData: keepPreviousData,
  })
  const t = testInput.conditions.length > 0 ? test.data : undefined

  const valid = draft.categoryId != null && draft.conditions.length > 0 && draft.conditions.every(conditionValid)
  const enabled = rule?.enabled ?? true

  const save = useMutation({
    mutationFn: async () => {
      const input = toInput(draft)
      let id = rule?.id
      if (id != null) await api.put(`/api/rules/${id}`, input)
      else id = (await api.post<{ id: number }>('/api/rules', { ...input, position: 1, source: 'Manual' })).id
      const changed = apply && enabled ? (await api.post<{ changed: number }>(`/api/rules/${id}/apply`)).changed : 0
      return { id, changed }
    },
    onSuccess: async ({ id, changed }) => {
      notifyOk(changed > 0 ? `Pravidlo uloženo · přeřazeno ${count(changed, 'platba', 'platby', 'plateb')}` : 'Pravidlo uloženo')
      await invalidateData(qc)
      setSaved(true)
      onSaved(id)
    },
    onError: notifyError,
  })
  const del = useMutation({
    mutationFn: () => api.del(`/api/rules/${rule!.id}`),
    onSuccess: () => {
      notifyOk('Pravidlo smazáno')
      setConfirmDelete(false)
      invalidateData(qc)
      onDeleted()
    },
    onError: notifyError,
  })

  const title = rule ? `Pravidlo ${rule.position}` : 'Nové pravidlo'
  const meta = rule ? `${sourceLabel[rule.source]} · ${rule.matches ? `${rule.matches}× použito` : 'nové'}` : 'Ručně · nové'
  const hasTime = draft.conditions.some((c) => c.field === 'Time')
  const needValue: NeedChoice = draft.needOverride === 'Need' || draft.needOverride === 'Joy' ? draft.needOverride : 'inherit'
  const logicOpts = [{ value: 'And' as RuleLogic, label: 'Všechny platí' }, { value: 'Or' as RuleLogic, label: 'Kterákoli' }]

  const valueInput = (c: RuleCondition, i: number) => {
    if (c.field === 'Account') {
      return (
        <Select size={mobile ? 'md' : 'sm'} aria-label="Účet" value={c.value || null} placeholder="Vyber účet" onChange={(v) => setCond(i, { value: v })}
          options={accounts.list.map((a) => ({ value: String(a.id), label: a.name }))} />
      )
    }
    const placeholder = { Merchant: 'např. ALBERT', Mcc: 'např. 5812', Time: '11:00–14:00', CounterpartyAccount: '123-456789/0800', Account: '', Amount: '1000' }[c.field]
    return (
      <TextInput className={s.valueInput} value={c.value} placeholder={placeholder} aria-label="Hodnota" suffix={c.field === 'Amount' ? 'Kč' : undefined}
        inputMode={c.field === 'Amount' ? 'decimal' : undefined} style={conditionValid(c) || !c.value ? undefined : { borderColor: 'var(--neg)' }}
        onChange={(e) => setCond(i, { value: e.target.value })} />
    )
  }
  const fieldSelect = (c: RuleCondition, i: number) => (
    <Select size={mobile ? 'md' : 'sm'} aria-label="Pole" value={c.field} className={s.condSelect}
      onChange={(v) => {
        const f = v as RuleField
        if (f !== c.field) setCond(i, { field: f, op: opsFor[f][0], value: defaultValue[f] || (f === 'Merchant' || f === 'Mcc' ? c.value : '') })
      }}
      options={FIELDS.map((f) => ({ value: f, label: fieldLabel[f] }))} />
  )
  const opSelect = (c: RuleCondition, i: number) => (
    <Select size={mobile ? 'md' : 'sm'} aria-label="Operátor" value={c.op} className={s.condSelect}
      onChange={(v) => setCond(i, { op: v as RuleOp })} options={opsFor[c.field].map((o) => ({ value: o, label: opLabel[o] }))} />
  )
  const removeBtn = (i: number) => (
    <button type="button" className={s.remove} aria-label="Odebrat podmínku" disabled={draft.conditions.length < 2}
      onClick={() => edit((d) => ({ ...d, conditions: d.conditions.filter((_, j) => j !== i) }))}>
      <X size={16} />
    </button>
  )

  return (
    <div className={s.editor}>
      <div className={s.editorHead}>
        <span className={s.editorTitle}>{title}</span>
        <span className={s.meta}>{meta}</span>
      </div>

      <div className={s.block}>
        <div className="row">
          <span className={s.blockTitle}>Když</span>
          <Segmented<RuleLogic> size="sm" aria-label="Logika podmínek" value={draft.logic} onChange={(v) => edit((d) => ({ ...d, logic: v }))} options={logicOpts} />
        </div>
        {draft.conditions.map((c, i) => mobile ? (
          <div key={i} className={s.condCard}>
            <div className="row" style={{ gap: 6 }}>
              {fieldSelect(c, i)}
              {opSelect(c, i)}
              {removeBtn(i)}
            </div>
            {valueInput(c, i)}
          </div>
        ) : (
          <div key={i} className={s.condRow}>
            {fieldSelect(c, i)}
            {opSelect(c, i)}
            {valueInput(c, i)}
            {removeBtn(i)}
          </div>
        ))}
        {hasTime && <span className={s.hint}>Čas ve formátu 11:00–14:00. Rozsah přes půlnoc (22:00–04:00) funguje taky. Bere se čas transakce z banky.</span>}
        <button type="button" className={clsx(s.addCond, mobile && s.addCondMobile)}
          onClick={() => edit((d) => ({ ...d, conditions: [...d.conditions, { field: 'Merchant', op: 'Contains', value: '' }] }))}>
          + Přidat podmínku
        </button>
      </div>

      <div className={s.block}>
        <span className={s.blockTitle}>Pak</span>
        <div className={s.actGrid}>
          <span className={s.actLabel}>Kategorie</span>
          <CategoryPicker block size={mobile ? 'md' : 'sm'} value={draft.categoryId} onChange={(id) => edit((d) => ({ ...d, categoryId: id }))} />
          <span className={s.actLabel}>Typ výdaje</span>
          <Segmented<NeedChoice> full size="sm" aria-label="Typ výdaje" value={needValue}
            onChange={(v) => edit((d) => ({ ...d, needOverride: v === 'inherit' ? null : v }))}
            options={[
              { value: 'inherit', label: <><span className={s.needDot} style={{ background: 'var(--none)' }} />Z kategorie</> },
              { value: 'Need', label: <><span className={s.needDot} style={{ background: needColor.Need }} />Nezbytné</> },
              { value: 'Joy', label: <><span className={s.needDot} style={{ background: needColor.Joy }} />Pro radost</> },
            ]} />
          {household.members.length > 0 && (
            <>
              <span className={s.actLabel}>Člen</span>
              <Segmented<string> full size="sm" aria-label="Člen" value={draft.memberId == null ? 'none' : String(draft.memberId)}
                onChange={(v) => edit((d) => ({ ...d, memberId: v === 'none' ? null : Number(v) }))}
                options={[{ value: 'none', label: 'Neměnit' }, ...household.members.map((m) => ({ value: String(m.id), label: m.name }))]} />
            </>
          )}
        </div>
        <div className="row wrap">
          <button type="button" aria-pressed={draft.excludeFromStats} className={clsx(commonStyles.chip, draft.excludeFromStats && commonStyles.chipOn)}
            onClick={() => edit((d) => ({ ...d, excludeFromStats: !d.excludeFromStats }))}>
            <Ban size={12} /> Nezapočítávat
          </button>
          <button type="button" aria-pressed={draft.markRecurring} className={clsx(commonStyles.chip, draft.markRecurring && commonStyles.chipOn)}
            onClick={() => edit((d) => ({ ...d, markRecurring: !d.markRecurring }))}>
            <Repeat size={12} /> Označit jako pravidelnou
          </button>
        </div>
      </div>

      <div className={s.test}>
        <div className={s.testHead}>
          <span className={s.blockTitle}>Test na historii</span>
          <span className={s.testSum}>
            {test.isFetching && !t ? 'počítám…' : t && t.matches > 0 ? `odpovídá ${count(t.matches, 'platba', 'platby', 'plateb')} za 6 měsíců` : '0 shod'}
          </span>
        </div>
        {t?.sample.map((m) => {
          const badge = m.willChange ? (apply ? m.note : '') : m.note === 'beze změny' ? '' : m.note
          return (
            <div key={m.transactionId} className={s.match}>
              <span className="faint num">{dateShort(m.date)}{m.time ? ` ${m.time.slice(0, 5)}` : ''}</span>
              <span className={s.matchName}>
                <span className="ellipsis" style={{ fontWeight: 600 }}>{m.counterparty}</span>
                {badge && <span className={s.badge}>{badge}</span>}
              </span>
              <span className="num" style={{ fontWeight: 700 }}>{money(Math.abs(m.amount), { currency: m.currency })}</span>
            </div>
          )
        })}
        {t && t.matches > t.sample.length && <span className={s.hint}>… a další {count(t.matches - t.sample.length, 'platba', 'platby', 'plateb')}</span>}
        {(!t || t.matches === 0) && !test.isFetching && <span className={s.hint}>Žádná platba za posledních 6 měsíců neodpovídá.</span>}
        <label className={s.applyRow}>
          <Checkbox checked={apply && enabled} disabled={!enabled} onChange={setApply} label="Použít i na existující platby" />
          <span className="grow">Použít i na existující platby</span>
          <span className="faint" style={{ fontSize: 12 }}>
            {!enabled ? 'pravidlo je vypnuté' : t?.changes ? count(t.changes, 'změna', 'změny', 'změn') : 'beze změn'}
          </span>
        </label>
      </div>

      <div className={clsx(s.saveRow, mobile && s.saveRowMobile)}>
        <Button variant="primary" size="lg" className="grow" icon={<Check size={16} />} disabled={!valid}
          loading={save.isPending} onClick={() => save.mutate()}
          title={!valid ? (draft.categoryId == null ? 'Vyber cílovou kategorii' : 'Doplň hodnoty podmínek') : undefined}>
          {saved ? 'Uloženo' : 'Uložit pravidlo'}
        </Button>
        {rule && (
          <Button size="lg" className={s.deleteBtn} aria-label="Smazat pravidlo" title="Smazat pravidlo" icon={<Trash2 size={16} />}
            onClick={() => setConfirmDelete(true)} />
        )}
      </div>

      {rule && (
        <Dialog open={confirmDelete} onOpenChange={setConfirmDelete} title={`Smazat pravidlo ${rule.position}?`} description={rule.description}
          footer={
            <>
              <Button variant="ghost" onClick={() => setConfirmDelete(false)}>Zrušit</Button>
              <Button variant="danger" loading={del.isPending} onClick={() => del.mutate()}>Smazat</Button>
            </>
          }>
          <span className="muted" style={{ fontSize: 13 }}>Už zařazené platby zůstanou, jak jsou. Nové platby se podle pravidla řadit nebudou.</span>
        </Dialog>
      )}
    </div>
  )
}
