import { useMutation, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, notifyError, notifyOk } from '../../lib/api'
import { useUi } from '../../state/ui'
import { Button, Callout, Dialog, Field, TextInput } from '../ui'

/** Nevratné smazání dat domácnosti – potvrzení opsáním názvu (jen vlastník). */
export function DeleteHouseholdDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { household } = useUi()
  const qc = useQueryClient()
  const nav = useNavigate()
  const [text, setText] = useState('')
  const matches = text.trim() === household.name
  const del = useMutation({
    mutationFn: () => api.post('/api/household/delete-data', { confirmName: text.trim() }),
    onSuccess: () => {
      notifyOk('Data domácnosti smazána')
      onOpenChange(false)
      nav('/', { replace: true })
      qc.invalidateQueries()
    },
    onError: notifyError,
  })
  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) setText('') }} title="Smazat domácnost?"
      description="Nevratně smaže účty, pohyby, kategorie, pravidla, rozpočty i investice. Členové a připojení Clauda zůstanou, průvodce začne znovu."
      footer={<>
        <span style={{ flex: 1 }} />
        <Button variant="secondary" onClick={() => onOpenChange(false)}>Zpět</Button>
        <Button variant="danger" disabled={!matches} loading={del.isPending} onClick={() => del.mutate()}>Smazat vše</Button>
      </>}>
      <Callout tone="danger" icon={<AlertTriangle size={16} />}>
        Než budeš pokračovat, zvaž export pohybů do CSV. Smazání nejde vrátit.
      </Callout>
      <Field label={<span>Pro potvrzení opiš název domácnosti <b style={{ color: 'var(--ink)' }}>{household.name}</b></span>}>
        <TextInput value={text} onChange={(e) => setText(e.target.value)} placeholder={household.name} autoComplete="off" />
      </Field>
    </Dialog>
  )
}
