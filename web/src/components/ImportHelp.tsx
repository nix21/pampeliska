import { Upload } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { CopyField, McpSetupGuide } from './McpSetupGuide'
import { Button, Callout, Dialog, type ButtonProps } from './ui'

const PROMPT = 'Tady je výpis z banky. Nahraj pohyby do Pampelišky na správný účet, navrhni kategorie a u opakujících se obchodníků navrhni pravidla.'

/**
 * „Nahrát výpis“ / „Stáhnout přes MCP“: pohyby do Pampelišky posílá Claude přes MCP (výpis mu uživatel předá).
 * Tlačítko otevře dialog s návodem a ukázkovým zadáním.
 */
export function ImportHelpButton({ children = 'Nahrát výpis', icon = <Upload size={16} />, ...rest }: { children?: ReactNode; icon?: ReactNode } & Omit<ButtonProps, 'onClick'>) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button icon={icon} {...rest} onClick={() => setOpen(true)}>{children}</Button>
      <ImportHelpDialog open={open} onOpenChange={setOpen} />
    </>
  )
}

export function ImportHelpDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  return (
    <Dialog wide open={open} onOpenChange={onOpenChange} title="Nahrát výpis přes Clauda"
      description="Pohyby do Pampelišky posílá Claude přes MCP. Výpis (PDF, CSV nebo text z bankovnictví) mu předej v konverzaci.">
      <Callout tone="info">
        Claude pohyby nahraje do nové dávky jako nepotvrzené, pozná duplicity a převody mezi účty, navrhne kategorie
        a pak je jen potvrdíš v <b>Ke kategorizaci</b>. Pravidelné stahování z banky (Enable Banking) připravujeme.
      </Callout>
      <div className="col" style={{ gap: 6 }}>
        <span style={{ fontSize: 13, fontWeight: 700 }}>Ukázkové zadání pro Clauda</span>
        <CopyField value={PROMPT} />
      </div>
      <McpSetupGuide compact />
    </Dialog>
  )
}
