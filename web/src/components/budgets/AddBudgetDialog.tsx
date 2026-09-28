import { useState } from 'react'
import { useSetBudget } from '../../lib/budgets'
import { notifyOk } from '../../lib/api'
import type { BudgetPeriod, Member } from '../../lib/types'
import { CategoryPicker } from '../category'
import { Button, Dialog, Field, NumberInput, Segmented, Switch } from '../ui'

/** Nový rozpočet: kategorie, období, částka, přenos; s vybraným členem i volba domácnost / osobní. */
export function AddBudgetDialog({ open, onOpenChange, member, onCreated }: {
  open: boolean
  onOpenChange: (o: boolean) => void
  member: Member | null
  onCreated: (key: string) => void
}) {
  const save = useSetBudget()
  const [categoryId, setCategoryId] = useState<number | null>(null)
  const [period, setPeriod] = useState<Exclude<BudgetPeriod, 'None'>>('Monthly')
  const [amount, setAmount] = useState<number | null>(null)
  const [carry, setCarry] = useState(false)
  const [personal, setPersonal] = useState(false)

  const reset = () => {
    setCategoryId(null)
    setAmount(null)
    setCarry(false)
    setPeriod('Monthly')
    setPersonal(false)
  }
  const valid = categoryId != null && amount != null && amount > 0

  const submit = () => {
    if (!valid) return
    save.mutate(
      { categoryId: categoryId!, memberId: personal && member ? member.id : null, period, amount: Math.round(amount!), carryOver: period === 'Monthly' ? carry : false },
      {
        onSuccess: () => {
          notifyOk('Rozpočet přidán')
          onCreated(`${period === 'Monthly' ? 'm' : 'y'}${categoryId}`)
          onOpenChange(false)
          reset()
        },
      },
    )
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) reset() }} title="Přidat rozpočet"
      description="Limit platí pro všechny měsíce (roční pro celý rok). Nadřazená kategorie bez vlastního limitu sečte limity podkategorií."
      footer={<>
        <Button variant="ghost" onClick={() => onOpenChange(false)}>Zrušit</Button>
        <Button variant="dark" disabled={!valid} loading={save.isPending} onClick={submit}>Uložit</Button>
      </>}>
      <div className="col" style={{ gap: 14 }}>
        {member && (
          <Segmented<string> full value={personal ? 'p' : 'h'} onChange={(v) => setPersonal(v === 'p')} aria-label="Pro koho" options={[
            { value: 'h', label: 'Limit domácnosti' },
            { value: 'p', label: `Osobní limit (${member.name})` },
          ]} />
        )}
        <Field label="Kategorie">
          <CategoryPicker value={categoryId} onChange={setCategoryId} kind="Expense" block />
        </Field>
        <div className="col" style={{ gap: 6, fontSize: 13, fontWeight: 600, color: 'var(--ink-2)' }}>
          Období
          <Segmented full value={period} onChange={setPeriod} options={[
            { value: 'Monthly', label: 'Měsíčně' },
            { value: 'Yearly', label: 'Ročně' },
          ]} />
        </div>
        <Field label={period === 'Monthly' ? 'Měsíční limit' : 'Roční limit'}>
          <NumberInput value={amount} onChange={setAmount} decimals={0} suffix="Kč" placeholder="0"
            onKeyDown={(e) => { if (e.key === 'Enter') submit() }} />
        </Field>
        {period === 'Monthly' && (
          <label className="row" style={{ justifyContent: 'space-between', fontSize: 13, fontWeight: 600, gap: 12 }}>
            <span className="col" style={{ gap: 2 }}>
              Přenášet nevyčerpané do dalšího měsíce
              <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--ink-3)' }}>Co v měsíci zbyde, navýší limit dalšího měsíce</span>
            </span>
            <Switch checked={carry} onChange={setCarry} label="Přenášet nevyčerpané" />
          </label>
        )}
      </div>
    </Dialog>
  )
}
