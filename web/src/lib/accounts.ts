import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { api } from './api'
import type { Account } from './types'

export const accountsQuery = { queryKey: ['accounts'], queryFn: () => api.get<Account[]>('/api/accounts') }

/** Účty (bez archivovaných) + mapa podle id. */
export function useAccounts() {
  const q = useQuery(accountsQuery)
  return useMemo(() => {
    const list = q.data ?? []
    return { list, byId: new Map(list.map((a) => [a.id, a])), isLoading: q.isLoading }
  }, [q.data, q.isLoading])
}

export const groupLabel: Record<Account['group'], string> = {
  Current: 'Běžné účty',
  Savings: 'Spořicí',
  Foreign: 'Cizí měny',
  Investment: 'Investiční',
}
