import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import clsx from 'clsx'
import { Bell, ChevronDown, ChevronUp, Coins, Database, Download, History, Monitor, Plug, Sparkles, type LucideIcon } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { PageHeader } from '../components/AppShell'
import { DeleteHouseholdDialog } from '../components/household/DeleteHouseholdDialog'
import { McpConnections, type McpConnection } from '../components/McpConnections'
import { McpSetupGuide } from '../components/McpSetupGuide'
import { Button, Pill, Popover, Segmented, Select, Slider, Switch, TextInput, type SegmentOption } from '../components/ui'
import { api, notifyError } from '../lib/api'
import { count, dateLong, num, relative } from '../lib/format'
import { fileSize, type BackupRun, type SettingsInput } from '../lib/household'
import type { Household, HouseholdSettings } from '../lib/types'
import { currentPeriod, periodLabel, shiftPeriod, useUi, type Period } from '../state/ui'
import s from './SettingsPage.module.css'

type SectionId = 'zobrazeni' | 'meny' | 'import' | 'ai' | 'upozorneni' | 'data'
const SECTIONS: { id: SectionId; title: string; icon: LucideIcon }[] = [
  { id: 'zobrazeni', title: 'Zobrazení', icon: Monitor },
  { id: 'meny', title: 'Měny a kurzy', icon: Coins },
  { id: 'import', title: 'Import a MCP', icon: Plug },
  { id: 'ai', title: 'AI kategorizace', icon: Sparkles },
  { id: 'upozorneni', title: 'Upozornění', icon: Bell },
  { id: 'data', title: 'Data', icon: Database },
]
const CUR_SYMBOL: Record<string, string> = { EUR: '€', USD: '$' }

function useSaveSettings() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (patch: SettingsInput) => api.put('/api/household/settings', patch),
    onMutate: async (patch) => {
      await qc.cancelQueries({ queryKey: ['household'] })
      const prev = qc.getQueryData<Household>(['household'])
      if (prev) {
        const { name, ...settings } = patch
        qc.setQueryData<Household>(['household'], { ...prev, name: name ?? prev.name, settings: { ...prev.settings, ...settings } })
      }
      return { prev }
    },
    onError: (e, _patch, ctx) => {
      if (ctx?.prev) qc.setQueryData(['household'], ctx.prev)
      notifyError(e)
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['household'] }),
  })
}

export default function SettingsPage() {
  const { household, me, mode, toggleMode } = useUi()
  const st = household.settings
  const save = useSaveSettings()
  const set = <K extends keyof HouseholdSettings>(k: K, v: HouseholdSettings[K]) => {
    if (st[k] !== v) save.mutate({ [k]: v } as SettingsInput)
  }

  // Režim z nastavení má přednost před ručním přepnutím v hlavičce (UiProvider si ho pamatuje zvlášť)
  const themeChanged = useRef(false)
  useEffect(() => {
    if (!themeChanged.current) return
    themeChanged.current = false
    const t = household.settings.theme
    const base = t === 'Dark' ? 'dark' : t === 'System' ? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : 'light'
    if (mode !== base) toggleMode()
  }, [household.settings.theme, mode, toggleMode])

  const [active, setActive] = useState<SectionId>('zobrazeni')
  const [flash, setFlash] = useState<SectionId | null>(null)
  const refs = useRef<Partial<Record<SectionId, HTMLElement | null>>>({})
  useEffect(() => {
    const onScroll = () => {
      let cur: SectionId = 'zobrazeni'
      for (const sec of SECTIONS) {
        const el = refs.current[sec.id]
        if (el && el.getBoundingClientRect().top < 140) cur = sec.id
      }
      if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4) cur = SECTIONS[SECTIONS.length - 1].id
      setActive(cur)
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])
  useEffect(() => {
    if (!flash) return
    const t = setTimeout(() => setFlash(null), 1600)
    return () => clearTimeout(t)
  }, [flash])
  const goTo = (id: SectionId) => {
    refs.current[id]?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    setActive(id)
    setFlash(id)
  }
  const section = (id: SectionId, children: ReactNode) => {
    const def = SECTIONS.find((x) => x.id === id)!
    return (
      <section id={id} ref={(el) => { refs.current[id] = el }} className={clsx(s.section, flash === id && s.sectionFlash)}>
        <div className={s.sectionHead}><def.icon size={18} /><span>{def.title}</span></div>
        <div className={s.sectionBody}>{children}</div>
      </section>
    )
  }

  return (
    <>
      <PageHeader title="Nastavení" subtitle={`${household.name} · nastavení platí pro všechny členy`} />
      <div className={s.layout}>
        <nav className={s.nav} aria-label="Sekce nastavení">
          {SECTIONS.map((sec) => (
            <button key={sec.id} type="button" className={clsx(s.navItem, active === sec.id && s.navItemOn)} onClick={() => goTo(sec.id)}
              aria-current={active === sec.id || undefined}>
              <sec.icon size={16} />{sec.title}
            </button>
          ))}
        </nav>

        <div className={s.sections}>
          {section('zobrazeni', <>
            <HouseholdName />
            <Row label="Režim" wide>
              <Seg value={st.theme} onChange={(v) => { if (v !== st.theme) themeChanged.current = true; set('theme', v) }}
                options={[{ value: 'Light', label: 'Světlý' }, { value: 'Dark', label: 'Tmavý' }, { value: 'System', label: 'Podle systému' }]} />
            </Row>
            <Row label="Výchozí období" note="Přehled, Kategorie, Rozpočty" wide>
              <Seg value={st.defaultPeriod} onChange={(v) => set('defaultPeriod', v)}
                options={[{ value: 'Month', label: 'Měsíc' }, { value: 'Quarter', label: 'Čtvrtletí' }, { value: 'Year', label: 'Rok' }]} />
            </Row>
            <Row label="Jen potvrzené platby ve výchozím stavu" note="Nepotvrzené se jinak zobrazují odlišeně">
              <Switch checked={st.confirmedOnlyDefault} onChange={(v) => set('confirmedOnlyDefault', v)} label="Jen potvrzené platby ve výchozím stavu" />
            </Row>
            <Row label="Skrýt částky po spuštění" note="Pro sdílení obrazovky">
              <Switch checked={st.hideAmountsOnStart} onChange={(v) => set('hideAmountsOnStart', v)} label="Skrýt částky po spuštění" />
            </Row>
            <Row label="Hlavní graf kategorií" wide>
              <Seg value={st.mainChart} onChange={(v) => set('mainChart', v)} options={[{ value: 'Sunburst', label: 'Sunburst' }, { value: 'Treemap', label: 'Treemap' }]} />
            </Row>
          </>)}

          {section('meny', <>
            <Row label="Hlavní měna" note="Rozpočty, souhrny a grafy"><span className={s.text}>{household.baseCurrency} · Kč</span></Row>
            <Row label="Kurz pro přepočet" note="Zdroj ČNB" wide>
              <Seg value={st.fxMode} onChange={(v) => set('fxMode', v)} options={[{ value: 'DayOfPayment', label: 'Ke dni platby' }, { value: 'MonthlyAverage', label: 'Měsíční průměr' }]} />
            </Row>
            <Row label="Čisté jmění zobrazit také v" wide>
              <Seg value={st.netWorthAltCurrency} onChange={(v) => set('netWorthAltCurrency', v)} options={['CZK', 'EUR', 'USD'].map((c) => ({ value: c, label: c }))} />
            </Row>
            <Row label="Poslední kurz ČNB" note={household.ratesDate ? dateLong(household.ratesDate) : 'Kurzy se zatím nestáhly'}>
              <span className={s.text} style={{ color: 'var(--ink-2)' }}>
                {Object.entries(household.rates).filter(([c]) => c !== 'CZK').map(([c, r]) => `${num(r, 2)} Kč/${CUR_SYMBOL[c] ?? c}`).join(' · ') || '—'}
              </span>
            </Row>
          </>)}

          {section('import', <ImportSection dedup={st.dedupWindowDays} onDedup={(v) => set('dedupWindowDays', v)} />)}

          {section('ai', <>
            <AiThreshold value={st.aiAutoConfirmThreshold} onSave={(v) => set('aiAutoConfirmThreshold', v)} />
            <Row label="Navrhovat nová pravidla" note="Po 3 stejných ručních zařazeních">
              <Switch checked={st.suggestRules} onChange={(v) => set('suggestRules', v)} label="Navrhovat nová pravidla" />
            </Row>
          </>)}

          {section('upozorneni', <>
            <Row label="Nízký zůstatek ve výhledu" note="Limit se nastavuje u každého účtu">
              <Switch checked={st.notifyLowBalance} onChange={(v) => set('notifyLowBalance', v)} label="Nízký zůstatek ve výhledu" />
            </Row>
            <Row label="Nesplněné podmínky účtu" note="Týden před koncem měsíce, ve kterém banka podmínku vyhodnocuje">
              <Switch checked={st.notifyConditions} onChange={(v) => set('notifyConditions', v)} label="Nesplněné podmínky účtu" />
            </Row>
            <Row label="Kam upozornění chodí" note="Na Přehledu a jako odznak v navigaci"><span className={s.text}>Jen v aplikaci</span></Row>
          </>)}

          {section('data', <DataSection isOwner={me.role === 'Owner'} />)}
        </div>
      </div>
    </>
  )
}

function Row({ label, note, children, wide }: { label: ReactNode; note?: ReactNode; children: ReactNode; wide?: boolean }) {
  return (
    <div className={clsx(s.row, wide && s.rowWide)}>
      <div className={s.rowText}>
        <span className={s.rowLabel}>{label}</span>
        {note && <span className={s.rowNote}>{note}</span>}
      </div>
      <div className={s.rowControl}>{children}</div>
    </div>
  )
}

function Seg<T extends string | number>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: SegmentOption<T>[] }) {
  return <Segmented<T> size="sm" value={value} onChange={onChange} options={options} className={s.seg} />
}

function HouseholdName() {
  const { household } = useUi()
  const save = useSaveSettings()
  const [name, setName] = useState(household.name)
  const [seen, setSeen] = useState(household.name)
  if (seen !== household.name) {
    setSeen(household.name)
    setName(household.name)
  }
  const commit = () => {
    const v = name.trim()
    if (!v) return setName(household.name)
    if (v !== household.name) save.mutate({ name: v })
  }
  return (
    <Row label="Název domácnosti" note="Zobrazuje se v navigaci a při mazání dat">
      <TextInput value={name} onChange={(e) => setName(e.target.value)} onBlur={commit} onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
        className={s.nameInput} aria-label="Název domácnosti" />
    </Row>
  )
}

function AiThreshold({ value, onSave }: { value: number; onSave: (v: number) => void }) {
  // Rozpracovaná hodnota posuvníku, uloží se po chvíli bez pohybu
  const [draft, setDraft] = useState<number | null>(null)
  const v = draft ?? value
  useEffect(() => {
    if (draft == null) return
    const t = setTimeout(() => {
      if (draft !== value) onSave(draft)
      setDraft(null)
    }, 450)
    return () => clearTimeout(t)
  }, [draft, value, onSave])
  return (
    <Row label="Automaticky potvrdit, když si je AI jistá alespoň" note="Platby pod prahem čekají v Ke kategorizaci" wide>
      <div className={s.range}>
        <Slider value={v} min={50} max={100} step={1} onChange={setDraft} label="Práh jistoty AI" />
        <span className={s.rangeValue}>{v} %</span>
      </div>
    </Row>
  )
}

function ImportSection({ dedup, onDedup }: { dedup: number; onDedup: (v: number) => void }) {
  const connections = useQuery({ queryKey: ['mcp-connections'], queryFn: () => api.get<McpConnection[]>('/api/mcp/connections') })
  const n = connections.data?.length ?? 0
  const [guide, setGuide] = useState<boolean | null>(null)
  const showGuide = guide ?? (connections.isSuccess && n === 0)
  return (
    <>
      <Row label="Připojení Clauda (MCP)" note="Adresa serveru a návod pro Claude Desktop, claude.ai a Claude Code">
        <Button size="sm" variant="secondary" iconRight={showGuide ? <ChevronUp size={14} /> : <ChevronDown size={14} />} onClick={() => setGuide(!showGuide)}>
          {showGuide ? 'Skrýt návod' : 'Zobrazit návod'}
        </Button>
      </Row>
      {showGuide && <div className={s.block}><McpSetupGuide /></div>}
      <Row label="Připojení klienti" note={`${count(n, 'klient', 'klienti', 'klientů')} s platným přístupem · každé připojení patří jednomu členovi`}>
        <span />
      </Row>
      <div className={clsx(s.block, s.listBlock)}><McpConnections /></div>
      <Row label="Deduplikace" note="Okno pro hledání stejné platby při importu" wide>
        <Seg value={dedup} onChange={onDedup} options={[{ value: 1, label: '±1 den' }, { value: 3, label: '±3 dny' }, { value: 7, label: '±7 dní' }]} />
      </Row>
      <Row label="Automaticky z banky (Enable Banking)" note="Pravidelné stahování pohybů přímo z banky, bez výpisů">
        <Pill tone="neutral">připravujeme</Pill>
      </Row>
    </>
  )
}

function DataSection({ isOwner }: { isOwner: boolean }) {
  const { household, period } = useUi()
  const [deleting, setDeleting] = useState(false)
  const options = useMemo(() => {
    const list: Period[] = []
    let m = currentPeriod('Month', household.today)
    for (let i = 0; i < 12; i++, m = shiftPeriod(m, -1)) list.push(m)
    let q = currentPeriod('Quarter', household.today)
    for (let i = 0; i < 4; i++, q = shiftPeriod(q, -1)) list.push(q)
    const y = currentPeriod('Year', household.today)
    list.push(y, shiftPeriod(y, -1))
    if (period.kind === 'Custom' || !list.some((p) => p.value === period.value)) list.unshift(period)
    return list.map((p) => ({ value: p.value, label: periodLabel(p), group: p.kind === 'Month' ? 'Měsíce' : p.kind === 'Quarter' ? 'Čtvrtletí' : p.kind === 'Year' ? 'Roky' : 'Vybrané období' }))
  }, [household.today, period])
  const [exportPeriod, setExportPeriod] = useState(period.value)
  const doExport = () => {
    const a = document.createElement('a')
    a.href = `/api/export/transactions.csv?period=${encodeURIComponent(exportPeriod)}`
    a.download = ''
    document.body.appendChild(a)
    a.click()
    a.remove()
  }
  const b = household.lastBackup
  return (
    <>
      <Row label="Export pohybů" note="CSV za zvolené období, otevře se i v Excelu">
        <div className="row" style={{ gap: 8 }}>
          <div className={s.exportSelect}><Select size="sm" value={exportPeriod} onChange={setExportPeriod} options={options} aria-label="Období exportu" /></div>
          <Button size="sm" variant="secondary" icon={<Download size={14} />} onClick={doExport}>Exportovat</Button>
        </div>
      </Row>
      <Row label="Poslední záloha" note="Automatická záloha celé databáze">
        <div className="row" style={{ gap: 8 }}>
          <span className={s.text} style={{ color: !b ? 'var(--ink-3)' : b.success ? 'var(--pos)' : 'var(--neg)' }}>
            {!b ? 'Zatím žádná' : `${b.success ? '' : 'Selhala · '}${relative(b.startedAt)}${b.sizeBytes ? ` · ${fileSize(b.sizeBytes)}` : ''}`}
          </span>
          <BackupHistory />
        </div>
      </Row>
      <Row label="Smazat domácnost" note={isOwner ? 'Nevratně smaže všechna data' : 'Může jen vlastník domácnosti'}>
        <button type="button" className={s.dangerBtn} disabled={!isOwner} onClick={() => setDeleting(true)}>Smazat…</button>
      </Row>
      <DeleteHouseholdDialog open={deleting} onOpenChange={setDeleting} />
    </>
  )
}

function BackupHistory() {
  const [open, setOpen] = useState(false)
  const q = useQuery({ queryKey: ['backups'], queryFn: () => api.get<BackupRun[]>('/api/backups'), enabled: open })
  return (
    <Popover open={open} onOpenChange={setOpen} align="end" width={320}
      trigger={<Button size="sm" variant="ghost" icon={<History size={14} />}>Historie</Button>}>
      <div className="col" style={{ gap: 0 }}>
        <span style={{ fontSize: 13, fontWeight: 800, paddingBottom: 8 }}>Poslední zálohy</span>
        {q.isLoading && <span className="faint" style={{ fontSize: 13 }}>Načítám…</span>}
        {q.data?.length === 0 && <span className="faint" style={{ fontSize: 13 }}>Zatím žádná záloha neproběhla.</span>}
        {q.data?.slice(0, 10).map((r) => (
          <div key={r.id} className={s.backupRow} title={r.message}>
            <span className={s.backupDot} style={{ background: r.success ? 'var(--pos)' : 'var(--neg)' }} />
            <span className="grow">{relative(r.startedAt)}</span>
            <span className="faint">{r.success ? fileSize(r.sizeBytes) : 'selhala'}</span>
          </div>
        ))}
      </div>
    </Popover>
  )
}
