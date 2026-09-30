import { useQueryClient } from '@tanstack/react-query'
import clsx from 'clsx'
import { Check, Copy, FileText, Landmark, Plug, Sparkles, Upload, type LucideIcon } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { PageHeader } from '../components/AppShell'
import { Money } from '../components/common'
import { ImportHelpButton } from '../components/ImportHelp'
import { Button, Empty, Spinner } from '../components/ui'
import { api, notifyError, notifyOk } from '../lib/api'
import { count, dateShort, num, plural } from '../lib/format'
import {
  batchSourceLabel, invalidateInbox, UNSURE_BELOW, useBatch, useBatches, useIsMobile, useMcpConnections, whenLabel, type BatchDetail, type BatchItem,
  type BatchSummary,
} from '../lib/inbox'
import type { BatchState } from '../lib/types'
import s from './BatchesPage.module.css'

const LEVEL: Record<BatchState, number> = { Uploaded: 1, Categorized: 2, Confirmed: 3 }
const STATE_LABEL: Record<BatchState, string> = {
  Uploaded: 'Nahráno · čeká na kategorizaci',
  Categorized: 'Kategorizováno · čeká na potvrzení',
  Confirmed: 'Potvrzeno',
}
const STATE_COLOR: Record<BatchState, string> = { Uploaded: 'var(--warn)', Categorized: 'var(--ink)', Confirmed: 'var(--pos)' }
const SRC_ICON: Record<BatchSummary['source'], LucideIcon> = { Mcp: Plug, Manual: FileText, EnableBanking: Landmark }

const ITEMS_PREVIEW = 8

function Steps({ state }: { state: BatchState }) {
  const lvl = LEVEL[state]
  return (
    <div className={s.steps} aria-hidden>
      {[1, 2, 3].map((i) => (
        <span key={i} style={i <= lvl ? { background: state === 'Confirmed' ? 'var(--pos)' : 'var(--accent)' } : undefined} />
      ))}
    </div>
  )
}

function SrcIcon({ b, size = 36 }: { b: BatchSummary; size?: number }) {
  const Icon = SRC_ICON[b.source]
  return (
    <span className={clsx(s.srcIcon, b.source === 'Mcp' && s.srcMcp)} style={{ width: size, height: size }}>
      <Icon size={18} />
    </span>
  )
}

/** Stav jedné platby v dávce. */
function itemStatus(t: BatchItem): [string, string] {
  if (t.status === 'Confirmed') return ['Potvrzeno', s.stOk]
  if (t.suspectedDuplicate) return ['Duplicita', s.stDup]
  if ((t.kind === 'Transfer' || t.kind === 'InvestmentTransfer') && !t.betweenMembers) return ['Převod', s.stWait]
  if (!t.category) return ['Nahráno', s.stNew]
  if (t.source === 'Ai' && (t.aiConfidence ?? 0) < UNSURE_BELOW) return ['AI nejistá', s.stUnsure]
  return ['Čeká', s.stWait]
}

function itemCategory(t: BatchItem) {
  if (!t.category) return t.betweenMembers ? 'Převod mezi členy' : t.kind === 'Transfer' || t.kind === 'InvestmentTransfer' ? 'Převod mezi účty' : '—'
  const src = t.source === 'Rule' ? ' · pravidlo' : t.source === 'Ai' ? ` · AI ${t.aiConfidence ?? 0} %` : t.source === 'Manual' ? ' · ručně' : ''
  return `${t.status === 'Confirmed' ? '' : 'Návrh: '}${t.category}${src}`
}

function useBatchActions() {
  const qc = useQueryClient()
  const [busy, setBusy] = useState<number | null>(null)
  const run = async (b: BatchSummary) => {
    setBusy(b.id)
    try {
      if (b.state === 'Uploaded') {
        const r = await api.post<{ categorized: number }>(`/api/batches/${b.id}/categorize`)
        notifyOk(r.categorized
          ? `Pravidla zařadila ${count(r.categorized, 'platbu', 'platby', 'plateb')}`
          : 'Žádné pravidlo nesedí – zbytek zařaď ručně nebo požádej Clauda')
      } else if (b.state === 'Categorized') {
        const r = await api.post<{ confirmed: number }>(`/api/batches/${b.id}/confirm`)
        notifyOk(`Potvrzeno ${count(r.confirmed, 'platba', 'platby', 'plateb')}`)
      }
      await invalidateInbox(qc)
    } catch (e) {
      notifyError(e)
    } finally {
      setBusy(null)
    }
  }
  return { run, busy }
}

function PrimaryAction({ b, busy, onRun }: { b: BatchSummary; busy: boolean; onRun: () => void }) {
  if (b.state === 'Confirmed') return <Button size="lg" icon={<Check size={16} />} disabled>Dávka potvrzena</Button>
  return (
    <Button variant="primary" size="lg" loading={busy} icon={b.state === 'Uploaded' ? <Sparkles size={16} /> : <Check size={16} />} onClick={onRun}>
      {b.state === 'Uploaded' ? 'Spustit kategorizaci' : 'Potvrdit celou dávku'}
    </Button>
  )
}

function Stats({ b, suspected }: { b: BatchSummary; suspected: number }) {
  const stats: [number, string, string][] = [
    [b.count, 'plateb', 'var(--ink)'],
    [b.confirmed, 'potvrzeno', 'var(--pos)'],
    [b.pending, 'čeká', b.pending ? 'var(--warn)' : 'var(--ink-3)'],
    [suspected, plural(suspected, 'duplicita', 'duplicity', 'duplicit'), suspected ? 'var(--neg)' : 'var(--ink-3)'],
  ]
  return (
    <div className={s.stats}>
      {stats.map(([v, l, c]) => (
        <div key={l} className={s.stat}>
          <span className={s.statValue} style={{ color: c }}>{num(v)}</span>
          <span className={s.statLabel}>{l}</span>
        </div>
      ))}
    </div>
  )
}

function DupCallouts({ detail }: { detail: BatchDetail }) {
  const nav = useNavigate()
  const dups = detail.items.filter((t) => t.suspectedDuplicate && t.status !== 'Confirmed')
  return (
    <>
      {dups.slice(0, 3).map((t) => (
        <div key={t.id} className={s.dup}>
          <Copy size={14} color="var(--neg)" style={{ flexShrink: 0 }} />
          <span style={{ flex: 1, minWidth: 0 }}>
            {t.counterparty} <Money value={t.amount} currency={t.currency} /> ({dateShort(t.date)}) možná už v evidenci je
          </span>
          <button type="button" className={s.dupLink} onClick={() => nav(`/trideni?filter=Duplicates&tx=${t.id}`)}>Vyřešit</button>
        </div>
      ))}
      {dups.length > 3 && <Link to="/trideni?filter=Duplicates" className="faint" style={{ fontSize: 12 }}>a další {dups.length - 3} podezřelé duplicity</Link>}
    </>
  )
}

function suspectedOf(b: BatchSummary, detail?: BatchDetail) {
  if (detail && detail.batch.id === b.id) return detail.items.filter((t) => t.suspectedDuplicate && t.status !== 'Confirmed').length
  return b.state === 'Confirmed' ? 0 : b.suspectedCount
}

/** Pravý panel (desktop): průběh, čísla, duplicity, platby, akce. */
function BatchPanel({ b, detail, loading, busy, onRun }: { b: BatchSummary; detail?: BatchDetail; loading: boolean; busy: boolean; onRun: () => void }) {
  const nav = useNavigate()
  const [all, setAll] = useState(false)
  const [showSkipped, setShowSkipped] = useState(false)
  const d = detail?.batch.id === b.id ? detail : undefined
  const items = d?.items ?? []
  const shown = all ? items : items.slice(0, ITEMS_PREVIEW)
  const pipe: [string, LucideIcon, string | undefined][] = [
    ['Nahráno', Upload, b.createdAt],
    ['Kategorizováno', Sparkles, b.categorizedAt],
    ['Potvrzeno', Check, b.confirmedAt],
  ]
  return (
    <aside className={s.panel}>
      <div className="col" style={{ gap: 4 }}>
        <span className="faint" style={{ fontSize: 12 }}>
          {batchSourceLabel(b)}{b.createdBy ? ` · ${b.createdBy}` : ''}{b.accounts.length ? ` · ${b.accounts.join(', ')}` : ''}
        </span>
        <span className={s.title}>Dávka {whenLabel(b.createdAt)}</span>
        {b.note && <span className="muted" style={{ fontSize: 13 }}>{b.note}</span>}
      </div>
      <div className={s.pipe}>
        {pipe.map(([label, Icon, at], i) => {
          const on = i + 1 <= LEVEL[b.state]
          return (
            <div key={label} className={clsx(s.pipeCell, on && s.pipeOn)}>
              <span className={s.pipeLabel} style={{ color: on ? 'var(--ink)' : 'var(--ink-3)' }}><Icon size={14} /> {label}</span>
              <span className="faint" style={{ fontSize: 11 }}>{on && at ? whenLabel(at) : '—'}</span>
            </div>
          )
        })}
      </div>
      <Stats b={b} suspected={suspectedOf(b, d)} />
      {d && <DupCallouts detail={d} />}
      {loading && !d ? <Spinner center /> : (
        <div className={s.items}>
          {shown.map((t) => {
            const [st, cls] = itemStatus(t)
            return (
              <div key={t.id} className={s.item}>
                <div className="col" style={{ gap: 2, minWidth: 0 }}>
                  <span className={s.itemName}>{t.counterparty || 'Bez protistrany'}</span>
                  <span className={s.itemCat}>{dateShort(t.date)} · {itemCategory(t)}</span>
                </div>
                <span className={clsx(s.st, cls)}>{st}</span>
                <Money value={t.amount} currency={t.currency} style={{ fontSize: 13, fontWeight: 600, textAlign: 'right' }} />
              </div>
            )
          })}
          {items.length > ITEMS_PREVIEW && (
            <button type="button" className={s.more} onClick={() => setAll(!all)}>
              {all ? 'Zobrazit méně' : `a ${plural(items.length - ITEMS_PREVIEW, 'další', 'další', 'dalších')} ${count(items.length - ITEMS_PREVIEW, 'platba', 'platby', 'plateb')} · zobrazit vše`}
            </button>
          )}
          {d && d.skipped.length > 0 && (
            <>
              <button type="button" className={s.more} onClick={() => setShowSkipped(!showSkipped)}>
                {count(d.skipped.length, 'platba přeskočena', 'platby přeskočeny', 'plateb přeskočeno')} – už v evidenci byly {showSkipped ? '▴' : '▾'}
              </button>
              {showSkipped && d.skipped.map((k, i) => (
                <div key={i} className={s.item}>
                  <span className={s.itemName} style={{ fontWeight: 500 }}>{k.counterparty}</span>
                  <span className={s.itemCat}>{dateShort(k.date)}</span>
                  <Money value={k.amount} style={{ fontSize: 13, textAlign: 'right', color: 'var(--ink-3)' }} />
                </div>
              ))}
            </>
          )}
        </div>
      )}
      {b.state === 'Uploaded' && (
        <span className="faint" style={{ fontSize: 12 }}>
          Pravidla zařadí známé obchodníky. Zbytek navrhne Claude přes MCP, nebo ho zařadíš ručně.
        </span>
      )}
      <div className={s.actions}>
        <PrimaryAction b={b} busy={busy} onRun={onRun} />
        {b.state !== 'Confirmed' && <Button size="lg" onClick={() => nav('/trideni')}>Zařadit ručně</Button>}
      </div>
    </aside>
  )
}

function McpStatus() {
  const q = useMcpConnections()
  const list = q.data ?? []
  const names = [...new Set(list.map((c) => c.clientName))]
  return (
    <div className={s.mcpCard}>
      <div className="row">
        <span className={s.dot} style={{ background: list.length ? 'var(--pos)' : 'var(--warn)' }} />
        <span style={{ fontSize: 14, fontWeight: 700 }}>{list.length ? 'MCP připojeno' : 'MCP zatím nepřipojeno'}</span>
      </div>
      <span className="muted" style={{ fontSize: 13 }}>
        {q.isLoading ? 'Načítám…' : list.length
          ? `${count(list.length, 'připojený klient', 'připojení klienti', 'připojených klientů')}${names.length ? ` · ${names.join(', ')}` : ''} · AI kategorizace přes Clauda`
          : <>Připoj Clauda v <Link to="/nastaveni">Nastavení</Link> a pohyby ti nahraje sám.</>}
      </span>
      <span className="faint" style={{ fontSize: 12 }}>Pravidelné stahování z banky (Enable Banking) připravujeme.</span>
    </div>
  )
}

export default function BatchesPage() {
  const params = useParams()
  const nav = useNavigate()
  const isMobile = useIsMobile()
  const q = useBatches()
  const list = q.data ?? []
  const routeId = params.id ? Number(params.id) : null
  const selId = routeId ?? (isMobile ? null : list[0]?.id ?? null)
  const selected = list.find((b) => b.id === selId)
  const detail = useBatch(selected ? selected.id : null)
  const { run, busy } = useBatchActions()
  const waiting = list.filter((b) => b.state !== 'Confirmed').length

  const select = (id: number) => nav(isMobile && id === selId ? '/davky' : `/davky/${id}`, { replace: true })

  const importButtons = (
    <>
      <ImportHelpButton icon={<Sparkles size={16} />} variant="secondary">{isMobile ? 'Stáhnout MCP' : 'Stáhnout teď přes MCP'}</ImportHelpButton>
      <ImportHelpButton variant="primary">Nahrát výpis</ImportHelpButton>
    </>
  )

  const empty = !q.isLoading && list.length === 0 && (
    <Empty title="Zatím žádné dávky" icon={<Upload size={28} />} action={<ImportHelpButton variant="primary" size="sm">Jak nahrát výpis</ImportHelpButton>}>
      Dávka vznikne, když Claude přes MCP nahraje pohyby z výpisu.
    </Empty>
  )

  if (isMobile) {
    return (
      <>
        <PageHeader title="Dávky" subtitle={waiting ? `${count(waiting, 'dávka čeká', 'dávky čekají', 'dávek čeká')}` : 'Vše potvrzeno'} />
        <div className={s.mButtons}>
          <ImportHelpButton variant="primary">Nahrát výpis</ImportHelpButton>
          <ImportHelpButton icon={<Sparkles size={16} />} variant="secondary">Stáhnout MCP</ImportHelpButton>
        </div>
        {q.isLoading && <Spinner center />}
        {empty}
        <div className={s.cards}>
          {list.map((b) => {
            const open = b.id === selId
            const d = open && detail.data?.batch.id === b.id ? detail.data : undefined
            return (
              <div key={b.id} className={clsx(s.card, open && s.cardOn)}>
                <div className={s.cardHead} role="button" tabIndex={0} aria-expanded={open} onClick={() => select(b.id)}
                  onKeyDown={(e) => e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), select(b.id))}>
                  <div className="row" style={{ gap: 12 }}>
                    <SrcIcon b={b} size={40} />
                    <div className="col grow" style={{ gap: 2 }}>
                      <span style={{ fontSize: 15, fontWeight: 700 }}>{whenLabel(b.createdAt)}</span>
                      <span className="faint ellipsis" style={{ fontSize: 12 }}>{batchSourceLabel(b)} · {count(b.count, 'platba', 'platby', 'plateb')}</span>
                    </div>
                    <span className={s.stateLabel} style={{ color: STATE_COLOR[b.state], textAlign: 'right' }}>
                      {b.state === 'Uploaded' ? 'Nahráno' : b.state === 'Categorized' ? 'Kategorizováno' : 'Potvrzeno'}
                    </span>
                  </div>
                  <Steps state={b.state} />
                </div>
                {open && (
                  <div className={s.cardBody}>
                    <Stats b={b} suspected={suspectedOf(b, d)} />
                    {d && <DupCallouts detail={d} />}
                    <div className={s.actions}>
                      <PrimaryAction b={b} busy={busy === b.id} onRun={() => run(b)} />
                    </div>
                    {b.state !== 'Confirmed' && <Button block onClick={() => nav('/trideni')}>Zařadit ručně</Button>}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </>
    )
  }

  return (
    <>
      <PageHeader title="Dávky" subtitle="Import přes MCP i ruční výpisy. Každá dávka projde: nahráno → kategorizováno → potvrzeno." actions={importButtons} />

      <div className={s.top}>
        <div className={s.importCard}>
          <span className={s.importIcon}><Upload size={20} /></span>
          <div className="col grow" style={{ gap: 3 }}>
            <span style={{ fontSize: 15, fontWeight: 700 }}>Výpis (PDF, CSV) předej Claudovi, ten pohyby nahraje přes MCP</span>
            <span className="muted" style={{ fontSize: 13 }}>
              Pohyby se nahrají do nové dávky jako nepotvrzené. Claude pozná duplicity a převody mezi účty a navrhne kategorie.
            </span>
          </div>
          <ImportHelpButton variant="secondary" size="sm" icon={null}>Jak na to</ImportHelpButton>
        </div>
        <McpStatus />
      </div>

      <div className={s.stages}>
        <span style={{ fontWeight: 700, color: 'var(--ink)' }}>Jak dávka funguje</span>
        {['Nahrání', 'Kategorizace (pravidla, AI, ručně)', 'Potvrzení celé dávky nebo vybraných plateb'].map((l, i, a) => (
          <span key={l} className={s.stage}>
            <span className={s.stageNum}>{i + 1}</span>{l}{i < a.length - 1 && <span className="faint"> → </span>}
          </span>
        ))}
      </div>

      {q.isLoading ? <Spinner center /> : empty || (
        <div className={s.layout} style={!selected ? { gridTemplateColumns: 'minmax(0, 1fr)' } : undefined}>
          <section className={s.list}>
            <div className={clsx(s.grid, s.thead)}>
              <span>Dávka</span><span className={s.right}>Plateb</span><span>Stav</span><span className={s.right}>Potvrzeno</span>
            </div>
            {list.map((b) => {
              const on = b.id === selId
              const susp = suspectedOf(b)
              return (
                <div key={b.id} className={clsx(s.grid, s.row, on && s.rowOn)} onClick={() => select(b.id)} aria-selected={on}>
                  <div className="row" style={{ gap: 12, minWidth: 0 }}>
                    <SrcIcon b={b} />
                    <div className="col" style={{ gap: 2, minWidth: 0 }}>
                      <span style={{ fontSize: 14, fontWeight: 700 }}>{whenLabel(b.createdAt)}</span>
                      <span className="faint ellipsis" style={{ fontSize: 12 }}>
                        {batchSourceLabel(b)}{b.accounts.length ? ` · ${b.accounts.join(', ')}` : ''}
                      </span>
                    </div>
                  </div>
                  <span className={clsx('num', s.right)} style={{ fontSize: 14, fontWeight: 600 }}>{num(b.count)}</span>
                  <div className="col" style={{ gap: 6 }}>
                    <Steps state={b.state} />
                    <span className={s.stateLabel} style={{ color: STATE_COLOR[b.state] }}>{STATE_LABEL[b.state]}</span>
                  </div>
                  <div className="col" style={{ gap: 2, alignItems: 'flex-end' }}>
                    <span className="num" style={{ fontSize: 14, fontWeight: 600 }}>{num(b.confirmed)} / {num(b.count)}</span>
                    {susp > 0 && <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--neg)' }}>{count(susp, 'duplicita', 'duplicity', 'duplicit')}</span>}
                    {b.duplicateCount > 0 && <span className="faint" style={{ fontSize: 12 }}>{num(b.duplicateCount)} přeskočeno</span>}
                  </div>
                </div>
              )
            })}
          </section>
          {selected && (
            <BatchPanel key={selected.id} b={selected} detail={detail.data} loading={detail.isLoading || detail.isFetching}
              busy={busy === selected.id} onRun={() => run(selected)} />
          )}
        </div>
      )}
      {routeId != null && !q.isLoading && !selected && list.length > 0 && (
        <span className="faint" style={{ fontSize: 13 }}>Dávka {routeId} neexistuje.</span>
      )}
    </>
  )
}
