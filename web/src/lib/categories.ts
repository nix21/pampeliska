import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { api } from './api'
import type { BudgetPeriod, CategoryKind, NeedType } from './types'

/** Uzel stromu kategorií z GET /api/categories (pořadí: předek před potomky). */
export interface CategoryNode {
  id: number
  parentId?: number
  kind: CategoryKind
  name: string
  depth: number
  sortOrder: number
  /** Barva hlavní kategorie (token c1…c12, pos) – platí pro celý podstrom. */
  color: string
  ownColor?: string
  need: NeedType
  effectiveNeed: NeedType
  inheritedFrom?: string
  budgetPeriod: BudgetPeriod
  budgetAmount?: number
  carryOver: boolean
  isFixed: boolean
  /** „Jídlo › Supermarkety“ */
  path: string
  topId: number
}

export interface Categories {
  list: CategoryNode[]
  byId: Map<number, CategoryNode>
  children: Map<number | undefined, CategoryNode[]>
  /** Barva pro vykreslení: hlavní kategorie plně, podkategorie světlejší odstín. */
  colorOf: (id?: number | null) => string
  nameOf: (id?: number | null) => string
  /** Id kategorie + všech potomků */
  descendants: (id: number) => Set<number>
}

export const categoriesQuery = { queryKey: ['categories'], queryFn: () => api.get<CategoryNode[]>('/api/categories') }

/** Stupně odstínu podle hloubky (prototyp: 100 %, 70 %, 48 %, 34 %). */
const SHADES = [100, 70, 48, 34]

export function shade(color: string, depth: number) {
  const c = color.startsWith('var(') ? color : `var(--${color})`
  const pct = SHADES[Math.min(depth, SHADES.length - 1)]
  return pct === 100 ? c : `color-mix(in oklch, ${c} ${pct}%, var(--surface))`
}

export function useCategories(): Categories & { isLoading: boolean } {
  const q = useQuery(categoriesQuery)
  return useMemo(() => {
    const list = q.data ?? []
    const byId = new Map(list.map((c) => [c.id, c]))
    const children = new Map<number | undefined, CategoryNode[]>()
    for (const c of list) {
      const arr = children.get(c.parentId) ?? []
      arr.push(c)
      children.set(c.parentId, arr)
    }
    const descendants = (id: number) => {
      const set = new Set<number>([id])
      const stack = [id]
      while (stack.length) for (const ch of children.get(stack.pop()!) ?? []) if (!set.has(ch.id)) (set.add(ch.id), stack.push(ch.id))
      return set
    }
    return {
      list, byId, children, descendants, isLoading: q.isLoading,
      colorOf: (id) => {
        const c = id != null ? byId.get(id) : undefined
        return c ? shade(c.color, c.depth) : 'var(--none)'
      },
      nameOf: (id) => (id != null ? byId.get(id)?.name ?? '?' : 'Nezařazeno'),
    }
  }, [q.data, q.isLoading])
}

export const needLabel: Record<NeedType, string> = { Need: 'Nezbytné', Joy: 'Pro radost', None: 'Neoznačeno', Inherit: 'Zdědit' }
export const needShort: Record<NeedType, string> = { Need: 'Nezb.', Joy: 'Radost', None: '—', Inherit: 'Zdědit' }
export const needColor: Record<NeedType, string> = { Need: 'var(--need)', Joy: 'var(--joy)', None: 'var(--none)', Inherit: 'var(--none)' }
