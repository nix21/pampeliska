import { useQueryClient } from '@tanstack/react-query'
import clsx from 'clsx'
import { Check, Copy, Download, FileText, Mail, RefreshCw, ShieldCheck, Trash2, Upload } from 'lucide-react'
import { useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { PageHeader } from '../components/AppShell'
import { EmailProcessing, SenderAuth } from '../components/inboundEmails/EmailProcessing'
import { AccountsCard, PasswordsCard, SendersCard } from '../components/inboundEmails/SenderSettings'
import { Button, Callout, Card, Dialog, Empty, Segmented, Spinner } from '../components/ui'
import { api, notifyError, notifyOk } from '../lib/api'
import { count, num } from '../lib/format'
import { fileSize } from '../lib/household'
import { useIsMobile, whenLabel } from '../lib/inbox'
import {
  invalidateInboundEmails, matchesFilter, senderLabel, STATE_META, useInboundAddress, useInboundEmail, useInboundEmails, type EmailFilter,
  type InboundEmailDetail, type InboundEmailRow,
} from '../lib/inboundEmails'
import { useUi } from '../state/ui'
import s from './InboundEmailsPage.module.css'

type Tab = 'prijate' | 'nastaveni'

function StatePill({ e }: { e: InboundEmailRow }) {
  const [label, dot] = STATE_META[e.state]
  return <span className={s.pill}><span className={s.dot} style={{ background: dot }} />{label}</span>
}

function useCopy() {
  const [copied, setCopied] = useState(false)
  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch (e) {
      notifyError(e)
    }
  }
  return { copied, copy }
}

function CopyButton({ text, label = 'Kopírovat', variant = 'secondary', size }: { text: string; label?: string; variant?: 'secondary' | 'dark'; size?: 'sm' }) {
  const { copied, copy } = useCopy()
  return (
    <Button size={size} variant={variant} icon={copied ? <Check size={15} /> : <Copy size={15} />} onClick={() => copy(text)}>
      {copied ? 'Zkopírováno' : label}
    </Button>
  )
}

/** Nahrání .eml souboru – projde stejným zpracováním jako e-mail přijatý přes SMTP. */
function UploadButton({ onUploaded }: { onUploaded: (id: number) => void }) {
  const qc = useQueryClient()
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const upload = async (file: File) => {
    setBusy(true)
    try {
      const r = await api.post<{ id: number; duplicate: boolean }>('/api/inbound-emails', new Blob([file], { type: 'message/rfc822' }))
      notifyOk(r.duplicate ? 'Tenhle e-mail už je uložený' : 'E-mail nahrán')
      await invalidateInboundEmails(qc)
      onUploaded(r.id)
    } catch (e) {
      notifyError(e)
    } finally {
      setBusy(false)
      if (input.current) input.current.value = ''
    }
  }
  return (
    <>
      <input ref={input} type="file" accept=".eml,message/rfc822" hidden onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
      <Button icon={<Upload size={16} />} loading={busy} onClick={() => input.current?.click()}>Nahrát .eml</Button>
    </>
  )
}

function DeleteEmail({ e, onDeleted }: { e: InboundEmailRow; onDeleted: () => void }) {
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const remove = async () => {
    setBusy(true)
    try {
      await api.del(`/api/inbound-emails/${e.id}`)
      notifyOk('E-mail smazán')
      setOpen(false)
      onDeleted()
      await invalidateInboundEmails(qc)
    } catch (err) {
      notifyError(err)
    } finally {
      setBusy(false)
    }
  }
  return (
    <>
      <Button variant="ghost" icon={<Trash2 size={15} />} onClick={() => setOpen(true)}>Smazat</Button>
      <Dialog open={open} onOpenChange={setOpen} title="Smazat e-mail?" description="E-mail se trvale odstraní z Pampelišky. Pohyby, které z něj vznikly, zůstanou."
        footer={(
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>Zrušit</Button>
            <Button variant="danger" icon={<Trash2 size={15} />} loading={busy} onClick={remove}>Smazat</Button>
          </>
        )}>
        <span className="muted">{senderLabel(e)} · {e.subject || 'Bez předmětu'} · {whenLabel(e.receivedAt)}</span>
      </Dialog>
    </>
  )
}

function Detail({ row, detail, loading, onDeleted, onBack }: {
  row: InboundEmailRow
  detail?: InboundEmailDetail
  loading: boolean
  onDeleted: () => void
  onBack?: () => void
}) {
  const d = detail?.email.id === row.id ? detail : undefined
  return (
    <section className={s.detail} aria-label="Detail e-mailu">
      {onBack && <Button variant="ghost" className={s.back} onClick={onBack}>← Přijaté e-maily</Button>}
      <div className={s.detailHead}>
        <div className="col" style={{ gap: 4, flex: 1, minWidth: 0 }}>
          <h2 className={s.subject}>{row.subject || 'Bez předmětu'}</h2>
          <span className="muted" style={{ fontSize: 13 }}>
            {senderLabel(row)}{row.fromName && row.fromAddress ? <> · <span className={s.mono}>{row.fromAddress}</span></> : null} · {whenLabel(row.receivedAt)}
            {row.source === 'Upload' ? ' · nahráno ručně' : ''}
          </span>
        </div>
        <StatePill e={row} />
      </div>

      {loading && !d ? <Spinner center /> : d && (
        <>
          <SenderAuth d={d} />
          <EmailProcessing d={d} />
          {d.error && d.error !== d.note && <Callout tone="danger">{d.error}</Callout>}
          {d.attachments.length > 0 && (
            <div className={s.attachments}>
              {d.attachments.map((a, i) => (
                <span key={i} className={s.attachment}><FileText size={15} />{a.name}<span className="faint">{a.sizeBytes ? fileSize(a.sizeBytes) : ''}</span></span>
              ))}
            </div>
          )}
          <div className={s.body}>{d.textBody || <span className="faint">E-mail nemá čitelný text.</span>}</div>
          <details className={s.tech}>
            <summary>Technické údaje</summary>
            <dl>
              <dt>Obálka od</dt><dd className={s.mono}>{d.envelopeFrom || '—'}</dd>
              <dt>Obálka pro</dt><dd className={s.mono}>{d.envelopeTo || '—'}</dd>
              <dt>Odesláno</dt><dd>{d.sentAt ? whenLabel(d.sentAt) : '—'}</dd>
              <dt>Server</dt><dd className={s.mono}>{d.remoteIp || '—'}</dd>
              <dt>Message-ID</dt><dd className={s.mono}>{d.messageId || '—'}</dd>
              <dt>Velikost</dt><dd>{fileSize(row.sizeBytes)}</dd>
            </dl>
          </details>
          <div className={s.actions}>
            {d.hasRaw
              ? <a className={s.linkBtn} href={`/api/inbound-emails/${row.id}/raw`} download><Download size={15} /> Stáhnout .eml</a>
              : <span className="faint" style={{ fontSize: 12 }}>Původní e-mail už je smazaný, zůstal jen text.</span>}
            <DeleteEmail e={row} onDeleted={onDeleted} />
          </div>
        </>
      )}
    </section>
  )
}

function EmailList({ list, selId, onSelect }: { list: InboundEmailRow[]; selId: number | null; onSelect: (id: number) => void }) {
  const [filter, setFilter] = useState<EmailFilter>('all')
  const n = (f: EmailFilter) => list.filter((e) => matchesFilter(e, f)).length
  const processed = list.some((e) => e.state !== 'Received')
  const shown = list.filter((e) => matchesFilter(e, filter))
  return (
    <section className={s.list} aria-label="Seznam e-mailů">
      {processed && (
        <Segmented<EmailFilter> size="sm" value={filter} onChange={setFilter} aria-label="Filtr"
          options={([['all', 'Vše'], ['todo', 'K vyřešení'], ['done', 'Zapsané'], ['not', 'Není pohyb']] as const).map(([v, l]) => ({
            value: v, label: <>{l} <span className={s.cnt}>{num(n(v))}</span></>,
          }))} />
      )}
      <div className={s.items}>
        {shown.map((e) => (
          <button key={e.id} type="button" className={clsx(s.item, e.id === selId && s.itemOn)} onClick={() => onSelect(e.id)} aria-current={e.id === selId || undefined}>
            <span className={s.itemTop}>
              <span className={s.from}>{senderLabel(e)}</span>
              <span className={s.when}>{whenLabel(e.receivedAt)}</span>
            </span>
            <span className={s.subj}>{e.subject || 'Bez předmětu'}</span>
            <span className={s.itemBottom}>
              <StatePill e={e} />
              {e.attachmentCount > 0 && <span className="faint" style={{ fontSize: 12 }}>{count(e.attachmentCount, 'příloha', 'přílohy', 'příloh')}</span>}
            </span>
          </button>
        ))}
        {shown.length === 0 && <span className="faint" style={{ padding: '24px 8px', textAlign: 'center', fontSize: 13 }}>V tomhle filtru nic není.</span>}
      </div>
    </section>
  )
}

function ReceivedTab({ onSettings }: { onSettings: () => void }) {
  const params = useParams()
  const nav = useNavigate()
  const isMobile = useIsMobile()
  const q = useInboundEmails()
  const list = q.data ?? []
  const routeId = params.id ? Number(params.id) : null
  const selId = routeId ?? (isMobile ? null : list[0]?.id ?? null)
  const selected = list.find((e) => e.id === selId)
  const detail = useInboundEmail(selected ? selected.id : null)
  const select = (id: number) => nav(`/emaily/${id}`, { replace: !isMobile })
  const afterDelete = () => nav('/emaily', { replace: true })

  if (q.isLoading) return <Spinner center />
  if (list.length === 0) {
    return (
      <Empty title="Zatím nepřišel žádný e-mail" icon={<Mail size={28} />} action={<Button variant="primary" size="sm" onClick={onSettings}>Jak nastavit příjem</Button>}>
        V bankovnictví zapněte e-mail o každém pohybu na adresu Pampelišky. Přijaté e-maily se objeví tady.
      </Empty>
    )
  }
  if (isMobile) {
    return selected
      ? <Detail row={selected} detail={detail.data} loading={detail.isLoading} onDeleted={afterDelete} onBack={() => nav('/emaily')} />
      : <EmailList list={list} selId={null} onSelect={select} />
  }
  return (
    <div className={s.layout}>
      <EmailList list={list} selId={selId} onSelect={select} />
      {selected
        ? <Detail key={selected.id} row={selected} detail={detail.data} loading={detail.isLoading} onDeleted={afterDelete} />
        : <span className="faint" style={{ fontSize: 13 }}>E-mail {routeId} neexistuje.</span>}
    </div>
  )
}

function RegenerateAddress() {
  const qc = useQueryClient()
  const { me } = useUi()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const owner = me.role === 'Owner'
  const run = async () => {
    setBusy(true)
    try {
      await api.post('/api/inbound-emails/address/regenerate')
      notifyOk('Nová adresa je připravená')
      setOpen(false)
      await invalidateInboundEmails(qc)
    } catch (e) {
      notifyError(e)
    } finally {
      setBusy(false)
    }
  }
  return (
    <>
      <Button variant="ghost" size="sm" icon={<RefreshCw size={14} />} disabled={!owner} onClick={() => setOpen(true)}
        title={owner ? undefined : 'Může jen vlastník domácnosti'}>Vytvořit novou adresu…</Button>
      <Dialog open={open} onOpenChange={setOpen} title="Vytvořit novou adresu?"
        footer={(
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>Zpět</Button>
            <Button variant="danger" icon={<RefreshCw size={15} />} loading={busy} onClick={run}>Vytvořit novou adresu</Button>
          </>
        )}>
        <span className="muted">Stará adresa přestane přijímat. Novou bude potřeba zadat ve všech bankách a ve filtru Gmailu.</span>
      </Dialog>
    </>
  )
}

function SettingsTab() {
  const q = useInboundAddress()
  const a = q.data
  if (q.isLoading || !a) return <Spinner center />
  const steps: [string, string][] = [
    ['Zapněte upozornění v bankovnictví', 'U každé banky e-mail o každém pohybu (příchozí i odchozí platby, platby kartou). Jako adresu zadejte tu nahoře.'],
    ['Banka umí jen jednu adresu?', 'Nechte upozornění chodit sobě a v Gmailu nastavte filtr, který je přepošle sem.'],
    ['Potvrďte přeposílání', 'Gmail sem pošle e-mail s ověřovacím kódem. Najdete ho mezi přijatými e-maily.'],
  ]
  return (
    <div className={s.settings}>
      <div className="col" style={{ gap: 'var(--gap)', minWidth: 0 }}>
        <Card>
          <div className={s.cardHead}><Mail size={18} /><h2>Adresa pro notifikace z bank</h2></div>
          <p className={s.note}>Tuto adresu zadejte v internetovém bankovnictví u e-mailových upozornění na pohyby. Přijímá i měsíční výpisy.</p>
          <div className={s.addressBox}>
            <span className={clsx(s.mono, s.address)}>{a.address}</span>
            <CopyButton text={a.address} variant="dark" />
          </div>
          <div className={s.status}>
            <span className={s.dot} style={{ background: a.receivingEnabled ? 'var(--pos)' : 'var(--warn)' }} />
            <b>{a.receivingEnabled ? 'Příjem běží' : 'Příjem na serveru není zapnutý'}</b>
            <span className="muted">
              · {a.lastReceivedAt ? `poslední e-mail ${whenLabel(a.lastReceivedAt)}` : 'zatím žádný e-mail'} · {count(a.last30Days, 'e-mail', 'e-maily', 'e-mailů')} za 30 dní
            </span>
          </div>
          <div><RegenerateAddress /></div>
        </Card>
        <Card>
          <div className={s.cardHead}><ShieldCheck size={18} /><h2>Co se s e-mailem stane</h2></div>
          <p className={s.note}>
            Pampeliška přijímá jen poštu na tuto adresu, nic dál nepřeposílá. Text e-mailu od povoleného odesílatele přečte AI a vytáhne
            z něj pohyb. Ten se zapíše jako <b>předběžný</b> a nepotvrzený – zařadíte ho jako ostatní v Ke kategorizaci a potvrdí ho až výpis.
            Původní e-mail se po {a.retentionDays} dnech smaže, zůstane jen jeho text.
          </p>
          {!a.extractionAvailable && <Callout tone="warn">Vytahování pohybů není na serveru zapnuté (chybí klíč Claude API). E-maily se zatím jen ukládají.</Callout>}
        </Card>
        <SendersCard />
      </div>
      <div className="col" style={{ gap: 'var(--gap)', minWidth: 0 }}>
      <AccountsCard />
      <PasswordsCard />
      <Card>
        <div className={s.cardHead}><Check size={18} /><h2>Jak to zapnout</h2></div>
        <ol className={s.steps}>
          {steps.map(([t, d], i) => (
            <li key={t}>
              <span className={s.stepNum}>{i + 1}</span>
              <div className="col" style={{ gap: 3 }}><b>{t}</b><span className={s.note}>{d}</span></div>
            </li>
          ))}
        </ol>
        <div className={clsx(s.mono, s.snippet)}>
          Gmail → Nastavení → Filtry<br />Od: @fio.cz OR @csas.cz OR @rb.cz<br />Přeposlat na: {a.address}
        </div>
      </Card>
      </div>
    </div>
  )
}

export default function InboundEmailsPage() {
  const nav = useNavigate()
  const params = useParams()
  const isMobile = useIsMobile()
  const tab: Tab = params.id === 'nastaveni' ? 'nastaveni' : 'prijate'
  const address = useInboundAddress().data
  const emails = useInboundEmails().data
  const setTab = (t: Tab) => nav(t === 'nastaveni' ? '/emaily/nastaveni' : '/emaily')
  const detailOpen = isMobile && tab === 'prijate' && params.id != null

  return (
    <>
      {!detailOpen && (
        <PageHeader title="Přijaté e-maily"
          subtitle={emails ? `Notifikace a výpisy z bank · ${count(emails.length, 'e-mail', 'e-maily', 'e-mailů')}` : 'Notifikace a výpisy z bank'}
          actions={(
            <>
              {!isMobile && address && tab === 'prijate' && (
                <span className={s.chip}><Mail size={15} /><span className={s.mono}>{address.address}</span><CopyButton text={address.address} size="sm" /></span>
              )}
              <UploadButton onUploaded={(id) => nav(`/emaily/${id}`)} />
            </>
          )}
          tools={(
            <Segmented<Tab> size="sm" value={tab} onChange={setTab} aria-label="Obrazovka"
              options={[{ value: 'prijate', label: 'Přijaté e-maily' }, { value: 'nastaveni', label: 'Nastavení příjmu' }]} />
          )} />
      )}
      {tab === 'prijate' ? <ReceivedTab onSettings={() => setTab('nastaveni')} /> : <SettingsTab />}
    </>
  )
}
