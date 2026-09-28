import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { api, notifyError, notifyOk } from '../lib/api'
import { relative } from '../lib/format'
import { useUi } from '../state/ui'
import { Avatar, Button, Pill } from './ui'

export interface McpConnection {
  id: number
  clientName: string
  redirectHost: string
  userEmail: string
  scope: string
  createdAt: string
  lastUsedAt?: string
  expiresAt: string
}

/** Připojení klienti (OAuth granty k MCP) s dvoukrokovým odebráním. */
export function McpConnections() {
  const { household } = useUi()
  const qc = useQueryClient()
  const q = useQuery({ queryKey: ['mcp-connections'], queryFn: () => api.get<McpConnection[]>('/api/mcp/connections') })
  const [confirm, setConfirm] = useState<number | null>(null)
  const list = q.data ?? []
  const revoke = async (c: McpConnection) => {
    try {
      await api.del(`/api/mcp/connections/${c.id}`)
      notifyOk(`${c.clientName} odpojen`)
      setConfirm(null)
      qc.invalidateQueries({ queryKey: ['mcp-connections'] })
    } catch (e) {
      notifyError(e)
    }
  }
  if (list.length === 0) return <span className="faint" style={{ fontSize: 13 }}>Zatím není připojený žádný klient.</span>
  return (
    <div className="col" style={{ gap: 0 }}>
      {list.map((c, i) => {
        const m = household.members.find((x) => x.email.toLowerCase() === c.userEmail.toLowerCase())
        const write = c.scope.includes('pampeliska.write')
        const stale = c.lastUsedAt && Date.now() - new Date(c.lastUsedAt).getTime() > 60 * 86_400_000
        const armed = confirm === c.id
        return (
          <div key={c.id} className="row" style={{
            gap: 12, padding: '12px 10px', borderTop: i ? '1px solid var(--line)' : undefined, borderRadius: armed ? 10 : 0,
            background: armed ? 'color-mix(in oklch, var(--neg) 8%, var(--surface))' : undefined, flexWrap: 'wrap',
          }}>
            <Avatar name={m?.name ?? c.userEmail} color={m?.colorToken} size={32} />
            <div className="col grow" style={{ gap: 2 }}>
              <span className="row wrap" style={{ gap: 6, fontSize: 14, fontWeight: 700 }}>
                {c.clientName}
                <Pill tone={write ? 'dark' : 'neutral'}>{write ? 'Čtení a zápis' : 'Jen čtení'}</Pill>
              </span>
              <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>
                pro {m?.name ?? c.userEmail} · {c.redirectHost} · vydán {relative(c.createdAt)}
              </span>
            </div>
            <span style={{ fontSize: 12, color: stale ? 'var(--warn)' : 'var(--ink-3)', whiteSpace: 'nowrap' }}>
              {c.lastUsedAt ? `naposledy ${relative(c.lastUsedAt)}` : 'zatím nepoužit'}
            </span>
            {armed ? (
              <span className="row" style={{ gap: 6 }}>
                <Button size="sm" variant="danger" onClick={() => revoke(c)}>Opravdu odebrat</Button>
                <Button size="sm" variant="ghost" onClick={() => setConfirm(null)}>Zpět</Button>
              </span>
            ) : (
              <Button size="sm" variant="ghost" onClick={() => setConfirm(c.id)}>Odebrat</Button>
            )}
          </div>
        )
      })}
    </div>
  )
}
