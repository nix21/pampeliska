import * as DialogPrimitive from '@radix-ui/react-dialog'
import * as RadioGroup from '@radix-ui/react-radio-group'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import clsx from 'clsx'
import { Check, PiggyBank, Plus, Scale, TrendingUp, Wallet, X } from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import { api, notifyError, notifyOk } from '../../lib/api'
import { accountsQuery } from '../../lib/accounts'
import { count, num } from '../../lib/format'
import { conditionTypeLabel, investmentKindLabel, type AccountInput } from '../../lib/household'
import type {
  Account, AccountKind, AccountSource, ConditionType, Institution, InvestmentKind, ShareRecalcMode, ValueTracking,
} from '../../lib/types'
import { useUi } from '../../state/ui'
import { InstitutionBadge, useMoney } from '../common'
import {
  Avatar, Button, DateInput, IconButton, NumberInput, Pill, RadioCards, Segmented, Select, Slider, Switch, TextInput, tokenColor,
} from '../ui'
import { ratioText, sym } from './helpers'
import s from './AccountForm.module.css'

interface CondDraft { type: ConditionType; target: number | null; benefit: string }

interface Draft {
  kind: AccountKind
  name: string
  institutionKey: string
  iban: string
  currency: string
  owner: number | 'joint'
  ratio: Record<number, number>
  ratioMode: ShareRecalcMode
  ratioFrom: string | null
  cardToHolder: boolean
  source: AccountSource
  valueTracking: ValueTracking
  investmentKind: InvestmentKind
  fundingAccountId: number | null
  openingBalance: number | null
  openingDate: string | null
  openingDeposits: number | null
  watchLow: boolean
  lowLimit: number | null
  interestRate: number | null
  includeInDisposable: boolean
  includeInNetWorth: boolean
  conditions: CondDraft[]
}

export interface AccountFormProps {
  open: boolean
  onClose: () => void
  /** Úprava existujícího účtu; bez něj nový účet. */
  account?: Account
  /** Výchozí typ nového účtu. */
  kind?: AccountKind
  /** Nový účet rovnou jako společný. */
  jointDefault?: boolean
  onSaved?: (a: Account) => void
  /** „Korekce zůstatku“ / „Zadat hodnotu“ z formuláře úprav. */
  onBalanceAction?: () => void
}

const CURRENCIES = ['CZK', 'EUR', 'USD']
const PRESETS = [50, 60, 70, 40]

function equalRatio(ids: number[]) {
  const r: Record<number, number> = {}
  if (!ids.length) return r
  const each = Math.floor(100 / ids.length)
  ids.forEach((id, i) => (r[id] = i === ids.length - 1 ? 100 - each * (ids.length - 1) : each))
  return r
}

function initialDraft(account: Account | undefined, kind: AccountKind, memberIds: number[], me: number | undefined, today: string, jointDefault?: boolean): Draft {
  if (account) {
    const ratio: Record<number, number> = {}
    account.ratio.forEach((r) => (ratio[r.memberId] = r.percent))
    return {
      kind: account.kind, name: account.name, institutionKey: account.institution.key, iban: account.iban ?? '', currency: account.currency,
      owner: account.joint ? 'joint' : account.ownerMemberId ?? memberIds[0], ratio: account.joint && account.ratio.length ? ratio : equalRatio(memberIds),
      ratioMode: 'NewOnly', ratioFrom: today, cardToHolder: account.cardToHolder, source: account.source, valueTracking: account.valueTracking,
      investmentKind: account.investmentKind ?? 'Etf', fundingAccountId: account.fundingAccountId ?? null,
      openingBalance: account.openingBalance, openingDate: account.openingDate, openingDeposits: account.openingDeposits ?? null,
      watchLow: account.lowBalanceLimit != null, lowLimit: account.lowBalanceLimit ?? (account.currency === 'CZK' ? 5000 : 200),
      interestRate: account.interestRate ?? null, includeInDisposable: account.includeInDisposable, includeInNetWorth: account.includeInNetWorth,
      conditions: account.conditions.map((c) => ({ type: c.type, target: c.target, benefit: c.benefit ?? '' })),
    }
  }
  const inv = kind === 'Investment'
  return {
    kind, name: '', institutionKey: '', iban: '', currency: inv ? 'EUR' : 'CZK', owner: jointDefault ? 'joint' : me ?? memberIds[0] ?? 'joint', ratio: equalRatio(memberIds),
    ratioMode: 'NewOnly', ratioFrom: today, cardToHolder: true, source: 'Mcp', valueTracking: 'Manual', investmentKind: 'Etf', fundingAccountId: null,
    openingBalance: null, openingDate: today, openingDeposits: null, watchLow: kind === 'Current', lowLimit: 5000, interestRate: null,
    includeInDisposable: !inv, includeInNetWorth: true, conditions: [],
  }
}

/** Formulář nového účtu / úpravy účtu (běžný, spořicí, investiční). Na mobilu přes celou obrazovku. */
export function AccountForm({ open, onClose, account, kind = 'Current', jointDefault, onSaved, onBalanceAction }: AccountFormProps) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className={s.overlay} />
        <DialogPrimitive.Content className={s.sheet} aria-describedby={undefined}>
          {open && <FormBody key={account?.id ?? `new-${kind}`} account={account} kind={kind} jointDefault={jointDefault} onClose={onClose} onSaved={onSaved} onBalanceAction={onBalanceAction} />}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}

function FormBody({ account, kind, jointDefault, onClose, onSaved, onBalanceAction }: Omit<AccountFormProps, 'open'> & { kind: AccountKind }) {
  const { household, me } = useUi()
  const qc = useQueryClient()
  const fmt = useMoney()
  const members = household.members
  const memberIds = members.map((m) => m.id)
  const institutionsData = useQuery({ queryKey: ['institutions'], queryFn: () => api.get<Institution[]>('/api/institutions') }).data
  const institutions = institutionsData ?? []
  const accountsData = useQuery(accountsQuery).data
  const [f, setF] = useState<Draft>(() => initialDraft(account, kind, memberIds, me.memberId, household.today, jointDefault))
  const [archiveArmed, setArchiveArmed] = useState(false)
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setF((x) => ({ ...x, [k]: v }))

  const edit = !!account
  const inv = f.kind === 'Investment'
  const locked = edit && (account?.transactionCount ?? 0) > 0
  const joint = f.owner === 'joint'

  const banks = institutions.filter((i) => i.kind === 'Bank')
  const brokers = institutions.filter((i) => i.kind === 'Broker')
  const instOptions = inv ? [...brokers, ...banks] : banks
  // Výchozí instituce po načtení / změně typu (neplatná volba → první v seznamu)
  const instKey = instOptions.some((i) => i.key === f.institutionKey) || (edit && f.institutionKey === account?.institution.key)
    ? f.institutionKey : instOptions[0]?.key ?? ''
  const inst = institutions.find((i) => i.key === instKey)

  const setKind = (k: AccountKind) => setF((x) => ({
    ...x, kind: k, includeInDisposable: k !== 'Investment', watchLow: k === 'Current' ? x.watchLow : false,
    currency: k === 'Investment' ? 'EUR' : x.kind === 'Investment' ? 'CZK' : x.currency,
  }))

  // Poměr
  const ratioSum = Object.values(f.ratio).reduce((a, b) => a + b, 0)
  const origRatio = account?.joint && account.ratio.length ? account.ratio : null
  const ratioChanged = !origRatio || origRatio.some((r) => (f.ratio[r.memberId] ?? 0) !== r.percent) || Object.keys(f.ratio).length !== origRatio.length
  const showApply = edit && joint && !!origRatio && ratioChanged && (account?.transactionCount ?? 0) > 0
  const setTwo = (v: number) => members.length >= 2 && set('ratio', { [members[0].id]: v, [members[1].id]: 100 - v })

  const conditionsValid = f.conditions.every((c) => c.target != null && c.target > 0)
  const valid = f.name.trim().length > 0 && !!instKey && (!joint || Math.abs(ratioSum - 100) < 0.01)
    && (inv || conditionsValid) && (!showApply || f.ratioMode !== 'FromDate' || !!f.ratioFrom)

  const invalidate = () => {
    for (const k of [['accounts'], ['household'], ['forecast'], ['conditions'], ['investments'], ['stats'], ['badges']]) qc.invalidateQueries({ queryKey: k })
  }

  const save = useMutation({
    mutationFn: () => {
      const input: AccountInput = {
        kind: f.kind, name: f.name.trim(), institutionKey: instKey, iban: f.iban.trim(), currency: f.currency,
        includeInDisposable: inv ? false : f.includeInDisposable, includeInNetWorth: f.includeInNetWorth,
      }
      if (joint) {
        input.joint = true
        input.cardToHolder = f.cardToHolder
        if (!edit || !account?.joint || ratioChanged) {
          input.ratio = f.ratio
          if (showApply) {
            input.ratioMode = f.ratioMode
            if (f.ratioMode === 'FromDate' && f.ratioFrom) input.ratioFrom = f.ratioFrom
          } else if (edit && origRatio) input.ratioMode = 'All' // účet bez pohybů: poměr platí od začátku
        }
      } else input.ownerMemberId = f.owner as number
      if (inv) {
        input.valueTracking = f.valueTracking
        input.investmentKind = f.investmentKind
        if (f.fundingAccountId != null) input.fundingAccountId = f.fundingAccountId
      } else {
        input.source = f.source
        input.conditions = f.conditions.filter((c) => c.target != null && c.target > 0)
          .map((c) => ({ type: c.type, target: c.target!, benefit: c.benefit.trim() || null }))
      }
      if (f.kind === 'Current') {
        input.watchLowBalance = f.watchLow
        if (f.watchLow && f.lowLimit != null) input.lowBalanceLimit = f.lowLimit
      } else if (edit && account?.lowBalanceLimit != null) input.watchLowBalance = false
      if (f.kind === 'Savings' && f.interestRate != null) input.interestRate = f.interestRate
      if (!edit) {
        input.openingBalance = f.openingBalance ?? 0
        if (f.openingDate) input.openingDate = f.openingDate
        if (inv && f.openingDeposits != null) input.openingDeposits = f.openingDeposits
      }
      return edit ? api.put<Account>(`/api/accounts/${account!.id}`, input) : api.post<Account>('/api/accounts', input)
    },
    onSuccess: (a) => {
      notifyOk(edit ? `Účet ${a.name} uložen` : `Účet ${a.name} přidán`)
      if (edit && showApply) qc.invalidateQueries({ queryKey: ['transactions'] })
      invalidate()
      onSaved?.(a)
      onClose()
    },
    onError: notifyError,
  })

  const archive = useMutation({
    mutationFn: () => api.post(`/api/accounts/${account!.id}/archive`, { archived: !account!.archived }),
    onSuccess: () => {
      notifyOk(account!.archived ? `Účet ${account!.name} obnoven` : `Účet ${account!.name} archivován`)
      invalidate()
      onClose()
    },
    onError: notifyError,
  })

  const fundingOptions = useMemo(() => (accountsData ?? []).filter((a) => a.kind !== 'Investment').map((a) => ({
    value: String(a.id), label: `${a.name} · ${a.institution.name}`,
  })), [accountsData])

  const title = edit ? 'Upravit účet' : inv ? 'Nový investiční účet' : 'Nový účet'
  const sub = edit
    ? `${account!.name} · ${account!.institution.name} · ${account!.currency}`
    : `${f.name.trim() || 'Bez názvu'} · ${inst?.name ?? '…'} · ${f.currency}`

  return (
    <>
      <div className={s.head}>
        <InstitutionBadge institution={inst ?? { abbrev: '?', color: '#6B6557' }} size={40} />
        <div className={s.headText}>
          <DialogPrimitive.Title className={s.title}>{title}</DialogPrimitive.Title>
          <span className={s.sub}>{sub}</span>
        </div>
        <DialogPrimitive.Close asChild><IconButton label="Zavřít" plain className={s.close}><X size={20} /></IconButton></DialogPrimitive.Close>
      </div>

      <div className={s.body}>
        <Section title="Typ účtu">
          <RadioCards<AccountKind> columns={3} value={f.kind} onChange={(k) => !locked && setKind(k)} options={[
            { value: 'Current', title: 'Běžný', icon: <Wallet size={20} />, description: 'Platby kartou, výplaty, inkasa. Vstupuje do výdajů a výhledu.', disabled: locked && f.kind !== 'Current' },
            { value: 'Savings', title: 'Spořicí', icon: <PiggyBank size={20} />, description: 'Rezerva s úrokem. Převody sem nejsou výdaj.', disabled: locked && f.kind !== 'Savings' },
            { value: 'Investment', title: 'Investiční', icon: <TrendingUp size={20} />, description: 'ETF, akcie, penzijko. Sleduje hodnotu a výnos.', disabled: locked && f.kind !== 'Investment' },
          ]} />
          {locked && <span className={s.help}>Typ a měnu nelze u existujícího účtu změnit, účet už má pohyby. Založ nový účet a starý archivuj.</span>}
        </Section>

        <Section title="Základní údaje" gap={12}>
          <div className={s.grid2}>
            <label className={s.label}>Název účtu
              <TextInput value={f.name} onChange={(e) => set('name', e.target.value)} autoFocus={!edit} className={s.input}
                placeholder={inv ? 'Např. ETF portfolio' : f.kind === 'Savings' ? 'Např. Rezerva' : 'Např. Běžný účet'} />
            </label>
            <div className={s.label}>{inv ? 'Broker / platforma' : 'Banka'}
              <div className={s.bankSelect}>
                {inst && <span className={s.bankSelectBadge}><InstitutionBadge institution={inst} size={28} /></span>}
                <Select value={instKey || null} onChange={(v) => set('institutionKey', v)} aria-label={inv ? 'Broker' : 'Banka'} className={s.bankTrigger}
                  options={instOptions.map((i) => ({ value: i.key, label: i.name, group: inv ? (i.kind === 'Broker' ? 'Brokeři a platformy' : 'Banky') : undefined }))} />
              </div>
            </div>
            <label className={s.label}>{inv ? 'Číslo portfolia (nepovinné)' : 'Číslo účtu nebo IBAN'}
              <TextInput value={f.iban} onChange={(e) => set('iban', e.target.value)} className={s.input} style={{ fontVariantNumeric: 'tabular-nums' }}
                placeholder={inv ? 'Např. 51234567' : 'CZ65 0800 0000 …'} />
            </label>
            <div className={s.label}>{inv ? 'Měna vedení portfolia' : 'Měna účtu'}
              <Segmented full value={f.currency} onChange={(v) => !locked && set('currency', v)} className={clsx(s.seg, locked && s.segLocked)}
                options={CURRENCIES.map((c) => ({ value: c, label: c, disabled: locked && c !== f.currency }))} />
            </div>
          </div>
          {!inv && <span className={s.help}>Číslo účtu pomáhá poznat převody mezi vlastními účty a vyhodnotit podmínky banky.</span>}
        </Section>

        <Section title="Vlastník">
          <Segmented<string> full className={s.seg} value={String(f.owner)} onChange={(v) => set('owner', v === 'joint' ? 'joint' : Number(v))}
            options={[...members.map((m) => ({ value: String(m.id), label: m.name })), { value: 'joint', label: 'Společný' }]} />
          {joint && (
            <div className={s.jointBox}>
              <span className={s.boxLabel}>{edit && origRatio ? 'Poměr plateb' : 'Výchozí poměr nových plateb'}</span>
              {members.length === 2 ? (
                <>
                  <div className={s.ratioRow}>
                    <span className={s.ratioSide}><Avatar name={members[0].name} color={members[0].colorToken} size={22} />{num(f.ratio[members[0].id] ?? 0)} %</span>
                    <div className="grow"><Slider value={f.ratio[members[0].id] ?? 50} onChange={setTwo} min={0} max={100} step={5} label={`Podíl ${members[0].name}`} /></div>
                    <span className={s.ratioSide} style={{ justifyContent: 'flex-end' }}>{num(f.ratio[members[1].id] ?? 0)} %<Avatar name={members[1].name} color={members[1].colorToken} size={22} /></span>
                  </div>
                  <RatioBar ratio={f.ratio} />
                  <div className="row wrap" style={{ gap: 6 }}>
                    {PRESETS.map((p) => (
                      <button key={p} type="button" className={clsx(s.preset, f.ratio[members[0].id] === p && s.presetOn)} onClick={() => setTwo(p)}>
                        {p} : {100 - p}
                      </button>
                    ))}
                  </div>
                </>
              ) : (
                <div className="col" style={{ gap: 8 }}>
                  {members.map((m) => (
                    <div key={m.id} className="row">
                      <Avatar name={m.name} color={m.colorToken} size={22} />
                      <span className="grow" style={{ fontWeight: 700 }}>{m.name}</span>
                      <div style={{ width: 110 }}>
                        <NumberInput value={f.ratio[m.id] ?? 0} suffix="%" decimals={1} onChange={(v) => set('ratio', { ...f.ratio, [m.id]: v ?? 0 })} aria-label={`Podíl ${m.name}`} />
                      </div>
                    </div>
                  ))}
                  <RatioBar ratio={f.ratio} />
                  <span style={{ fontSize: 12, fontWeight: 700, color: Math.abs(ratioSum - 100) < 0.01 ? 'var(--ink-3)' : 'var(--neg)' }}>Součet {num(ratioSum, 1)} % (musí být 100 %)</span>
                </div>
              )}
              <div className={s.switchRow} style={{ paddingTop: 10, borderTop: '1px solid var(--line)' }}>
                <span className="col grow" style={{ gap: 2 }}>
                  <span style={{ fontSize: 13, fontWeight: 700 }}>Platby kartou přiřadit držiteli karty</span>
                  <span className={s.help}>Poměr se pak použije jen na převody, inkasa a trvalé příkazy</span>
                </span>
                <Switch checked={f.cardToHolder} onChange={(v) => set('cardToHolder', v)} label="Platby kartou přiřadit držiteli karty" />
              </div>
              {showApply && (
                <div className="col" style={{ gap: 8, paddingTop: 10, borderTop: '1px solid var(--line)' }}>
                  <span className={s.boxLabel}>Poměr se změnil z {ratioText(origRatio!)}. Použít nový poměr na</span>
                  <RadioRows<ShareRecalcMode> value={f.ratioMode} onChange={(v) => set('ratioMode', v)} options={[
                    { value: 'NewOnly', label: 'Jen na nové platby', sub: `Dosavadní platby si ponechají poměr ${ratioText(origRatio!)}` },
                    { value: 'All', label: 'I zpětně na všechny platby účtu', sub: `${account!.transactionCount >= 2 && account!.transactionCount <= 4 ? 'Přepočítají' : 'Přepočítá'} se ${count(account!.transactionCount, 'platba', 'platby', 'plateb')}. Ručně rozdělené platby zůstanou beze změny.` },
                    {
                      value: 'FromDate', label: 'Od data', sub: 'Platby od zvoleného dne se přepočítají, starší zůstanou',
                      extra: f.ratioMode === 'FromDate' && <div style={{ maxWidth: 200, marginTop: 6 }}><DateInput value={f.ratioFrom} onChange={(v) => set('ratioFrom', v)} aria-label="Od data" /></div>,
                    },
                  ]} />
                </div>
              )}
            </div>
          )}
        </Section>

        <Section title={inv ? 'Jak sledovat hodnotu' : 'Odkud chodí pohyby'}>
          {inv ? (
            <RadioRows<ValueTracking> value={f.valueTracking} onChange={(v) => set('valueTracking', v)} options={[
              { value: 'Manual', label: 'Ruční zadání hodnoty', sub: 'Jednou měsíčně opíšeš hodnotu z aplikace brokera (nebo ji pošle Claude přes MCP)' },
              { value: 'Positions', label: 'Z pozic a obchodů', sub: 'Evidence nákupů a prodejů, ceny ETF se stahují denně', disabled: true },
              { value: 'Statement', label: 'Import výpisu od brokera', sub: 'Obchody i vklady z CSV exportu', disabled: true },
            ]} />
          ) : (
            <RadioRows<AccountSource> value={f.source} onChange={(v) => set('source', v)} options={[
              { value: 'Mcp', label: 'Přes MCP a Clauda', sub: 'Výpis předáš Claudovi, ten pohyby nahraje a navrhne kategorie' },
              { value: 'Manual', label: 'Zadávat ručně', sub: 'Pro hotovost nebo banky bez exportu' },
              { value: 'EnableBanking', label: 'Automaticky z banky (Enable Banking)', sub: 'Pravidelné stahování pohybů přímo z banky', disabled: true },
            ]} />
          )}
        </Section>

        {inv && (
          <>
            <Section title="Druh investice">
              <div className="row wrap" style={{ gap: 6 }}>
                {(Object.keys(investmentKindLabel) as InvestmentKind[]).map((k) => (
                  <button key={k} type="button" className={clsx(s.chip, f.investmentKind === k && s.chipOn)} onClick={() => set('investmentKind', k)}>
                    {investmentKindLabel[k]}
                  </button>
                ))}
              </div>
            </Section>
            <Section title="Vklady přicházejí z účtu" gap={6}>
              <div style={{ maxWidth: 420 }}>
                <Select value={f.fundingAccountId != null ? String(f.fundingAccountId) : null} onChange={(v) => set('fundingAccountId', Number(v))}
                  placeholder="Vyber účet" options={fundingOptions} className={s.input} aria-label="Vklady přicházejí z účtu" />
              </div>
              <span className={s.help}>Převody mezi tímto a vybraným účtem se spárují automaticky a nezapočítají se do výdajů.</span>
            </Section>
          </>
        )}

        <Section title={inv ? (edit ? 'Hodnota' : 'Počáteční stav') : edit ? 'Zůstatek' : 'Počáteční zůstatek'} gap={12}>
          {!edit ? (
            <>
              <div className={s.grid2}>
                <label className={s.label}>{inv ? 'Aktuální hodnota' : 'Zůstatek'}
                  <NumberInput value={f.openingBalance} onChange={(v) => set('openingBalance', v)} suffix={sym(f.currency)} placeholder="0" className={s.input} />
                </label>
                {inv ? (
                  <label className={s.label}>Z toho vloženo celkem
                    <NumberInput value={f.openingDeposits} onChange={(v) => set('openingDeposits', v)} suffix={sym(f.currency)} placeholder="0" className={s.input} />
                  </label>
                ) : (
                  <label className={s.label}>Ke dni
                    <DateInput value={f.openingDate} onChange={(v) => set('openingDate', v)} className={s.input} />
                  </label>
                )}
              </div>
              <span className={s.help}>
                {inv ? 'Z rozdílu hodnoty a vkladů se počítá výnos. Další vklady se doplní z párovaných převodů.'
                  : 'Od tohoto dne se dopočítává vývoj zůstatku. Starší pohyby můžeš doplnit nahráním výpisu.'}
              </span>
            </>
          ) : (
            <>
              <div className={s.balBox}>
                <div className="col grow" style={{ gap: 2 }}>
                  <span className="faint" style={{ fontSize: 12 }}>{inv ? 'Poslední zadaná hodnota' : 'Zůstatek v evidenci'}</span>
                  <span className="num" style={{ fontSize: 20, fontWeight: 800 }}>{fmt(account!.balance, { currency: account!.currency })}</span>
                </div>
                {onBalanceAction && (
                  <Button variant="secondary" icon={inv ? <TrendingUp size={16} /> : <Scale size={16} />} onClick={() => { onClose(); onBalanceAction() }}>
                    {inv ? 'Zadat hodnotu' : 'Korekce zůstatku'}
                  </Button>
                )}
              </div>
              <span className={s.help}>
                {inv ? 'Hodnota se mění jen zadáním nové hodnoty nebo obchodem, ne úpravou účtu.'
                  : 'Zůstatek se mění jen pohyby. Pro srovnání s bankou použij korekci, zůstane vidět v historii.'}
              </span>
            </>
          )}
        </Section>

        {f.kind === 'Current' && (
          <Section gap={10}>
            <div className={s.switchRow}>
              <span className="col grow" style={{ gap: 2 }}>
                <span className={s.sectionTitle}>Hlídat nízký zůstatek</span>
                <span className={s.help}>Upozorním, když výhled pravidelných plateb klesne pod limit</span>
              </span>
              <Switch checked={f.watchLow} onChange={(v) => set('watchLow', v)} label="Hlídat nízký zůstatek" />
            </div>
            {f.watchLow && (
              <div style={{ maxWidth: 220 }}>
                <NumberInput value={f.lowLimit} onChange={(v) => set('lowLimit', v)} suffix={sym(f.currency)} aria-label="Limit" className={s.input} />
              </div>
            )}
          </Section>
        )}
        {f.kind === 'Savings' && (
          <Section title="Úroková sazba" gap={6}>
            <div style={{ maxWidth: 220 }}>
              <NumberInput value={f.interestRate} onChange={(v) => set('interestRate', v)} suffix="% p. a." placeholder="3,2" className={clsx(s.input, s.rateInput)} aria-label="Úroková sazba" />
            </div>
            <span className={s.help}>Připsané úroky se zařadí jako příjem mimo mzdy.</span>
          </Section>
        )}

        {!inv && (
          <Section title="Podmínky účtu">
            <span className={s.help}>
              Když banka podmiňuje výhody (vedení zdarma, vyšší úrok) počtem plateb kartou nebo příchozí částkou, zadej je sem.
              Na Přehledu pak uvidíš, jak se daří je plnit. Převody z vlastního účtu u stejné banky se do příchozích nepočítají, z jiné banky ano.
            </span>
            {f.conditions.map((c, i) => {
              const upd = (p: Partial<CondDraft>) => set('conditions', f.conditions.map((x, j) => (j === i ? { ...x, ...p } : x)))
              const card = c.type === 'CardCount'
              return (
                <div key={i} className={s.cond}>
                  <div className={s.label} style={{ flex: '1 1 190px' }}>Podmínka
                    <Select value={c.type} onChange={(v) => upd({ type: v as ConditionType })} className={s.inputWhite}
                      options={(Object.keys(conditionTypeLabel) as ConditionType[]).map((t) => ({ value: t, label: conditionTypeLabel[t] }))} aria-label="Podmínka" />
                  </div>
                  <label className={s.label} style={{ flex: '0 1 160px' }}>{card ? 'Minimálně' : c.type === 'AvgBalance' ? 'Průměrně alespoň' : 'Měsíčně alespoň'}
                    <NumberInput value={c.target} onChange={(v) => upd({ target: v })} suffix={card ? 'plateb' : sym(f.currency)} className={clsx(s.inputWhite, card && s.cardInput)} />
                  </label>
                  <label className={s.label} style={{ flex: '1 1 200px' }}>Výhoda při splnění
                    <TextInput value={c.benefit} onChange={(e) => upd({ benefit: e.target.value })} placeholder="Např. vedení účtu zdarma" className={s.inputWhite} />
                  </label>
                  <IconButton label="Odebrat podmínku" plain className={s.condRemove} onClick={() => set('conditions', f.conditions.filter((_, j) => j !== i))}><X size={18} /></IconButton>
                </div>
              )
            })}
            <Button variant="dashed" icon={<Plus size={16} />} style={{ alignSelf: 'flex-start' }}
              onClick={() => set('conditions', [...f.conditions, { type: 'CardCount', target: 5, benefit: '' }])}>
              Přidat podmínku
            </Button>
          </Section>
        )}

        <Section title="Započítávat do" gap={0}>
          <div className={clsx(s.switchRow, s.inclRow)} style={inv ? { opacity: 0.5 } : undefined}>
            <span className="col grow" style={{ gap: 2 }}>
              <span style={{ fontSize: 14, fontWeight: 700 }}>Disponibilní zůstatek</span>
              <span className={s.help}>{inv ? 'Investice nejsou okamžitě k dispozici' : 'Peníze k okamžitému použití, souhrn na Přehledu'}</span>
            </span>
            <Switch checked={inv ? false : f.includeInDisposable} disabled={inv} onChange={(v) => set('includeInDisposable', v)} label="Disponibilní zůstatek" />
          </div>
          <div className={clsx(s.switchRow, s.inclRow)}>
            <span className="col grow" style={{ gap: 2 }}>
              <span style={{ fontSize: 14, fontWeight: 700 }}>Čisté jmění</span>
              <span className={s.help}>Majetek celkem na Přehledu a v Investicích</span>
            </span>
            <Switch checked={f.includeInNetWorth} onChange={(v) => set('includeInNetWorth', v)} label="Čisté jmění" />
          </div>
        </Section>
      </div>

      <div className={s.foot}>
        {edit && (
          account!.archived ? (
            <Button variant="ghost" loading={archive.isPending} onClick={() => archive.mutate()}>Obnovit z archivu</Button>
          ) : (
            <button type="button" className={clsx(s.archive, archiveArmed && s.archiveArmed)} disabled={archive.isPending}
              onClick={() => (archiveArmed ? archive.mutate() : setArchiveArmed(true))} onBlur={() => setArchiveArmed(false)}>
              {archiveArmed ? 'Opravdu archivovat?' : 'Archivovat účet'}
            </button>
          )
        )}
        <span style={{ flex: 1 }} />
        <Button variant="secondary" className={s.footBtn} onClick={onClose}>Zrušit</Button>
        <Button variant="primary" className={s.footBtn} icon={<Check size={16} />} disabled={!valid} loading={save.isPending} onClick={() => save.mutate()}>
          {edit ? 'Uložit změny' : 'Přidat účet'}
        </Button>
      </div>
    </>
  )
}

function Section({ title, children, gap = 10 }: { title?: ReactNode; children: ReactNode; gap?: number }) {
  return (
    <div className="col" style={{ gap }}>
      {title && <span className={s.sectionTitle}>{title}</span>}
      {children}
    </div>
  )
}

function RatioBar({ ratio }: { ratio: Record<number, number> }) {
  const { household } = useUi()
  return (
    <div className={s.ratioBar}>
      {household.members.map((m) => (ratio[m.id] ?? 0) > 0 && (
        <span key={m.id} style={{ flex: ratio[m.id], background: tokenColor(m.colorToken) }} />
      ))}
    </div>
  )
}

interface RadioRowOption<T extends string> { value: T; label: ReactNode; sub?: ReactNode; disabled?: boolean; extra?: ReactNode }

/** Svislý seznam voleb s kolečkem (Odkud chodí pohyby, Použít poměr na …). */
function RadioRows<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: RadioRowOption<T>[] }) {
  return (
    <RadioGroup.Root className={s.rows} value={value} onValueChange={(v) => onChange(v as T)}>
      {options.map((o) => (
        <div key={o.value} className={clsx(s.rowWrap, o.value === value && s.rowWrapOn)}>
          <RadioGroup.Item value={o.value} disabled={o.disabled} className={s.rowItem}>
            <span className={s.ring}><span /></span>
            <span className="col grow" style={{ gap: 2 }}>
              <span className="row wrap" style={{ gap: 6, fontSize: 14, fontWeight: 700 }}>
                {o.label}{o.disabled && <Pill tone="neutral">připravujeme</Pill>}
              </span>
              {o.sub && <span className={s.help}>{o.sub}</span>}
            </span>
          </RadioGroup.Item>
          {o.extra && <div className={s.rowExtra}>{o.extra}</div>}
        </div>
      ))}
    </RadioGroup.Root>
  )
}
