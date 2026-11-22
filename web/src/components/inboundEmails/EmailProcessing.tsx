import { useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, Play, ShieldAlert, ShieldCheck } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Money } from '../common'
import { Button, Callout, Checkbox, Pill, Select } from '../ui'
import { api, notifyError, notifyOk } from '../../lib/api'
import { dateShort } from '../../lib/format'
import { invalidateInboundEmails, useInboundAccounts, type InboundEmailDetail, type InboundEmailState } from '../../lib/inboundEmails'
import s from './EmailProcessing.module.css'

const STATE_DONE: Record<InboundEmailState, string> = {
  Received: 'E-mail čeká na zpracování',
  Imported: 'Pohyby zapsány',
  Statement: 'Výpis načten',
  NotMovement: 'E-mail neoznamuje pohyb',
  Quarantined: 'E-mail je v karanténě',
  NeedsAccount: 'Vyberte účet',
  Failed: 'E-mail se nepodařilo zpracovat',
}

function useRun() {
  const qc = useQueryClient()
  const [busy, setBusy] = useState<string | null>(null)
  const run = async (key: string, fn: () => Promise<{ state: InboundEmailState } | void>) => {
    setBusy(key)
    try {
      const r = await fn()
      if (r) notifyOk(STATE_DONE[r.state])
      await invalidateInboundEmails(qc)
    } catch (e) {
      notifyError(e)
    } finally {
      setBusy(null)
    }
  }
  return { busy, run }
}

/** Ověření odesílatele (podpis DKIM a povolené domény). */
export function SenderAuth({ d }: { d: InboundEmailDetail }) {
  if (d.email.state === 'Received' && !d.dkimDomain) return null
  const ok = !!d.dkimDomain && d.senderAllowed
  return (
    <div className={s.auth} style={{ background: `color-mix(in oklch, ${ok ? 'var(--pos)' : 'var(--warn)'} 10%, var(--surface))` }}>
      {ok ? <ShieldCheck size={17} color="var(--pos)" /> : <ShieldAlert size={17} color="var(--warn)" />}
      <span>
        {ok ? <>Podepsáno odesílatelem · <b>{d.dkimDomain}</b></>
          : d.dkimDomain ? <>Podpis <b>{d.dkimDomain}</b> · odesílatel není mezi povolenými</>
            : 'Bez platného podpisu odesílatele – nejde ověřit, že e-mail poslala banka'}
      </span>
    </div>
  )
}

function stateTone(st: InboundEmailState): 'warn' | 'danger' | 'neutral' | 'pos' {
  if (st === 'Quarantined' || st === 'NeedsAccount') return 'warn'
  if (st === 'Failed') return 'danger'
  if (st === 'Imported' || st === 'Statement') return 'pos'
  return 'neutral'
}

/** Vytažené a zapsané pohyby, výběr účtu a akce podle stavu e-mailu. */
export function EmailProcessing({ d }: { d: InboundEmailDetail }) {
  const nav = useNavigate()
  const { busy, run } = useRun()
  const st = d.email.state
  const id = d.email.id
  const process = (force: boolean) => run(force ? 'force' : 'process',
    () => api.post<{ state: InboundEmailState }>(`/api/inbound-emails/${id}/process`, { force }))
  const allow = () => run('allow', async () => {
    await api.put('/api/inbound-emails/senders', { domain: d.dkimDomain, enabled: true })
    return api.post<{ state: InboundEmailState }>(`/api/inbound-emails/${id}/process`, { force: false })
  })

  const note = st === 'Received'
    ? (d.extractionAvailable ? 'E-mail čeká na zpracování, pohyby se vytáhnou za chvíli.' : d.note ?? 'Vytahování pohybů není na serveru zapnuté.')
    : d.note
  const pending = d.transactions.length === 0 && d.extracted?.kind === 'movements' ? d.extracted.movements : []

  return (
    <>
      {note && <Callout tone={stateTone(st)} icon={st === 'Failed' || st === 'Quarantined' ? <AlertTriangle size={16} /> : undefined}>{note}</Callout>}

      {d.transactions.length > 0 && (
        <div className="col" style={{ gap: 8 }}>
          <h3 className={s.h3}>Zapsané pohyby</h3>
          <div className={s.table}>
            {d.transactions.map((t) => (
              <button key={t.id} type="button" className={s.row} onClick={() => nav(t.status === 'Suggested' ? `/trideni?tx=${t.id}` : '/pohyby')}>
                <span className="muted">{dateShort(t.date)}</span>
                <span className="col" style={{ gap: 2, minWidth: 0 }}>
                  <b className="ellipsis">{t.counterparty || 'Bez protistrany'}</b>
                  <span className="muted ellipsis" style={{ fontSize: 12 }}>{t.account}</span>
                </span>
                {t.provisional ? <Pill tone="dashed" title="Potvrdí ho až výpis z účtu">Předběžný</Pill> : <Pill tone="pos">Z výpisu</Pill>}
                <Money value={t.amount} currency={t.currency} style={{ fontWeight: 800, textAlign: 'right' }} />
              </button>
            ))}
          </div>
        </div>
      )}

      {pending.length > 0 && (
        <div className="col" style={{ gap: 8 }}>
          <h3 className={s.h3}>Vytažený pohyb · nezapsáno</h3>
          <div className={s.table}>
            {pending.map((m, i) => (
              <div key={i} className={s.row} style={{ cursor: 'default' }}>
                <span className="muted">{dateShort(m.date)}</span>
                <span className="col" style={{ gap: 2, minWidth: 0 }}>
                  <b className="ellipsis">{m.counterparty || 'Bez protistrany'}</b>
                  <span className="muted ellipsis" style={{ fontSize: 12 }}>
                    {[m.cardSuffix && `karta •• ${m.cardSuffix.replace(/\D/g, '').slice(-4)}`, m.accountNumber && `účet ${m.accountNumber}`,
                      m.authorization && 'blokace'].filter(Boolean).join(' · ') || m.paymentType}
                  </span>
                </span>
                <span />
                <Money value={m.amount} currency={m.currency} style={{ fontWeight: 800, textAlign: 'right' }} />
              </div>
            ))}
          </div>
        </div>
      )}

      {st === 'NeedsAccount' && <AssignAccount d={d} busy={busy === 'assign'} run={run} />}

      <div className={s.actions}>
        {st === 'Received' && d.extractionAvailable && (
          <Button variant="primary" icon={<Play size={15} />} loading={busy === 'process'} onClick={() => process(false)}>Zpracovat</Button>
        )}
        {st === 'Quarantined' && d.dkimDomain && !d.senderAllowed && (
          <Button variant="primary" icon={<ShieldCheck size={15} />} loading={busy === 'allow'} onClick={allow}>Povolit {d.dkimDomain}</Button>
        )}
        {st === 'Quarantined' && d.extractionAvailable && (
          <Button loading={busy === 'force'} onClick={() => process(true)}>Zpracovat přesto</Button>
        )}
        {(st === 'Failed' || st === 'NotMovement') && d.extractionAvailable && (
          <Button loading={busy === 'process'} onClick={() => process(false)}>Zpracovat znovu</Button>
        )}
      </div>
    </>
  )
}

function AssignAccount({ d, busy, run }: {
  d: InboundEmailDetail
  busy: boolean
  run: (key: string, fn: () => Promise<{ state: InboundEmailState }>) => Promise<void>
}) {
  const accounts = useInboundAccounts().data ?? []
  const [accountId, setAccountId] = useState<string | null>(null)
  const card = d.extracted?.movements.map((m) => m.cardSuffix?.replace(/\D/g, '').slice(-4)).find((c) => c && c.length === 4)
  const [remember, setRemember] = useState(true)
  return (
    <div className={s.assign}>
      <span style={{ fontSize: 13, fontWeight: 700 }}>Ke kterému účtu pohyb patří?</span>
      <Select value={accountId} onChange={setAccountId} placeholder="Vyberte účet" aria-label="Účet"
        options={accounts.map((a) => ({ value: String(a.id), label: `${a.name} · ${a.institution}${a.currency !== 'CZK' ? ` · ${a.currency}` : ''}` }))} />
      {card && (
        <label className="row" style={{ gap: 8, fontSize: 13, cursor: 'pointer', minHeight: 32 }}>
          <Checkbox checked={remember} onChange={setRemember} label={`Zapamatovat kartu •• ${card} k tomuto účtu`} />
          <span>Zapamatovat kartu •• {card} k tomuto účtu</span>
        </label>
      )}
      <div>
        <Button variant="primary" disabled={!accountId} loading={busy}
          onClick={() => run('assign', () => api.post(`/api/inbound-emails/${d.email.id}/assign`, { accountId: Number(accountId), rememberCard: !!card && remember }))}>
          Zapsat pohyb
        </Button>
      </div>
    </div>
  )
}
