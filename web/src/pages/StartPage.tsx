import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import clsx from 'clsx'
import { Check, ChevronLeft, ChevronRight, Clock, FileText, Plug, Plus, X } from 'lucide-react'
import { useState } from 'react'
import { InstitutionBadge } from '../components/common'
import { Wordmark } from '../components/Logo'
import { McpSetupGuide } from '../components/McpSetupGuide'
import { Avatar, Button, RadioCards, TextInput, tokenColor } from '../components/ui'
import { api, notifyError } from '../lib/api'
import type { AccountKind, CategoryTemplate, CategoryTemplateNode, Institution } from '../lib/types'
import { useUi } from '../state/ui'
import s from './StartPage.module.css'

interface DraftMember { name: string; email: string; color: string }
interface DraftAccount { name: string; institutionKey: string; currency: string; owner: number | null; kind: AccountKind }

const STEPS = [
  ['Domácnost', 'název a členové'],
  ['Účty', 'banky a měny'],
  ['Kategorie', 'výchozí strom'],
  ['Import', 'první pohyby'],
] as const

const TITLES = [
  ['Založ domácnost', 'Pampeliška je pro jednu domácnost s více členy. Každý člen může mít vlastní účty a vy společné.'],
  ['Přidej účty', 'Pohyby se evidují v měně účtu. Souhrny a rozpočty se přepočítají do Kč kurzem ČNB.'],
  ['Vyber výchozí strom kategorií', 'Strom půjde upravit, přesouvat a slučovat. Barvy a typ výdaje se dědí dolů.'],
  ['Jak dostaneš první pohyby?', 'Pohyby se vždy nahrají do dávky, kategorizují a teprve pak potvrdí.'],
]

const COLORS = ['c1', 'c4', 'c3', 'c5', 'c6', 'c7']
const CURRENCIES = ['CZK', 'EUR', 'USD']

function needLabel(n: CategoryTemplateNode) {
  return n.need === 'Need' ? ['Nezbytné', 'var(--need)'] : n.need === 'Joy' ? ['Pro radost', 'var(--joy)'] : n.need === 'None' ? ['Neoznačené', 'var(--none)'] : ['Podle podkategorií', 'var(--none)']
}

function kids(n: CategoryTemplateNode): string {
  if (!n.children?.length) return 'Bez podkategorií'
  return n.children.map((c) => (c.children?.length ? `${c.name} (${c.children.length})` : c.name)).join(' · ')
}

export default function StartPage() {
  const { me, household } = useUi()
  const qc = useQueryClient()
  const institutions = useQuery({ queryKey: ['institutions'], queryFn: () => api.get<Institution[]>('/api/institutions') }).data ?? []
  const templates = useQuery({ queryKey: ['category-templates'], queryFn: () => api.get<CategoryTemplate[]>('/api/category-templates') }).data ?? []
  const [step, setStep] = useState(0)
  const [hh, setHh] = useState(household.name === 'Domácnost' ? `Domácnost ${me.memberName ?? ''}`.trim() : household.name)
  const [members, setMembers] = useState<DraftMember[]>([{ name: me.memberName ?? me.name?.split(' ')[0] ?? '', email: me.email, color: me.color ?? 'c1' }])
  const [source, setSource] = useState<'Mcp' | 'Manual'>('Mcp')
  const [accounts, setAccounts] = useState<DraftAccount[]>([])
  const [tpl, setTpl] = useState('rec')
  const [imp, setImp] = useState<'mcp' | 'later'>('mcp')

  const banks = institutions.filter((i) => i.kind === 'Bank')
  const inst = (key: string) => institutions.find((i) => i.key === key) ?? { abbrev: '?', color: '#6B6557', name: key }
  const ownerLabel = (o: number | null) => (o === null ? 'Společný' : members[o]?.name || `Člen ${o + 1}`)
  const cycleOwner = (o: number | null) => (o === null ? 0 : o + 1 >= members.length ? (members.length > 1 ? null : 0) : o + 1)

  const finish = useMutation({
    mutationFn: () => api.post('/api/household/onboarding', {
      householdName: hh,
      members: members.map((m) => ({ name: m.name, email: m.email || null, colorToken: m.color })),
      accounts: accounts.map((a) => ({ name: a.name, institutionKey: a.institutionKey, currency: a.currency, ownerIndex: a.owner, kind: a.kind })),
      template: tpl,
      source,
    }),
    onSuccess: () => qc.invalidateQueries(),
    onError: notifyError,
  })

  const valid = [
    hh.trim().length > 0 && members[0].name.trim().length > 0 && members.slice(1).every((m) => !m.name.trim() || /.+@.+\..+/.test(m.email)),
    accounts.every((a) => a.name.trim().length > 0),
    !!tpl,
    true,
  ][step]
  const tree = templates.find((t) => t.key === tpl)

  const next = () => (step < 3 ? setStep(step + 1) : finish.mutate())

  return (
    <div className={s.page}>
      <div className={s.card}>
        <aside className={s.aside}>
          <Wordmark />
          <div className={s.steps}>
            {STEPS.map(([label, sub], i) => (
              <button key={label} type="button" className={clsx(s.step, i === step && s.stepOn)} onClick={() => i <= step && setStep(i)} disabled={i > step}>
                <span className={clsx(s.stepDot, i < step && s.stepDone, i === step && s.stepCurrent)}>{i < step ? <Check size={13} strokeWidth={3} /> : i + 1}</span>
                <span className="col" style={{ gap: 2 }}>
                  <span style={{ fontSize: 14, fontWeight: i === step ? 800 : 600, color: i <= step ? 'var(--ink)' : 'var(--ink-3)' }}>{label}</span>
                  <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>{sub}</span>
                </span>
              </button>
            ))}
          </div>
          <div className={s.progress}>{STEPS.map((_, i) => <span key={i} style={{ background: i <= step ? 'var(--accent)' : 'var(--line)' }} />)}</div>
          <span className={s.asideNote}>
            Všechno jde později změnit v Nastavení, Účtech a Kategoriích.
            {import.meta.env.DEV && (
              <button type="button" className={s.demo} onClick={async () => {
                try {
                  await api.post('/testing/demo')
                  await qc.invalidateQueries()
                } catch (e) {
                  notifyError(e)
                }
              }}>Otevřít s ukázkovými daty</button>
            )}
          </span>
        </aside>

        <main className={s.main}>
          <div className="col" style={{ gap: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink-3)' }}>Krok {step + 1} ze 4</span>
            <h1 style={{ fontSize: 32, lineHeight: 1.1 }}>{TITLES[step][0]}</h1>
            <span className="muted" style={{ fontSize: 15 }}>{TITLES[step][1]}</span>
          </div>

          {step === 0 && (
            <>
              <label className="col" style={{ gap: 6, fontSize: 13, fontWeight: 600, color: 'var(--ink-2)' }}>
                Název domácnosti
                <TextInput value={hh} onChange={(e) => setHh(e.target.value)} style={{ height: 46, fontSize: 16, fontWeight: 700 }} />
              </label>
              <div className="col">
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink-2)' }}>Členové</span>
                {members.map((m, i) => (
                  <div key={i} className={s.memberRow}>
                    <Avatar name={m.name || '?'} color={m.color} size={36} />
                    <div className={s.memberInputs}>
                      <input className={s.bare} value={m.name} placeholder="Jméno" aria-label="Jméno"
                        onChange={(e) => setMembers((x) => x.map((y, j) => (j === i ? { ...y, name: e.target.value } : y)))} />
                      {i > 0 && (
                        <input className={s.bareSmall} value={m.email} placeholder="e-mail pro přihlášení Googlem" aria-label="E-mail" type="email"
                          onChange={(e) => setMembers((x) => x.map((y, j) => (j === i ? { ...y, email: e.target.value } : y)))} />
                      )}
                    </div>
                    <span style={{ fontSize: 12, color: 'var(--ink-3)', whiteSpace: 'nowrap' }}>{i === 0 ? 'Ty' : 'Pozvánka'}</span>
                    {i > 0 && (
                      <button type="button" className={s.x} aria-label="Odebrat" onClick={() => {
                        setMembers((x) => x.filter((_, j) => j !== i))
                        setAccounts((x) => x.map((a) => ({ ...a, owner: a.owner === i ? 0 : a.owner !== null && a.owner > i ? a.owner - 1 : a.owner })))
                      }}><X size={16} /></button>
                    )}
                  </div>
                ))}
                <Button variant="dashed" icon={<Plus size={16} />} style={{ alignSelf: 'flex-start' }}
                  onClick={() => setMembers((x) => [...x, { name: '', email: '', color: COLORS[x.length % COLORS.length] }])}>
                  Přidat člena
                </Button>
                <span className="faint" style={{ fontSize: 12 }}>Pozvaný člen se přihlásí svým Google účtem na zadaný e-mail.</span>
              </div>
            </>
          )}

          {step === 1 && (
            <>
              <RadioCards columns={2} value={source} onChange={setSource} options={[
                { value: 'Mcp', title: 'Připojit přes MCP', icon: <Plug size={18} />, description: 'Výpis předáš Claudovi, ten pohyby pošle a navrhne kategorie. Nejrychlejší.' },
                { value: 'Manual', title: 'Zadávat ručně', icon: <FileText size={18} />, description: 'Pro hotovost nebo účty bez výpisu. Pohyby zadáš formulářem.' },
              ]} />
              <div className="col">
                {accounts.map((a, i) => (
                  <div key={i} className={s.accRow}>
                    <InstitutionBadge institution={inst(a.institutionKey)} />
                    <div className="col grow" style={{ gap: 1 }}>
                      <input className={s.bare} value={a.name} aria-label="Název účtu" style={{ fontSize: 14 }}
                        onChange={(e) => setAccounts((x) => x.map((y, j) => (j === i ? { ...y, name: e.target.value } : y)))} />
                      <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>{inst(a.institutionKey).name} · {source === 'Mcp' ? 'MCP' : 'ručně'}</span>
                    </div>
                    <button type="button" className={s.toggle} title="Měna – klikni pro změnu"
                      onClick={() => setAccounts((x) => x.map((y, j) => (j === i ? { ...y, currency: CURRENCIES[(CURRENCIES.indexOf(y.currency) + 1) % 3] } : y)))}>
                      {a.currency}
                    </button>
                    <button type="button" className={s.toggle} title="Vlastník – klikni pro změnu" style={{ minWidth: 90 }}
                      onClick={() => setAccounts((x) => x.map((y, j) => (j === i ? { ...y, owner: cycleOwner(y.owner) } : y)))}>
                      {a.owner !== null && <span style={{ width: 8, height: 8, borderRadius: 8, background: tokenColor(members[a.owner]?.color) }} />}
                      {ownerLabel(a.owner)}
                    </button>
                    <button type="button" className={s.x} aria-label="Odebrat účet" onClick={() => setAccounts((x) => x.filter((_, j) => j !== i))}><X size={16} /></button>
                  </div>
                ))}
                <div className="row wrap">
                  {banks.map((b) => (
                    <button key={b.key} type="button" className={s.bankChip}
                      onClick={() => setAccounts((x) => [...x, { name: b.key === 'oth' ? 'Účet' : 'Běžný účet', institutionKey: b.key, currency: 'CZK', owner: 0, kind: 'Current' }])}>
                      <Plus size={14} /> {b.name}
                    </button>
                  ))}
                </div>
                <span className="faint" style={{ fontSize: 12 }}>Klikni na měnu nebo vlastníka pro změnu. Spořicí a investiční účty přidáš později v Účtech.</span>
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <div className={s.tplGrid}>
                {templates.map((t) => (
                  <button key={t.key} type="button" className={clsx(s.tpl, t.key === tpl && s.tplOn)} onClick={() => setTpl(t.key)}>
                    <span style={{ fontSize: 15, fontWeight: 800 }}>{t.label}</span>
                    <span style={{ fontSize: 12, color: 'var(--ink-2)' }}>{t.note}</span>
                  </button>
                ))}
              </div>
              <div className={s.tree}>
                {tree?.expense.map((n) => {
                  const [nl, nc] = needLabel(n)
                  return (
                    <div key={n.name} className="col" style={{ gap: 4, padding: '6px 0' }}>
                      <div className="row">
                        <span style={{ width: 10, height: 10, borderRadius: 5, background: tokenColor(n.color) }} />
                        <span style={{ fontSize: 14, fontWeight: 700, flex: 1 }}>{n.name}</span>
                        <span className="row" style={{ gap: 4, fontSize: 11, fontWeight: 600, color: 'var(--ink-2)' }}>
                          <span style={{ width: 6, height: 6, borderRadius: 3, background: nc }} />{nl}
                        </span>
                      </div>
                      <span style={{ fontSize: 12, color: 'var(--ink-3)', paddingLeft: 18 }}>{kids(n)}</span>
                    </div>
                  )
                })}
                {tree && (
                  <div className="col" style={{ gap: 4, padding: '6px 0' }}>
                    <div className="row">
                      <span style={{ width: 10, height: 10, borderRadius: 5, background: 'var(--pos)' }} />
                      <span style={{ fontSize: 14, fontWeight: 700 }}>Příjmy</span>
                    </div>
                    <span style={{ fontSize: 12, color: 'var(--ink-3)', paddingLeft: 18 }}>{tree.income.map((n) => n.name).join(' · ')}</span>
                  </div>
                )}
              </div>
              <span className="faint" style={{ fontSize: 12 }}>Nezbytné / pro radost se dědí stromem. U každé kategorie jde později změnit.</span>
            </>
          )}

          {step === 3 && (
            <>
              <RadioCards value={imp} onChange={setImp} options={[
                { value: 'mcp', title: 'Přes MCP a Clauda', icon: <Plug size={20} />, description: 'Připojíš Pampelišku v Claude, dáš mu výpis (PDF, CSV) a on pohyby nahraje, navrhne kategorie a rozdělení. Ty jen potvrdíš.' },
                { value: 'later', title: 'Později', icon: <Clock size={20} />, description: 'Začneš s prázdným přehledem. Připojení najdeš v Nastavení.' },
              ]} />
              {imp === 'mcp' && <McpSetupGuide compact />}
            </>
          )}

          <div className={s.foot}>
            {step > 0 && <Button variant="ghost" icon={<ChevronLeft size={16} />} onClick={() => setStep(step - 1)}>Zpět</Button>}
            <span style={{ flex: 1 }} />
            <Button variant="primary" size="lg" disabled={!valid} loading={finish.isPending} iconRight={step < 3 ? <ChevronRight size={16} /> : undefined} onClick={next}>
              {step < 3 ? 'Pokračovat' : 'Dokončit'}
            </Button>
          </div>
        </main>
      </div>
    </div>
  )
}
