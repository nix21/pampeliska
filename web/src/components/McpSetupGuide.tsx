import { Check, Copy, Monitor, Terminal } from 'lucide-react'
import { useState } from 'react'
import { Card, IconButton, TextInput } from './ui'

export function CopyField({ value, mono }: { value: string; mono?: boolean }) {
  const [copied, setCopied] = useState(false)
  return (
    <div className="row" style={{ gap: 6 }}>
      <TextInput value={value} readOnly onFocus={(e) => e.currentTarget.select()}
        style={mono ? { fontFamily: 'ui-monospace, monospace', fontSize: 12, fontWeight: 500 } : { fontWeight: 600 }} />
      <IconButton label={copied ? 'Zkopírováno' : 'Kopírovat'} onClick={async () => {
        await navigator.clipboard.writeText(value)
        setCopied(true)
        setTimeout(() => setCopied(false), 1500)
      }}>
        {copied ? <Check size={16} color="var(--pos)" /> : <Copy size={16} />}
      </IconButton>
    </div>
  )
}

const examples = [
  'Tady je výpis z Fio za září, nahraj ho do Pampelišky a navrhni kategorie.',
  'Projdi platby ke kategorizaci a zařaď je. U opakujících se obchodníků navrhni pravidla.',
  'Založ kategorii Kočka pod Mazlíčci a přesuň do ní platby ze Zoohitu.',
  'Kolik jsme letos utratili za restaurace a jak to vypadá proti loňsku?',
  'Vystačí Běžný účet do výplaty?',
]

/** Návod na připojení Claude Desktop / claude.ai a Claude Code k MCP serveru Pampelišky. */
export function McpSetupGuide({ compact }: { compact?: boolean }) {
  const url = `${window.location.origin}/mcp`
  const command = `claude mcp add --transport http --scope user pampeliska ${url}`
  const steps = (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 300px), 1fr))', gap: 12 }}>
      <div className="col" style={{ gap: 8, padding: 14, borderRadius: 'var(--radius-sm)', background: 'var(--surface-2)' }}>
        <span className="row" style={{ fontWeight: 800 }}><Monitor size={18} /> Claude Desktop / claude.ai</span>
        <ol style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13 }}>
          <li>Settings → Connectors → <b>Add custom connector</b>.</li>
          <li>Název <b>Pampeliška</b>, URL: adresa MCP serveru.</li>
          <li><b>Connect</b> → přihlášení Googlem → na stránce „Připojit aplikaci k Pampelišce?“ zkontroluj přesměrování na <b>claude.ai</b>, nech zaškrtnutý zápis a klikni na <b>Povolit</b>.</li>
          <li>V konverzaci zapni konektor Pampeliška v nabídce nástrojů.</li>
        </ol>
      </div>
      <div className="col" style={{ gap: 8, padding: 14, borderRadius: 'var(--radius-sm)', background: 'var(--surface-2)' }}>
        <span className="row" style={{ fontWeight: 800 }}><Terminal size={18} /> Claude Code</span>
        <ol style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13 }}>
          <li>V terminálu přidej server:<div style={{ marginTop: 6 }}><CopyField value={command} mono /></div></li>
          <li>Spusť <code>/mcp</code>, vyber <b>pampeliska</b> → <b>Authenticate</b>, přihlas se Googlem a povol přístup (přesměrování na <b>localhost</b>).</li>
        </ol>
      </div>
    </div>
  )
  if (compact)
    return (
      <div className="col" style={{ gap: 10 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink-2)' }}>Adresa MCP serveru pro Claude</span>
        <CopyField value={url} />
        {steps}
      </div>
    )
  return (
    <div className="col" style={{ gap: 14 }}>
      <span className="muted" style={{ fontSize: 13 }}>
        Claude přes MCP nahraje pohyby z výpisu, navrhne kategorie a pravidla a umí číst celý přehled financí. Přihlašuješ se
        stejným Google účtem jako sem – žádné klíče se nikam nekopírují.
      </span>
      <div className="col" style={{ gap: 6 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink-2)' }}>Adresa MCP serveru</span>
        <CopyField value={url} />
      </div>
      {steps}
      <div className="col" style={{ gap: 6 }}>
        <span style={{ fontSize: 13, fontWeight: 700 }}>Co můžeš Claudovi zadat</span>
        <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: 'var(--ink-2)', display: 'flex', flexDirection: 'column', gap: 3 }}>
          {examples.map((e) => <li key={e}>„{e}“</li>)}
        </ul>
      </div>
    </div>
  )
}

export function McpGuideCard() {
  return (
    <Card>
      <h2 style={{ fontSize: 20 }}>Připojení Clauda (MCP)</h2>
      <McpSetupGuide />
    </Card>
  )
}
