import { useQueryClient } from '@tanstack/react-query'
import { CreditCard, Plus, ShieldCheck, X } from 'lucide-react'
import { useState } from 'react'
import { Button, Card, Switch, TextInput } from '../ui'
import { api, notifyError } from '../../lib/api'
import { whenLabel } from '../../lib/inbox'
import { invalidateInboundEmails, useInboundAccounts, useInboundSenders, type InboundAccount } from '../../lib/inboundEmails'
import s from './EmailProcessing.module.css'
import page from '../../pages/InboundEmailsPage.module.css'

/** Povolení odesílatelé: známé banky (zapnuté) a vlastní domény. */
export function SendersCard() {
  const qc = useQueryClient()
  const q = useInboundSenders()
  const [domain, setDomain] = useState('')
  const save = async (d: string, enabled: boolean) => {
    try {
      await api.put('/api/inbound-emails/senders', { domain: d, enabled })
      await invalidateInboundEmails(qc)
      return true
    } catch (e) {
      notifyError(e)
      return false
    }
  }
  const remove = async (d: string) => {
    try {
      await api.del(`/api/inbound-emails/senders/${encodeURIComponent(d)}`)
      await invalidateInboundEmails(qc)
    } catch (e) {
      notifyError(e)
    }
  }
  return (
    <Card>
      <div className={page.cardHead}><ShieldCheck size={18} /><h2>Povolení odesílatelé</h2></div>
      <p className={page.note}>
        E-mail se zpracuje, jen když ho podepsala povolená doména (DKIM). Ostatní jdou do karantény. Přeposlání přes Gmail podpis banky zachová.
      </p>
      <div className={s.senders}>
        {(q.data ?? []).map((x) => (
          <div key={x.domain} className={s.senderRow}>
            <div className="col" style={{ gap: 2, minWidth: 0 }}>
              <span style={{ fontSize: 14, fontWeight: 700 }}>{x.name} <span className={s.mono}>{x.domain}</span></span>
              <span className="muted" style={{ fontSize: 12 }}>{x.known ? (x.enabled ? 'známá banka' : 'vypnuto · e-maily jdou do karantény') : 'přidáno ručně'}</span>
            </div>
            <div className="row" style={{ gap: 6 }}>
              {!x.known && <Button size="sm" variant="ghost" onClick={() => remove(x.domain)}>Odebrat</Button>}
              <Switch checked={x.enabled} onChange={(v) => save(x.domain, v)} label={`Povolit ${x.domain}`} />
            </div>
          </div>
        ))}
      </div>
      <form className={s.addRow} onSubmit={async (e) => {
        e.preventDefault()
        if (domain.trim() && await save(domain.trim(), true)) setDomain('')
      }}>
        <TextInput value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="Doména, např. moneta.cz" aria-label="Doména odesílatele" />
        <Button type="submit" icon={<Plus size={15} />} disabled={!domain.trim()}>Přidat</Button>
      </form>
    </Card>
  )
}

function AccountCards({ a }: { a: InboundAccount }) {
  const qc = useQueryClient()
  const [adding, setAdding] = useState(false)
  const [value, setValue] = useState('')
  const save = async (cards: string[]) => {
    try {
      await api.put(`/api/inbound-emails/accounts/${a.id}/cards`, { cardSuffixes: cards })
      await invalidateInboundEmails(qc)
      return true
    } catch (e) {
      notifyError(e)
      return false
    }
  }
  return (
    <div className={s.account}>
      <div className="row" style={{ gap: 10, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div className="col grow" style={{ gap: 2, minWidth: 160 }}>
          <span style={{ fontSize: 14, fontWeight: 700 }}>{a.name}</span>
          <span className="muted" style={{ fontSize: 12 }}>{a.institution}{a.iban ? ` · ${a.iban}` : ''}{a.currency !== 'CZK' ? ` · ${a.currency}` : ''}</span>
        </div>
        <span className="muted" style={{ fontSize: 12 }}>{a.lastNotificationAt ? `notifikace ${whenLabel(a.lastNotificationAt)}` : 'zatím žádná notifikace'}</span>
      </div>
      <div className={s.cards}>
        <span className="muted">Karty</span>
        {a.cardSuffixes.map((c) => (
          <span key={c} className={s.card}>•• {c}
            <button type="button" aria-label={`Odebrat kartu ${c}`} onClick={() => save(a.cardSuffixes.filter((x) => x !== c))}><X size={13} /></button>
          </span>
        ))}
        {adding ? (
          <form className="row" style={{ gap: 6 }} onSubmit={async (e) => {
            e.preventDefault()
            if (await save([...a.cardSuffixes, value])) {
              setAdding(false)
              setValue('')
            }
          }}>
            <TextInput className={s.cardInput} value={value} inputMode="numeric" maxLength={4} autoFocus placeholder="1234"
              onChange={(e) => setValue(e.target.value.replace(/\D/g, '').slice(0, 4))} aria-label="Poslední 4 číslice karty" />
            <Button type="submit" size="sm" disabled={value.length !== 4}>Uložit</Button>
            <Button size="sm" variant="ghost" onClick={() => setAdding(false)}>Zrušit</Button>
          </form>
        ) : (
          <Button size="sm" variant="ghost" icon={<Plus size={14} />} onClick={() => setAdding(true)}>Karta</Button>
        )}
      </div>
    </div>
  )
}

/** Karty u účtů – podle posledních 4 číslic se přiřadí platby kartou. */
export function AccountsCard() {
  const accounts = useInboundAccounts().data ?? []
  return (
    <Card>
      <div className={page.cardHead}><CreditCard size={18} /><h2>Přiřazení k účtům</h2></div>
      <p className={page.note}>
        Pohyb se přiřadí podle čísla účtu v e-mailu. U plateb kartou banka často posílá jen poslední 4 číslice karty – zadejte je k účtu.
      </p>
      <div className="col" style={{ gap: 0 }}>{accounts.map((a) => <AccountCards key={a.id} a={a} />)}</div>
    </Card>
  )
}
