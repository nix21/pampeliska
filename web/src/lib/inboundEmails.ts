// Přijaté e-maily z bank (notifikace a výpisy): DTO a dotazy.
import { useQuery, type QueryClient } from '@tanstack/react-query'
import { api } from './api'

export type InboundEmailState = 'Received' | 'Imported' | 'Statement' | 'NotMovement' | 'Quarantined' | 'NeedsAccount' | 'Failed'
export type InboundEmailSource = 'Smtp' | 'Upload'

export interface InboundEmailRow {
  id: number
  receivedAt: string
  source: InboundEmailSource
  fromName?: string
  fromAddress?: string
  subject?: string
  state: InboundEmailState
  sizeBytes: number
  attachmentCount: number
  preview?: string
}

export interface InboundAttachment {
  name: string
  contentType: string
  sizeBytes: number
}

export interface InboundEmailDetail {
  email: InboundEmailRow
  envelopeFrom?: string
  envelopeTo?: string
  remoteIp?: string
  sentAt?: string
  messageId?: string
  textBody?: string
  error?: string
  hasRaw: boolean
  rawPurgedAt?: string
  attachments: InboundAttachment[]
}

export interface InboundAddress {
  address: string
  receivingEnabled: boolean
  lastReceivedAt?: string
  last30Days: number
  retentionDays: number
}

export type EmailFilter = 'all' | 'todo' | 'done' | 'not'

/** Popisek stavu a barva tečky. */
export const STATE_META: Record<InboundEmailState, [string, string]> = {
  Received: ['Přijato', 'var(--ink-3)'],
  Imported: ['Zapsáno', 'var(--pos)'],
  Statement: ['Výpis načten', 'var(--pos)'],
  NotMovement: ['Není pohyb', 'var(--ink-3)'],
  Quarantined: ['Karanténa', 'var(--warn)'],
  NeedsAccount: ['Vyberte účet', 'var(--warn)'],
  Failed: ['Nepřečteno', 'var(--neg)'],
}

const FILTER_STATES: Record<Exclude<EmailFilter, 'all'>, InboundEmailState[]> = {
  todo: ['Quarantined', 'NeedsAccount', 'Failed'],
  done: ['Imported', 'Statement'],
  not: ['NotMovement'],
}

export const matchesFilter = (e: InboundEmailRow, f: EmailFilter) => f === 'all' || FILTER_STATES[f].includes(e.state)

export function useInboundEmails() {
  return useQuery({ queryKey: ['inbound-emails'], queryFn: () => api.get<InboundEmailRow[]>('/api/inbound-emails'), refetchInterval: 60_000 })
}

export function useInboundEmail(id: number | null) {
  return useQuery({
    queryKey: ['inbound-email', id], enabled: id != null,
    queryFn: () => api.get<InboundEmailDetail>(`/api/inbound-emails/${id}`),
  })
}

export function useInboundAddress() {
  return useQuery({ queryKey: ['inbound-address'], queryFn: () => api.get<InboundAddress>('/api/inbound-emails/address') })
}

export function invalidateInboundEmails(qc: QueryClient) {
  return Promise.all(['inbound-emails', 'inbound-email', 'inbound-address', 'badges'].map((k) => qc.invalidateQueries({ queryKey: [k] })))
}

export function senderLabel(e: Pick<InboundEmailRow, 'fromName' | 'fromAddress'>) {
  return e.fromName || e.fromAddress || 'Neznámý odesílatel'
}
