import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Check, Scale } from 'lucide-react'
import { useState } from 'react'
import { useAccounts } from '../../lib/accounts'
import { api, notifyError, notifyOk } from '../../lib/api'
import { currencySymbol } from '../../lib/format'
import { accountLabel, invalidateTx, type CorrectionInput, type CorrectionResult, type ManualTxInput } from '../../lib/transactions'
import type { Account, TxDetail } from '../../lib/types'
import { useUi } from '../../state/ui'
import { CategoryPicker } from '../category'
import { InstitutionBadge, useMoney } from '../common'
import { Button, DateInput, Dialog, Field, NumberInput, Segmented, Select, TextInput } from '../ui'

const accountOptions = (list: Account[]) =>
  list.map((a) => ({ value: String(a.id), label: accountLabel(a), prefix: <InstitutionBadge institution={a.institution} name={a.name} size={20} /> }))

/** „+ Přidat pohyb“ – ruční pohyb (hotovost, účet bez výpisu). */
export function AddTransactionDialog({ open, onOpenChange, defaultAccountId, onCreated }: {
  open: boolean
  onOpenChange: (o: boolean) => void
  defaultAccountId?: number | null
  onCreated?: (id: number) => void
}) {
  const qc = useQueryClient()
  const { household } = useUi()
  const accounts = useAccounts().list.filter((a) => !a.archived && a.kind !== 'Investment')
  const [accountId, setAccountId] = useState<number | null>(defaultAccountId ?? null)
  const [date, setDate] = useState<string | null>(household.today)
  const [amount, setAmount] = useState<number | null>(null)
  const [dir, setDir] = useState<'out' | 'in'>('out')
  const [counterparty, setCounterparty] = useState('')
  const [message, setMessage] = useState('')
  const [categoryId, setCategoryId] = useState<number | null>(null)
  const acc = accounts.find((a) => a.id === accountId) ?? (accounts.length === 1 ? accounts[0] : undefined)

  const reset = () => {
    setAmount(null)
    setCounterparty('')
    setMessage('')
    setCategoryId(null)
  }
  const save = useMutation({
    mutationFn: (i: ManualTxInput) => api.post<TxDetail>('/api/transactions', i),
    onSuccess: (d) => {
      invalidateTx(qc)
      notifyOk('Pohyb přidán')
      reset()
      onOpenChange(false)
      onCreated?.(d.tx.id)
    },
    onError: notifyError,
  })
  const valid = !!acc && !!date && !!amount && amount > 0 && counterparty.trim().length > 0

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Přidat pohyb"
      description="Ruční pohyb pro hotovost nebo účet bez výpisu. Uloží se do nové ruční dávky."
      footer={(
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Zrušit</Button>
          <Button variant="primary" icon={<Check size={16} />} disabled={!valid} loading={save.isPending}
            onClick={() => acc && date && amount && save.mutate({
              accountId: acc.id, date, amount: dir === 'out' ? -Math.abs(amount) : Math.abs(amount), counterparty: counterparty.trim(),
              message: message.trim() || null, categoryId, confirm: true,
            })}>
            Přidat pohyb
          </Button>
        </>
      )}>
      <Field label="Účet">
        <Select value={acc ? String(acc.id) : null} onChange={(v) => setAccountId(Number(v))} options={accountOptions(accounts)} placeholder="Vyber účet" aria-label="Účet" />
      </Field>
      <div className="row" style={{ alignItems: 'flex-end', gap: 12 }}>
        <Field label="Datum" className="grow"><DateInput value={date} onChange={setDate} /></Field>
        <Segmented<'out' | 'in'> aria-label="Směr" value={dir} onChange={(v) => { setDir(v); setCategoryId(null) }}
          options={[{ value: 'out', label: 'Výdaj' }, { value: 'in', label: 'Příjem' }]} />
      </div>
      <Field label="Částka">
        <NumberInput value={amount} onChange={setAmount} suffix={currencySymbol[acc?.currency ?? 'CZK'] ?? acc?.currency} placeholder="0" autoFocus />
      </Field>
      <Field label="Protistrana / popis">
        <TextInput value={counterparty} onChange={(e) => setCounterparty(e.target.value)} placeholder="např. Trafika u metra" />
      </Field>
      <Field label="Zpráva (nepovinné)">
        <TextInput value={message} onChange={(e) => setMessage(e.target.value)} />
      </Field>
      <Field label="Kategorie" hint={categoryId ? 'Pohyb se rovnou potvrdí.' : 'Bez kategorie zůstane ke kategorizaci.'}>
        <CategoryPicker block value={categoryId} kind={dir === 'out' ? 'Expense' : 'Income'} onChange={setCategoryId} />
      </Field>
    </Dialog>
  )
}

/** „Korekce zůstatku“ – dorovnání evidovaného zůstatku podle výpisu. */
export function CorrectionDialog({ open, onOpenChange, defaultAccountId, onCreated }: {
  open: boolean
  onOpenChange: (o: boolean) => void
  defaultAccountId?: number | null
  onCreated?: (id: number) => void
}) {
  const qc = useQueryClient()
  const { household } = useUi()
  const fm = useMoney()
  const accounts = useAccounts().list.filter((a) => !a.archived && a.kind !== 'Investment')
  const [accountId, setAccountId] = useState<number | null>(defaultAccountId ?? null)
  const [date, setDate] = useState<string | null>(household.today)
  const [balance, setBalance] = useState<number | null>(null)
  const acc = accounts.find((a) => a.id === accountId) ?? (accounts.length === 1 ? accounts[0] : undefined)

  const save = useMutation({
    mutationFn: ({ id, input }: { id: number; input: CorrectionInput }) => api.post<CorrectionResult>(`/api/accounts/${id}/corrections`, input),
    onSuccess: (r) => {
      invalidateTx(qc)
      notifyOk(`Korekce ${fm(r.amount, { currency: acc?.currency, sign: true })} uložena`)
      setBalance(null)
      onOpenChange(false)
      onCreated?.(r.id)
    },
    onError: notifyError,
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Korekce zůstatku"
      description="Když evidovaný zůstatek nesedí s bankou, zadej skutečný zůstatek ke dni. Rozdíl se uloží jako korekce, která se nezapočítává do statistik."
      footer={(
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Zrušit</Button>
          <Button variant="primary" icon={<Scale size={16} />} disabled={!acc || !date || balance == null} loading={save.isPending}
            onClick={() => acc && date && balance != null && save.mutate({ id: acc.id, input: { date, actualBalance: balance } })}>
            Uložit korekci
          </Button>
        </>
      )}>
      <Field label="Účet" hint={acc ? `Evidovaný zůstatek dnes: ${fm(acc.balance, { currency: acc.currency })}` : undefined}>
        <Select value={acc ? String(acc.id) : null} onChange={(v) => setAccountId(Number(v))} options={accountOptions(accounts)} placeholder="Vyber účet" aria-label="Účet" />
      </Field>
      <Field label="Ke dni"><DateInput value={date} onChange={setDate} /></Field>
      <Field label="Skutečný zůstatek podle výpisu">
        <NumberInput value={balance} onChange={setBalance} suffix={currencySymbol[acc?.currency ?? 'CZK'] ?? acc?.currency} placeholder="0" />
      </Field>
    </Dialog>
  )
}
