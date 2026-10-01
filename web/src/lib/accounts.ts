import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { api } from './api'
import type { Account, AccountGroup } from './types'

export const GROUP_ORDER: AccountGroup[] = ['Current', 'Savings', 'Foreign', 'Investment']

/** Pořadí účtů v celé aplikaci: podle skupiny (jako na stránce Účty), uvnitř skupiny podle nastaveného pořadí z API. */
export const sortAccounts = (list: Account[]) =>
  list.map((a, i) => ({ a, i })).sort((x, y) => GROUP_ORDER.indexOf(x.a.group) - GROUP_ORDER.indexOf(y.a.group) || x.i - y.i).map((x) => x.a)

export const accountsQuery = { queryKey: ['accounts'], queryFn: async () => sortAccounts(await api.get<Account[]>('/api/accounts')) }

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
