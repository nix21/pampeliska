import { hierarchy, treemap, treemapSquarify, type HierarchyRectangularNode } from 'd3-hierarchy'
import { useMemo, useRef } from 'react'
import { useElementWidth } from './hooks'
import s from './charts.module.css'
import type { ChartNode } from './types'

interface Datum {
  node?: ChartNode
  group?: ChartNode
  children?: Datum[]
}

export interface TreemapProps {
  /** Skupiny s dlaždicemi v children; bez children se vykreslí jako samostatné dlaždice (rozpad jedné kategorie). */
  items: ChartNode[]
  height: number
  formatValue: (v: number) => string
  /** Podíl 0–1 → „24 %“ (štítek skupiny, u plochého režimu za částkou). */
  formatShare?: (share: number) => string
  onTileClick?: (tile: ChartNode, group?: ChartNode) => void
  isDimmed?: (tile: ChartNode, group?: ChartNode) => boolean
}

const pct = (v: number, of: number) => `${((v / of) * 100).toFixed(3)}%`

/** Treemap (d3-hierarchy, squarify): plocha dlaždice odpovídá částce. Skupiny mají rámeček a štítek s podílem. */
export function Treemap({ items, height, formatValue, formatShare, onTileClick, isDimmed }: TreemapProps) {
  const ref = useRef<HTMLDivElement>(null)
  const width = useElementWidth(ref, 640)
  const grouped = items.some((i) => (i.children?.length ?? 0) > 0)
  const total = items.reduce((a, i) => a + Math.max(0, i.value), 0) || 1

  const layout = useMemo(() => {
    const data: Datum = {
      children: items.filter((g) => g.value > 0).map((g) => {
        const kids = grouped ? (g.children ?? []).filter((c) => c.value > 0) : []
        return kids.length ? { node: g, children: kids.map((c) => ({ node: c, group: g })) } : { node: g }
      }),
    }
    const root = hierarchy<Datum>(data, (d) => d.children)
      .sum((d) => (d.children ? 0 : Math.max(0, d.node?.value ?? 0)))
      .sort((a, b) => (b.value ?? 0) - (a.value ?? 0))
    return treemap<Datum>()
      .tile(treemapSquarify)
      .size([width, height])
      .paddingOuter((n) => (grouped && n.depth === 1 ? 3 : 0))(root)
  }, [items, grouped, width, height])

  const groups = (layout.children ?? []) as HierarchyRectangularNode<Datum>[]
  const leaves = layout.leaves().filter((l) => l.depth > 0)
  const box = (n: HierarchyRectangularNode<Datum>) => ({
    left: pct(n.x0, width), top: pct(n.y0, height), width: pct(n.x1 - n.x0, width), height: pct(n.y1 - n.y0, height),
  })
  const labeled = new Set(groups.filter((g) => grouped && g.x1 - g.x0 >= 90 && g.y1 - g.y0 >= 50).map((g) => g.data.node!.id))

  return (
    <div ref={ref} className={s.treemap} style={{ height }}>
      {leaves.map((l) => {
        const node = l.data.node!
        const group = l.data.group
        const w = l.x1 - l.x0
        const h = l.y1 - l.y0
        const groupLabeled = group ? labeled.has(group.id) : labeled.has(node.id)
        const parentTop = l.parent && l.parent.depth > 0 ? l.parent.y0 : l.y0
        const own = !group && grouped // skupina bez dlaždic – název už je na štítku
        const show = !own && w >= 64 && h >= (groupLabeled && l.y0 - parentTop < 34 ? 76 : 42)
        const clickable = !!onTileClick && !node.disabled
        return (
          <div key={`${group?.id ?? ''}:${node.id}`} className={s.tile}
            title={node.title ?? `${group ? `${group.label} › ` : ''}${node.label} · ${formatValue(node.value)}`}
            style={{ ...box(l), background: node.color, opacity: isDimmed?.(node, group) ? 0.4 : 1, cursor: clickable ? 'pointer' : 'default' }}
            onClick={() => clickable && onTileClick?.(node, group)}>
            {show && (
              <>
                <span className={s.tileName}>{node.label}</span>
                <span className={s.tileValue}>
                  {formatValue(node.value)}{!grouped && formatShare ? ` · ${formatShare(node.value / total)}` : ''}
                </span>
              </>
            )}
          </div>
        )
      })}
      {grouped && groups.map((g) => {
        const node = g.data.node!
        return (
          <div key={`g${node.id}`} className={s.group} style={box(g)}>
            {labeled.has(node.id) && (
              <span className={s.groupChip}>
                <span className={s.groupDot} style={{ background: node.color }} />
                <span className="ellipsis">{node.label}</span>
                {formatShare && <span className={s.groupShare}>{formatShare(node.value / total)}</span>}
              </span>
            )}
          </div>
        )
      })}
    </div>
  )
}
