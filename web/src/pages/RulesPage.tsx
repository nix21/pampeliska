import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import clsx from 'clsx'
import { AlertTriangle, ArrowRight, Check, ChevronDown, ChevronLeft, ChevronUp, Inbox, Plug, Plus, Search, Sparkles, User, X } from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import { useLocation, useSearchParams } from 'react-router-dom'
import { PageHeader } from '../components/AppShell'
import { matchesText, useIsMobile } from '../components/categories/hooks'
import { invalidateData } from '../components/categories/model'
import { commonStyles } from '../components/common'
import { NotesTab, RulesTabs } from '../components/rules/NotesTab'
import { RuleEditor } from '../components/rules/RuleEditor'
import { Button, Card, Empty, IconButton, Spinner, Switch, tokenColor } from '../components/ui'
import { useAccounts } from '../lib/accounts'
import { api, notifyError, notifyOk } from '../lib/api'
import { needColor, needLabel, useCategories } from '../lib/categories'
import { addDays, count, dateShort, money, num } from '../lib/format'
import { fieldLabel, opLabel, ruleSuggestionsQuery, rulesQuery, sourceLabel, type RuleDto, type RuleSource, type RuleSuggestion } from '../lib/rules'
import { useUi } from '../state/ui'
import s from './RulesPage.module.css'

type Filter = 'all' | 'on' | 'off' | 'conf'
const FILTERS: [Filter, string][] = [['all', 'Vše'], ['on', 'Aktivní'], ['off', 'Vypnuté'], ['conf', 'Konflikty']]
const SOURCE_ICON: Record<RuleSource, ReactNode> = {
  Manual: <User size={11} />,
  Inbox: <Inbox size={11} />,
  Ai: <Sparkles size={11} />,
  Mcp: <Plug size={11} />,
}

export default function RulesPage() {
  const [params] = useSearchParams()
  return params.get('tab') === 'notes' ? <NotesTab /> : <RulesList />
}

function RulesList() {
  const qc = useQueryClient()
  const mobile = useIsMobile()
  const location = useLocation()
  const [params, setParams] = useSearchParams()
  const rulesQ = useQuery(rulesQuery)
  const suggestions = useQuery(ruleSuggestionsQuery).data ?? []
  const cats = useCategories()
  const [filter, setFilter] = useState<Filter>('all')
  const [q, setQ] = useState('')
  const rules = useMemo(() => rulesQ.data ?? [], [rulesQ.data])

  const counts: Record<Filter, number> = {
    all: rules.length,
    on: rules.filter((r) => r.enabled).length,
    off: rules.filter((r) => !r.enabled).length,
    conf: rules.filter((r) => r.conflicts.length > 0).length,
  }
  const visible = rules.filter((r) =>
    (filter === 'all' || (filter === 'on' && r.enabled) || (filter === 'off' && !r.enabled) || (filter === 'conf' && r.conflicts.length > 0))
    && (!q.trim() || matchesText(`${r.description} ${cats.byId.get(r.categoryId)?.path ?? ''}`, q)))

  // Výběr v URL (?sel=id | new)
  const selParam = params.get('sel')
  const isNew = selParam === 'new'
  const selected = selParam && !isNew ? rules.find((r) => r.id === Number(selParam)) : undefined
  const current = selected ?? (isNew || mobile ? undefined : visible[0])
  const showEditor = isNew || !!current
  const select = (id: number | 'new' | null) => {
    const next = new URLSearchParams(params)
    if (id == null) next.delete('sel')
    else next.set('sel', String(id))
    setParams(next, { replace: !mobile, state: mobile && id != null ? { fromList: true } : undefined })
    if (mobile) window.scrollTo(0, 0)
  }
  const back = () => ((location.state as { fromList?: boolean } | null)?.fromList ? window.history.back() : select(null))

  const move = useMutation({
    mutationFn: ({ id, position }: { id: number; position: number }) => api.post(`/api/rules/${id}/move`, { position }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['rules'] }),
    onError: notifyError,
  })
  const toggle = useMutation({
    mutationFn: ({ id, enabled }: { id: number; enabled: boolean }) => api.put(`/api/rules/${id}`, { enabled }),
    onMutate: ({ id, enabled }) => qc.setQueryData<RuleDto[]>(rulesQuery.queryKey, (x) => x?.map((r) => (r.id === id ? { ...r, enabled } : r))),
    onSettled: () => qc.invalidateQueries({ queryKey: ['rules'] }),
    onError: notifyError,
  })
  const accept = useMutation({
    mutationFn: (g: RuleSuggestion) => api.post<{ id: number }>('/api/rules/suggestions/accept', { pattern: g.pattern, categoryId: g.categoryId }),
    onSuccess: async (r, g) => {
      notifyOk(`Pravidlo pro „${g.pattern}“ přidáno`)
      await invalidateData(qc)
      select(r.id)
    },
    onError: notifyError,
  })
  const dismiss = useMutation({
    mutationFn: (g: RuleSuggestion) => api.post('/api/rules/suggestions/dismiss', { pattern: g.pattern, categoryId: g.categoryId }),
    onMutate: (g) => qc.setQueryData<RuleSuggestion[]>(ruleSuggestionsQuery.queryKey, (x) => x?.filter((y) => !(y.pattern === g.pattern && y.categoryId === g.categoryId))),
    onSettled: () => qc.invalidateQueries({ queryKey: ruleSuggestionsQuery.queryKey }),
    onError: notifyError,
  })

  if (rulesQ.isLoading) return <Spinner center />

  const editor = showEditor && (
    <RuleEditor key={current?.id ?? 'new'} rule={isNew ? undefined : current} mobile={mobile}
      onSaved={(id) => select(id)} onDeleted={() => select(null)} />
  )

  // ---------- Mobil: editor jako samostatná stránka ----------
  if (mobile && showEditor) {
    return (
      <div className={s.mobileDetail}>
        <button type="button" className={s.back} onClick={back}><ChevronLeft size={20} /> Pravidla</button>
        {editor}
      </div>
    )
  }

  const rowProps = (r: RuleDto) => ({
    rule: r,
    selected: current?.id === r.id,
    last: r.position === rules.length,
    onSelect: () => select(r.id),
    onMove: (d: number) => move.mutate({ id: r.id, position: r.position + d }),
    onToggle: (v: boolean) => toggle.mutate({ id: r.id, enabled: v }),
  })

  return (
    <>
      <PageHeader
        title="Pravidla"
        subtitle={`${count(counts.on, 'aktivní pravidlo', 'aktivní pravidla', 'aktivních pravidel')} · vyhodnocují se shora dolů při každém importu`}
        actions={<Button variant="primary" icon={<Plus size={16} />} onClick={() => select('new')}>Nové pravidlo</Button>}
        tools={
          <>
            <RulesTabs />
            <div className={s.filters}>
              {FILTERS.map(([v, l]) => (
                <button key={v} type="button" aria-pressed={filter === v} className={clsx(commonStyles.chip, s.filter, filter === v && commonStyles.chipOn)}
                  onClick={() => setFilter(v)}>
                  {l} <span style={{ opacity: 0.6 }}>{counts[v]}</span>
                </button>
              ))}
            </div>
            <label className={s.search}>
              <Search size={16} />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Hledat v pravidlech" aria-label="Hledat v pravidlech" />
              {q && <button type="button" onClick={() => setQ('')} aria-label="Vymazat"><X size={14} /></button>}
            </label>
          </>
        }
      />

      {suggestions.length > 0 && (
        <section className={s.sugg}>
          <span className={s.suggTitle}>
            <Sparkles size={16} />
            {mobile ? `Pampeliška navrhuje ${count(suggestions.length, 'pravidlo', 'pravidla', 'pravidel')}` : (
              <>Pampeliška navrhuje nová pravidla <span className={s.suggNote}>· podle toho, jak zařazuješ ručně</span></>
            )}
          </span>
          <div className={s.suggGrid}>
            {suggestions.map((g) => (
              <div key={`${g.pattern}|${g.categoryId}`} className={s.suggCard}>
                <span className={s.suggRule}>
                  {mobile ? g.pattern : `Obchodník obsahuje „${g.pattern}“`} <span className="faint">→</span> {cats.nameOf(g.categoryId)}
                </span>
                {!mobile && <span className={s.suggWhy}>{g.reason}</span>}
                <div className={s.suggActions}>
                  {mobile ? (
                    <>
                      <IconButton label="Přidat" className={s.suggOk} disabled={accept.isPending} onClick={() => accept.mutate(g)}><Check size={16} /></IconButton>
                      <IconButton label="Ne, díky" onClick={() => dismiss.mutate(g)}><X size={16} /></IconButton>
                    </>
                  ) : (
                    <>
                      <Button size="sm" variant="dark" icon={<Check size={14} />} loading={accept.isPending && accept.variables === g} onClick={() => accept.mutate(g)}>Přidat</Button>
                      <Button size="sm" onClick={() => dismiss.mutate(g)}>Ne, díky</Button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {mobile ? (
        <div className={s.mList}>
          {visible.length === 0 && <Card><EmptyRules any={rules.length > 0} /></Card>}
          {visible.map((r) => <MobileRuleCard key={r.id} {...rowProps(r)} />)}
        </div>
      ) : (
        <div className={clsx(s.layout, !showEditor && s.layoutFull)}>
          <Card pad={false} className={s.table}>
            <div className={clsx(s.grid, s.thead)}>
              <span>Pořadí</span><span>Když → Pak</span><span>Použito</span><span>Zdroj</span><span style={{ textAlign: 'right' }}>Aktivní</span>
            </div>
            {visible.length === 0 && <EmptyRules any={rules.length > 0} />}
            {visible.map((r) => <RuleRow key={r.id} {...rowProps(r)} />)}
            <div className={s.footNote}>
              Pravidla se vyhodnocují shora dolů, použije se první, které odpovídá. Ručně zařazené platby pravidla nepřepisují.
            </div>
          </Card>
          {showEditor && <Card className={s.aside}>{editor}</Card>}
        </div>
      )}
    </>
  )
}

function EmptyRules({ any }: { any: boolean }) {
  return any
    ? <Empty title="Nic nenalezeno">Zkus jiný filtr nebo hledaný text.</Empty>
    : <Empty title="Zatím žádná pravidla">Pravidlo vznikne, když ručně zařadíš platbu, nebo ho založ tlačítkem Nové pravidlo.</Empty>
}

interface RowProps {
  rule: RuleDto
  selected: boolean
  last: boolean
  onSelect: () => void
  onMove: (delta: number) => void
  onToggle: (enabled: boolean) => void
}

/** Podmínky a akce pravidla pro zobrazení v seznamu. */
function useRuleView(r: RuleDto) {
  const { colorOf, nameOf } = useCategories()
  const accounts = useAccounts()
  const { household } = useUi()
  const conds = r.conditions.map((c, i) => ({
    f: fieldLabel[c.field],
    op: opLabel[c.op],
    v: c.field === 'Amount' ? money(Number(c.value.replace(',', '.')) || 0) : c.field === 'Account' ? accounts.byId.get(Number(c.value))?.name ?? c.value : c.value,
    join: i ? (r.logic === 'Or' ? 'nebo' : 'a') : '',
  }))
  const member = r.memberId != null ? household.members.find((m) => m.id === r.memberId) : undefined
  const acts: { t: string; c: string }[] = [{ t: nameOf(r.categoryId), c: colorOf(r.categoryId) }]
  if (r.needOverride && r.needOverride !== 'Inherit') acts.push({ t: needLabel[r.needOverride], c: needColor[r.needOverride] })
  if (member) acts.push({ t: member.name, c: tokenColor(member.colorToken) })
  if (r.excludeFromStats) acts.push({ t: 'Nezapočítávat', c: 'var(--ink-3)' })
  if (r.markRecurring) acts.push({ t: 'Pravidelná', c: 'var(--ink-3)' })
  const under = r.conflicts.filter((c) => c.overrides).map((c) => c.position)
  const over = r.conflicts.filter((c) => !c.overrides).map((c) => c.position)
  const conflict = under.length ? `Přebito pravidlem ${under.join(', ')}` : over.length ? `Překrývá se s ${over.join(', ')}` : ''
  const lastUsed = !r.lastUsed ? '' : r.lastUsed === household.today ? 'dnes' : r.lastUsed === addDays(household.today, -1) ? 'včera' : dateShort(r.lastUsed)
  const last = !r.enabled ? (r.disabledAt ? `vypnuto ${dateShort(r.disabledAt.slice(0, 10))}` : 'vypnuto') : lastUsed ? `naposledy ${lastUsed}` : ''
  const uses = r.matches ? `${num(r.matches)}× za 6 měs.` : 'zatím nepoužito'
  return { conds, acts, conflict, last, uses }
}

function RuleRow({ rule: r, selected, last, onSelect, onMove, onToggle }: RowProps) {
  const v = useRuleView(r)
  const max = Math.max(1, ...r.monthly)
  return (
    <div role="button" tabIndex={0} aria-pressed={selected} className={clsx(s.grid, s.row, selected && s.rowOn, !r.enabled && s.rowOff)}
      onClick={onSelect} onKeyDown={(e) => e.key === 'Enter' && e.target === e.currentTarget && onSelect()}>
      <div className={s.prio} onClick={(e) => e.stopPropagation()}>
        <button type="button" className={s.arrow} aria-label="Posunout výš" disabled={r.position === 1} onClick={() => onMove(-1)}><ChevronUp size={14} /></button>
        <span className={s.prioNum}>{r.position}</span>
        <button type="button" className={s.arrow} aria-label="Posunout níž" disabled={last} onClick={() => onMove(1)}><ChevronDown size={14} /></button>
      </div>
      <div className={s.when}>
        <div className={s.conds}>
          {v.conds.map((c, i) => (
            <span key={i} className="row" style={{ gap: 6 }}>
              {c.join && <span className={s.join}>{c.join}</span>}
              <span className={s.cond}><span className="faint">{c.f} {c.op}</span> <b>{c.v}</b></span>
            </span>
          ))}
        </div>
        <div className={s.acts}>
          <ArrowRight size={14} color="var(--ink-3)" />
          {v.acts.map((a, i) => (
            <span key={i} className={s.act}><span className={s.actDot} style={{ background: a.c }} />{a.t}</span>
          ))}
          {v.conflict && <span className={s.conflict}><AlertTriangle size={11} /> {v.conflict}</span>}
        </div>
      </div>
      <div className={s.used}>
        <span style={{ fontSize: 13, fontWeight: 700 }}>{v.uses}</span>
        <span className={s.hist} aria-hidden>
          {r.monthly.map((h, i) => <span key={i} style={{ height: Math.max(2, Math.round((h / max) * 14)) }} />)}
        </span>
        {v.last && <span className={s.last}>{v.last}</span>}
      </div>
      <span className={s.source}>{SOURCE_ICON[r.source]} {sourceLabel[r.source]}</span>
      <div className={s.toggle} onClick={(e) => e.stopPropagation()}>
        <Switch checked={r.enabled} onChange={onToggle} label={r.enabled ? 'Vypnout pravidlo' : 'Zapnout pravidlo'} />
      </div>
    </div>
  )
}

function MobileRuleCard({ rule: r, onSelect, onToggle }: RowProps) {
  const v = useRuleView(r)
  return (
    <div role="button" tabIndex={0} className={clsx(s.mCard, !r.enabled && s.rowOff)} onClick={onSelect}
      onKeyDown={(e) => e.key === 'Enter' && e.target === e.currentTarget && onSelect()}>
      <div className={s.mTop}>
        <span className={s.mPrio}>{r.position}</span>
        <div className={s.mConds}>
          {v.conds.map((c, i) => <span key={i} className={s.cond}><span className="faint">{c.f}</span> <b>{c.v}</b></span>)}
        </div>
        <span onClick={(e) => e.stopPropagation()} style={{ display: 'flex' }}>
          <Switch checked={r.enabled} onChange={onToggle} label={r.enabled ? 'Vypnout pravidlo' : 'Zapnout pravidlo'} />
        </span>
      </div>
      <div className={s.mActs}>
        <ArrowRight size={14} color="var(--ink-3)" />
        {v.acts.map((a, i) => <span key={i} className={s.mAct}><span className={s.actDot} style={{ background: a.c }} />{a.t}</span>)}
        <span className={s.mUses}>{v.uses}</span>
      </div>
      {v.conflict && <span className={s.mConflict}>{v.conflict}</span>}
    </div>
  )
}
